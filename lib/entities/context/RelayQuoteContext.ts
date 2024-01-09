import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, TradeType } from '@uniswap/sdk-core';

import { WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';
import { QuoteByKey, QuoteContext } from '.';
import { DEFAULT_ROUTING_API_DEADLINE, LARGE_TRADE_USD_THRESHOLD, NATIVE_ADDRESS, RoutingType } from '../../constants';
import {
  ClassicQuote,
  ClassicRequest,
  RelayQuote,
  Quote,
  QuoteRequest,
} from '..';
import { Erc20__factory } from '../../types/ext/factories/Erc20__factory';
import { RelayRequest } from '../request/RelayRequest';
import { getQuoteSizeEstimateUSD } from '../../util/quoteMath';

export type RelayQuoteContextProviders = {
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
};

// manages context around a single top level classic quote request
export class RelayQuoteContext implements QuoteContext {
  routingType: RoutingType.RELAY;
  private log: Logger;
  private rpcProvider: ethers.providers.StaticJsonRpcProvider;

  public requestKey: string;
  public classicKey: string;
  public routeToNativeKey: string;
  public needsRouteToNative: boolean;

  constructor(_log: Logger, public request: RelayRequest, providers: RelayQuoteContextProviders) {
    this.log = _log.child({ context: 'RelayQuoteContext' });
    this.rpcProvider = providers.rpcProvider;
    this.requestKey = this.request.key();
  }

  // Relay quotes have one external dependencies:
  // - classic request to be built from
  dependencies(): QuoteRequest[] {
    const classicRequest = new ClassicRequest(this.request.info, {
      protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
      simulateFromAddress: this.request.config.swapper,
      deadline: DEFAULT_ROUTING_API_DEADLINE,
      recipient: this.request.config.swapper,
      gasToken: this.request.config.gasToken,
    });
    this.classicKey = classicRequest.key();
    this.log.info({ classicRequest: classicRequest.info }, 'Adding base classic request');

    return [this.request, classicRequest];
  }

  async resolveHandler(dependencies: QuoteByKey): Promise<Quote | null> {
    const classicQuote = dependencies[this.classicKey] as ClassicQuote;
    const relayQuote = dependencies[this.requestKey] as RelayQuote;

    const [quote] = await Promise.all([
      this.getRelayQuote(relayQuote, classicQuote),
    ]);

    // handle cases where we only either have RFQ or synthetic
    if (!quote) {
      this.log.warn('No classic quote, cannot make Relay quote');
      return null;
    }

    return quote;
  }

  // return either the rfq quote or a synthetic quote from the classic dependency
  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    const quote = await this.resolveHandler(dependencies);
    if (!quote || (quote as RelayQuote).amountOutEnd.eq(0)) return null;
    return quote;
  }

  async getRelayQuote(quote?: RelayQuote, classicQuote?: ClassicQuote): Promise<RelayQuote | null> {
    if (!quote || !classicQuote) return null;

    // TODO: validate tokens, gas tokens, etc.
    // add checks for too large price impact, etc.

    const reparameterized = RelayQuote.reparameterize(quote, classicQuote, {
      hasApprovedPermit2: await this.hasApprovedPermit2(this.request),
      largeTrade: this.isLargeOrder(this.log, classicQuote),
    });

    // if its invalid for some reason, i.e. too much decay then return null
    if (!reparameterized.validate()) return null;
    return reparameterized;
  }

  // TODO: might not need, keeping for now
  isLargeOrder(log: Logger, classicQuote: Quote): boolean {
    // gasUseEstimateUSD on other chains seem to be unreliable
    if (classicQuote.request.info.tokenInChainId !== ChainId.MAINNET || classicQuote.request.info.tokenOutChainId !== ChainId.MAINNET) {
      return false;
    }
    const quoteSizeEstimateUSD = getQuoteSizeEstimateUSD(classicQuote);
    log.info({ quoteSize: quoteSizeEstimateUSD.toString() }, 'Quote size estimate in USD');
    return quoteSizeEstimateUSD.gte(LARGE_TRADE_USD_THRESHOLD);
  }

  async hasApprovedPermit2(request: RelayRequest): Promise<boolean> {
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
