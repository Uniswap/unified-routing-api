import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
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
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  ClassicRequest,
  DutchLimitQuote,
  DutchLimitRequest,
  Quote,
  QuoteRequest,
} from '../../entities';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
const GAS_PROPORTION_THRESHOLD_BPS = 5000;
const BPS = 10000;

// manages context around a single top level classic quote request
export class DutchQuoteContext implements QuoteContext {
  private log: Logger;

  public requestKey: string;
  public classicKey: string;
  public routeToNativeKey: string;
  public needsRouteToNative: boolean;

  constructor(_log: Logger, public request: DutchLimitRequest) {
    this.log = _log.child({ context: 'DutchQuoteContext' });
    this.requestKey = this.request.key();
    this.needsRouteToNative = false;
  }

  // Dutch quotes have two external dependencies:
  // - classic request to compare with
  // - classic request to check for route back to ETH
  dependencies(): QuoteRequest[] {
    const classicRequest = new ClassicRequest(this.request.info, {
      protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
    });
    this.classicKey = classicRequest.key();
    this.log.info({ classicRequest: classicRequest.info }, 'Adding synthetic classic request');

    const result = [this.request, classicRequest];

    const native = WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(this.request.info.tokenOutChainId)].address;
    if (this.request.info.tokenOut !== native) {
      this.needsRouteToNative = true;
      const routeBackToNativeRequest = new ClassicRequest(
        {
          ...this.request.info,
          type: TradeType.EXACT_OUTPUT,
          tokenIn: this.request.info.tokenOut,
          amount: ethers.utils.parseEther('1'),
          tokenOut: native,
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

  // return either the rfq quote or a synthetic quote from the classic dependency
  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    const classicQuote = dependencies[this.classicKey] as ClassicQuote;
    const routeBackToNative = dependencies[this.routeToNativeKey] as ClassicQuote;
    const rfqQuote = dependencies[this.requestKey] as DutchLimitQuote;

    const quote = await this.getRfqQuote(rfqQuote, classicQuote);
    const syntheticQuote = this.getSyntheticQuote(classicQuote, routeBackToNative);

    // handle cases where we only either have RFQ or synthetic
    if (!quote && !syntheticQuote) {
      this.log.warn('No quote or synthetic quote available');
      return null;
    } else if (!quote) {
      return syntheticQuote;
    } else if (!syntheticQuote) {
      return quote;
    }

    // return the better of the two
    if (this.request.info.type === TradeType.EXACT_INPUT) {
      return quote.amountOut.gte(syntheticQuote.amountOut) ? quote : syntheticQuote;
    } else {
      return quote.amountIn.lte(syntheticQuote.amountIn) ? quote : syntheticQuote;
    }
  }

  async getRfqQuote(quote?: DutchLimitQuote, classicQuote?: ClassicQuote): Promise<DutchLimitQuote | null> {
    if (!quote) return null;

    // if quote tokens are not in tokenlist return null
    // TODO: make gouda-specific tokenlist
    const tokenList = new CachingTokenListProvider(quote.chainId, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
    const [tokenIn, tokenOut] = await Promise.all([
      tokenList.getTokenByAddress(quote.tokenIn),
      tokenList.getTokenByAddress(quote.tokenOut),
    ]);
    if (!tokenIn) {
      this.log.info(`Token ${quote.tokenIn} not in tokenlist, skipping rfq`);
      return null;
    }

    if (!tokenOut) {
      this.log.info(`Token ${quote.tokenOut} not in tokenlist, skipping rfq`);
      return null;
    }

    return DutchLimitQuote.reparameterize(quote, classicQuote as ClassicQuote);
  }

  // transform a classic quote into a synthetic dutch quote
  // if it makes sense to do so
  getSyntheticQuote(classicQuote?: Quote, routeBackToNative?: Quote): DutchLimitQuote | null {
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
    if (!this.hasOrderSizeForSynthetic(this.log, classicQuote)) {
      this.log.info('Order size too small, skipping synthetic');
      return null;
    }

    return DutchLimitQuote.fromClassicQuote(this.request, classicQuote as ClassicQuote);
  }

  hasOrderSizeForSynthetic(log: Logger, classicQuote: Quote): boolean {
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
}
