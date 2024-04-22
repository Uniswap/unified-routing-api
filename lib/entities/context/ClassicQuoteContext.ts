import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import Logger from 'bunyan';
import { QuoteByKey, QuoteContext } from '.';
import { RoutingType } from '../../constants';
import { ClassicQuote, ClassicRequest, Quote, QuoteRequest } from '../../entities';
import { Permit2Fetcher } from '../../fetchers/Permit2Fetcher';

export type ClassicQuoteContextProviders = {
  permit2Fetcher: Permit2Fetcher;
};

// manages context around a single top level classic quote request
export class ClassicQuoteContext implements QuoteContext {
  private log: Logger;
  private permit2Fetcher: Permit2Fetcher;

  constructor(_log: Logger, public request: ClassicRequest, providers: ClassicQuoteContextProviders) {
    this.log = _log.child({ context: 'ClassicQuoteContext' });
    this.permit2Fetcher = providers.permit2Fetcher;
  }

  // classic quotes have no explicit dependencies and can be resolved by themselves
  dependencies(): QuoteRequest[] {
    return [this.request];
  }

  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    this.log.info({ dependencies }, 'Resolving classic quote');
    const quote = dependencies[this.request.key()];

    if (!quote) return null;

    if (quote.request.info.swapper && quote.routingType === RoutingType.CLASSIC) {
      const allowance = await this.permit2Fetcher.fetchAllowance(
        quote.request.info.tokenInChainId,
        quote.request.info.swapper,
        quote.request.info.tokenIn,
        UNIVERSAL_ROUTER_ADDRESS(quote.request.info.tokenInChainId)
      );

      (quote as ClassicQuote).setAllowanceData(allowance);
    }

    return quote;
  }
}
