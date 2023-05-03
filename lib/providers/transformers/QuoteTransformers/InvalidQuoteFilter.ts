import Logger from 'bunyan';

import { TradeType } from '@uniswap/sdk-core';
import { QuoteTransformer } from '..';
import { RoutingType } from '../../../constants';
import { Quote, QuoteRequest, RequestByRoutingType } from '../../../entities';

// filters out any quote responses that are deemed 'invalid'
export class InvalidQuoteFilter implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'InvalidQuoteFilter' });
  }

  async transform(originalRequests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const requestByRoutingType: RequestByRoutingType = {};
    originalRequests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    return quotes.filter((quote) => {
      if (quote.routingType === RoutingType.DUTCH_LIMIT) {
        if (
          (quote.request.info.type === TradeType.EXACT_INPUT && quote.amountOut.eq(0)) ||
          (quote.request.info.type === TradeType.EXACT_OUTPUT && quote.amountIn.eq(0))
        ) {
          this.log.info({ quote: quote }, `Removing invalid quote: quoted amount is zero`);
          return false;
        }
      }
      return true;
    });
  }
}
