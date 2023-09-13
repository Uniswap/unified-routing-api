import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, TradeType } from '@uniswap/sdk-core';

import {
  CachingTokenListProvider,
  ID_TO_CHAIN_ID,
  NodeJSCache,
  WRAPPED_NATIVE_CURRENCY,
} from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';
import NodeCache from 'node-cache';
import { QuoteByKey, QuoteContext } from '.';
import { DEFAULT_ROUTING_API_DEADLINE, NATIVE_ADDRESS, RoutingType } from '../../constants';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  ClassicRequest,
  DutchQuote,
  DutchRequest,
  Quote,
  QuoteRequest,
} from '../../entities';
import { SyntheticStatusProvider } from '../../providers';
import { Erc20__factory } from '../../types/ext/factories/Erc20__factory';
import { metrics } from '../../util/metrics';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
const GAS_PROPORTION_THRESHOLD_BPS = 1500;
const BPS = 10000;
const RFQ_QUOTE_UPPER_BOUND_MULTIPLIER = 3;

export type DutchQuoteContextProviders = {
  rpcProvider: ethers.providers.JsonRpcProvider;
  syntheticStatusProvider: SyntheticStatusProvider;
};

// manages context around a single top level classic quote request
export class DutchQuoteContext implements QuoteContext {
  routingType: RoutingType.DUTCH_LIMIT;
  private log: Logger;
  private rpcProvider: ethers.providers.JsonRpcProvider;
  private syntheticStatusProvider: SyntheticStatusProvider;

  public requestKey: string;
  public classicKey: string;
  public routeToNativeKey: string;
  public needsRouteToNative: boolean;

  constructor(_log: Logger, public request: DutchRequest, providers: DutchQuoteContextProviders) {
    this.log = _log.child({ context: 'DutchQuoteContext' });
    this.rpcProvider = providers.rpcProvider;
    this.syntheticStatusProvider = providers.syntheticStatusProvider;
    this.requestKey = this.request.key();
    this.needsRouteToNative = false;
  }

  // Dutch quotes have two external dependencies:
  // - classic request to compare with
  // - classic request to check for route back to ETH
  dependencies(): QuoteRequest[] {
    const classicRequest = new ClassicRequest(this.request.info, {
      protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
      simulateFromAddress: this.request.config.swapper,
      deadline: DEFAULT_ROUTING_API_DEADLINE,
      recipient: this.request.config.swapper,
    });
    this.classicKey = classicRequest.key();
    this.log.info({ classicRequest: classicRequest.info }, 'Adding synthetic classic request');

    const result = [this.request, classicRequest];

    const wrappedNativeAddress = WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(this.request.info.tokenOutChainId)].address;
    if (this.request.info.tokenOut !== wrappedNativeAddress && this.request.info.tokenOut !== NATIVE_ADDRESS) {
      this.needsRouteToNative = true;
      const routeBackToNativeRequest = new ClassicRequest(
        {
          ...this.request.info,
          type: TradeType.EXACT_OUTPUT,
          tokenIn: this.request.info.tokenOut,
          amount: ethers.utils.parseEther('1'),
          tokenOut: wrappedNativeAddress,
        },
        {
          protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
        }
      );
      this.routeToNativeKey = routeBackToNativeRequest.key();
      result.push(routeBackToNativeRequest);

      this.log.info(
        { routeBackToNativeRequest: routeBackToNativeRequest.info },
        'Adding synthetic back to native classic request'
      );
    }

