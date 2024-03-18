import { ChainId } from '@uniswap/sdk-core';

import Logger from 'bunyan';
import { ethers } from 'ethers';
import { QuoteByKey, QuoteContext } from '.';
import { ClassicQuote, ClassicRequest, Quote, QuoteRequest, RelayQuote } from '..';
import { LARGE_TRADE_USD_THRESHOLD, RoutingType } from '../../constants';
import { getQuoteSizeEstimateUSD } from '../../util/quoteMath';
import { RelayRequest } from '../request/RelayRequest';

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
    // built classic request with all the classic config attributes
    const classicRequest = new ClassicRequest(this.request.info, {
      ...this.request.config,
      // add overrides to prefer top level swapper over nested recipient field in classic config
      simulateFromAddress: this.request.info.swapper,
      recipient: this.request.info.swapper
    });
    this.classicKey = classicRequest.key();
    this.log.info({ classicRequest: classicRequest.info }, 'Adding base classic request');

    return [this.request, classicRequest];
  }

  async resolveHandler(dependencies: QuoteByKey): Promise<Quote | null> {
    const classicQuote = dependencies[this.classicKey] as ClassicQuote;
    const relayQuote = dependencies[this.requestKey] as RelayQuote;

    const [quote] = await Promise.all([this.getRelayQuote(relayQuote, classicQuote)]);

    if (!quote) {
      this.log.warn('No Relay quote');
      return null;
    }

    return quote;
  }

  // return either the relay quote or a constructed relay quote from  classic dependency
  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    const quote = await this.resolveHandler(dependencies);
    if (!quote || (quote as RelayQuote).amountOutEnd.eq(0)) return null;
    return quote;
  }

  async getRelayQuote(quote?: RelayQuote, classicQuote?: ClassicQuote): Promise<RelayQuote | null> {
    // No relay quote or classic quote
    if (!quote && !classicQuote) return null;
    if (!quote && classicQuote) {
      quote = RelayQuote.fromClassicQuote(this.request, classicQuote);
    }

    if (!quote) return null;

    // if its invalid for some reason, i.e. too much decay then return null
    if (!quote.validate()) return null;
    return quote;
  }

  // TODO: might not need, keeping for now
  isLargeOrder(log: Logger, classicQuote: Quote): boolean {
    // gasUseEstimateUSD on other chains seem to be unreliable
    if (
      classicQuote.request.info.tokenInChainId !== ChainId.MAINNET ||
      classicQuote.request.info.tokenOutChainId !== ChainId.MAINNET
    ) {
      return false;
    }
    const quoteSizeEstimateUSD = getQuoteSizeEstimateUSD(classicQuote);
    log.info({ quoteSize: quoteSizeEstimateUSD.toString() }, 'Quote size estimate in USD');
    return quoteSizeEstimateUSD.gte(LARGE_TRADE_USD_THRESHOLD);
  }
}
