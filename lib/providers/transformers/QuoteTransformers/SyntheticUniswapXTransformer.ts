import Logger from 'bunyan';

import { DutchLimitQuote, Quote, QuoteRequest } from '../../../entities';
import { ClassicQuote } from '../../../entities/quote/ClassicQuote';
import { DutchLimitRequest } from '../../../entities/request/DutchLimitRequest';
import { RequestByRoutingType, RoutingType } from '../../../entities/request/index';
import { QuoteTransformer } from '..';

export class SyntheticUniswapXTransformer implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'SyntheticGoudaTransformer' });
  }

  async transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const quoteByRoutingType: { [key in RoutingType]?: Quote } = {};
    const requestByRoutingType: RequestByRoutingType = {};
    quotes.forEach((q) => (quoteByRoutingType[q.routingType] = q));
    requests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    // UniswapX not requested, don't do anything
    if (!requestByRoutingType[RoutingType.DUTCH_LIMIT]) {
      this.log.info('UniswapX not requested, skipping transformer');
      return quotes;
    }
    // should we throw at this point?
    if (!quoteByRoutingType[RoutingType.CLASSIC]) {
      this.log.error('Classic quote not available, skipping transformer');
      return quotes;
    }

    let synthUniXQuote: DutchLimitQuote;
    const classicQuote = quoteByRoutingType[RoutingType.CLASSIC] as ClassicQuote;
    if (!quoteByRoutingType[RoutingType.DUTCH_LIMIT]) {
      synthUniXQuote = DutchLimitQuote.fromClassicQuote(
        requestByRoutingType[RoutingType.DUTCH_LIMIT] as DutchLimitRequest,
        classicQuote
      );
    } else {
      synthUniXQuote = (quoteByRoutingType[RoutingType.DUTCH_LIMIT] as DutchLimitQuote).transformWithClassicQuote(
        classicQuote
      );
    }

    this.log.info({ synthQuote: synthUniXQuote }, 'Synthetic UniswapX quote');
    return [...quotes, synthUniXQuote];
  }
}
