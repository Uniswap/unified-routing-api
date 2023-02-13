import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';

import { QuoteTransformer } from '..';
import { Quote, QuoteRequest, RequestByRoutingType, RoutingType } from '../../../entities';
import { ClassicQuote } from '../../../entities/quote/ClassicQuote';

export class NoRouteBackToNativeFilter implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'NoRouteBackToEthFilter' });
  }

  async transform(originalRequests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const requestByRoutingType: RequestByRoutingType = {};
    originalRequests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    if (!requestByRoutingType[RoutingType.DUTCH_LIMIT]) {
      this.log.debug('UniswapX not requested, skipping filter');
      return quotes;
    }

    if (
      quotes.some(
        (quote) =>
          quote.routingType === RoutingType.CLASSIC &&
          quote.request.info.tokenIn === requestByRoutingType[RoutingType.CLASSIC]?.info.tokenOut &&
          quote.request.info.type === TradeType.EXACT_OUTPUT &&
          quote.amountIn.eq((quote as ClassicQuote).amountInGasAdjusted)
      )
    ) {
      this.log.debug('No route back to native asset. Removing UniswapX quotes');
      return quotes.filter((quote) => quote.routingType === RoutingType.CLASSIC);
    }
    return quotes;
  }
}
