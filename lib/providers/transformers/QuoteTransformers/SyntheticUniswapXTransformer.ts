import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';

import { QuoteTransformer } from '..';
import { SUPPORTED_CHAINS } from '../../../config/chains';
import { DutchLimitQuote, Quote, QuoteRequest } from '../../../entities';
import { ClassicQuote } from '../../../entities/quote/ClassicQuote';
import { DutchLimitRequest } from '../../../entities/request/DutchLimitRequest';
import { requestInfoEquals } from '../../../entities/request/index';
import { RoutingType } from '../../../constants';

// if UniswapX is requested, makes competitive UniswapX quotes
// from routing-API classic quote data
export class SyntheticUniswapXTransformer implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'SyntheticGoudaTransformer' });
  }

  async transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const dutchRequests: DutchLimitRequest[] = requests.filter(
      (r) => r.routingType === RoutingType.DUTCH_LIMIT
    ) as DutchLimitRequest[];
    const classicQuotes: ClassicQuote[] = quotes.filter((q) => q.routingType === RoutingType.CLASSIC) as ClassicQuote[];

    // UniswapX not requested, don't do anything
    if (dutchRequests.length === 0) {
      this.log.info('UniswapX not requested, skipping transformer');
      return quotes;
    }

    // TODO: remove this once rfq api can handle exact output
    if (dutchRequests.some((r) => r.info.type === TradeType.EXACT_OUTPUT)) {
      this.log.info('UniswapX does not support exact output, skipping transformer');
      return quotes;
    }

    if (dutchRequests.some((r) => !SUPPORTED_CHAINS[RoutingType.DUTCH_LIMIT].includes(r.info.tokenInChainId))) {
      this.log.info('UniswapX does not support tokenInChainId, skipping transformer');
      return quotes;
    }

    if (classicQuotes.length === 0) {
      this.log.error('Classic quote not available, skipping transformer');
      return quotes;
    }

    const syntheticQuotes = [];
    // for each dutch request, create synthetic quotes for each _matching_ classic quote
    for (const dutchRequest of dutchRequests) {
      const matchingClassicQuotes = classicQuotes.filter((q) => requestInfoEquals(q.request.info, dutchRequest.info));
      for (const quote of matchingClassicQuotes) {
        syntheticQuotes.push(DutchLimitQuote.fromClassicQuote(dutchRequest, quote));
      }
    }

    this.log.info({ synthQuotes: syntheticQuotes }, 'Synthetic UniswapX quotes');
    return [...quotes, ...syntheticQuotes];
  }
}