    return result;
  }

  async resolveHandler(dependencies: QuoteByKey): Promise<Quote | null> {
    const classicQuote = dependencies[this.classicKey] as ClassicQuote;
    const routeBackToNative = dependencies[this.routeToNativeKey] as ClassicQuote;
    const rfqQuote = dependencies[this.requestKey] as DutchQuote;

    const [quote, syntheticQuote] = await Promise.all([
      this.getRfqQuote(rfqQuote, classicQuote),
      this.getSyntheticQuote(classicQuote, routeBackToNative),
    ]);

    // handle cases where we only either have RFQ or synthetic
    if (!quote && !syntheticQuote) {
      this.log.warn('No quote or synthetic quote available');
      return null;
    } else if (!syntheticQuote) {
      return quote;
    } else if (!quote) {
      return syntheticQuote;
    }

    // return the better of the two
    if (this.request.info.type === TradeType.EXACT_INPUT) {
      return quote.amountOut.gte(syntheticQuote.amountOut) ? quote : syntheticQuote;
    } else {
      return quote.amountIn.lte(syntheticQuote.amountIn) ? quote : syntheticQuote;
    }
  }

  // return either the rfq quote or a synthetic quote from the classic dependency
  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    const quote = await this.resolveHandler(dependencies);
    if (!quote || (quote as DutchQuote).amountOutEnd.eq(0)) return null;
    return quote;
  }

  async getRfqQuote(quote?: DutchQuote, classicQuote?: ClassicQuote): Promise<DutchQuote | null> {
    if (!quote) return null;

    // if quote tokens are not in tokenlist return null
    // TODO: make uniswapx-specific tokenlist
    const tokenList = new CachingTokenListProvider(quote.chainId, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
    const [tokenIn, tokenOut] = await Promise.all([
      tokenList.getTokenByAddress(quote.tokenIn),
      tokenList.getTokenByAddress(quote.tokenOut),
    ]);
    if (!tokenIn && quote.tokenIn !== NATIVE_ADDRESS) {
      this.log.info(`Token ${quote.tokenIn} not in tokenlist, skipping rfq`);
      return null;
    }

    if (!tokenOut && quote.tokenOut !== NATIVE_ADDRESS) {
      this.log.info(`Token ${quote.tokenOut} not in tokenlist, skipping rfq`);
      return null;
    }

    // order too small; rfq quote not usable
    if (classicQuote && !this.hasOrderSize(this.log, classicQuote)) {
      this.log.info('Order size too small, skipping rfq');
      return null;
    }

    // TODO: remove after reputation system is ready
    // drop Rfq quote if it's significantly better than classic - high chance MM will fade
    if (classicQuote) {
      metrics.putMetric(`HasBothRfqAndClassicQuote`, 1);

      if (this.rfqQuoteTooGood(quote, classicQuote)) {
        this.log.info(
          {
            tradeType: TradeType[classicQuote.request.info.type],
            rfqIn: quote.amountIn.toString(),
            rfqOut: quote.amountOut.toString(),
            classicIn: classicQuote.amountInGasAdjusted.toString(),
            classicOut: classicQuote.amountOutGasAdjusted.toString(),
          },
          'Rfq quote at least 300% better than classic, skipping'
        );
        metrics.putMetric(`RfqQuoteDropped-PriceTooGood`, 1);
        return null;
      }
    }

    const reparameterized = DutchQuote.reparameterize(quote, classicQuote as ClassicQuote, {
      hasApprovedPermit2: await this.hasApprovedPermit2(quote.request),
    });
    // if its invalid for some reason, i.e. too much decay then return null
    if (!reparameterized.validate()) return null;
    return reparameterized;
  }

  // transform a classic quote into a synthetic dutch quote
  // if it makes sense to do so
  async getSyntheticQuote(classicQuote?: Quote, routeBackToNative?: Quote): Promise<DutchQuote | null> {
    // no classic quote to build synthetic from
    if (!classicQuote) {
      this.log.info('No classic quote, skipping synthetic');
      return null;
    }

    // no route back to eth; classic quote not usable
    if (this.needsRouteToNative && !routeBackToNative) {
      this.log.info('No route to native quote, skipping synthetic');
      return null;
    }

    // order too small; classic quote not usable
    if (!this.hasOrderSize(this.log, classicQuote)) {
      this.log.info('Order size too small, skipping synthetic');
      return null;
    }

    const syntheticStatus = await this.syntheticStatusProvider.getStatus(this.request.info);
    // if the useSyntheticQuotes override is not set, and the request is not eligible for synthetic, return null
    if (!this.request.config.useSyntheticQuotes && !syntheticStatus.syntheticEnabled) {
      this.log.info('Synthetic not enabled, skipping synthetic');
      return null;
    }

    return DutchQuote.fromClassicQuote(this.request, classicQuote as ClassicQuote);
  }

  hasOrderSize(log: Logger, classicQuote: Quote): boolean {
    const classicQuoteData = classicQuote.toJSON() as ClassicQuoteDataJSON;

    const routingApiQuote = BigNumber.from(classicQuoteData.quote);
    const routingApiQuoteGasAdjusted = BigNumber.from(classicQuoteData.quoteGasAdjusted);
    // quote - quoteGasAdjusted = gas adjustement in output token if exactInput (gasAdjustment is less output)
    // quoteGasAdjusted - quote = gas adjustement in input token if exactOutput (gasAdjustment is more input)
    const gasUsedQuote =
      classicQuote.request.info.type === TradeType.EXACT_INPUT
        ? routingApiQuote.sub(routingApiQuoteGasAdjusted)
        : routingApiQuoteGasAdjusted.sub(routingApiQuote);

    if (gasUsedQuote.eq(0)) {
      log.info('No gas estimate for quote, not filtering', classicQuote);
      return true;
    }

    const quoteGasThreshold = routingApiQuote.mul(GAS_PROPORTION_THRESHOLD_BPS).div(BPS);

    if (gasUsedQuote.gte(quoteGasThreshold)) {
      log.info(
        { routingApiQuote: routingApiQuote.toString(), gasUsedQuote: gasUsedQuote.toString() },
        'Removing UniswapX quote due to gas cost'
      );
      return false;
    }
    return true;
  }

  rfqQuoteTooGood(quote: DutchQuote, classicQuote: ClassicQuote): boolean {
    if (quote.request.info.type === TradeType.EXACT_INPUT) {
      return quote.amountOut.gt(classicQuote.amountOutGasAdjusted.mul(RFQ_QUOTE_UPPER_BOUND_MULTIPLIER));
    } else {
      return quote.amountIn.lt(classicQuote.amountInGasAdjusted.div(RFQ_QUOTE_UPPER_BOUND_MULTIPLIER));
    }
  }

  async hasApprovedPermit2(request: DutchRequest): Promise<boolean> {
    // either swapper was not set or is zero address
    if (!request.info.swapper || request.info.swapper == NATIVE_ADDRESS) return false;

    const tokenInAddress =
      request.info.tokenIn == NATIVE_ADDRESS
        ? WRAPPED_NATIVE_CURRENCY[request.info.tokenInChainId as ChainId].address
        : request.info.tokenIn;
    const tokenContract = Erc20__factory.connect(tokenInAddress, this.rpcProvider);
    const permit2Allowance = await tokenContract.allowance(request.info.swapper, PERMIT2_ADDRESS);

    if (request.info.type == TradeType.EXACT_OUTPUT) {
      // If exactOutput, we don't know how much tokenIn will be needed
      // so we just check if allowance is > max uint256 / 2
      return permit2Allowance.gte(BigNumber.from(2).pow(255));
    }
    // TODO: Fix for exact output
    return permit2Allowance.gte(request.info.amount);
  }
}
