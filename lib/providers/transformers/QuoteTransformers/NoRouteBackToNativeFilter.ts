import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';

import { QuoteTransformer } from '..';
import { Quote, QuoteRequest, RequestByRoutingType } from '../../../entities';
import { ClassicQuote } from '../../../entities/quote/ClassicQuote';
import { RoutingType } from '../../../constants';

export class NoRouteBackToNativeFilter implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'NoRouteBackToEthFilter' });
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
          quote.request.info.tokenIn === requestByRoutingType[RoutingType.DUTCH_LIMIT]?.info.tokenOut &&
          quote.request.info.tokenOut ===
            WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(quote.request.info.tokenOutChainId)].address &&
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
