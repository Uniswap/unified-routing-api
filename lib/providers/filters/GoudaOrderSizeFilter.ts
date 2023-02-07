import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import { QuoteRequest, Quote, RoutingType, ClassicQuoteDataJSON } from '../../entities';
import { QuoteFilter } from '.';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
const GAS_PROPORTION_THRESHOLD_BPS = 1000;

// filters out any gouda orders which are too small to be worth filling
// NOTE: there must also be a routing-api quote response for this filter to function
// as that is where we get the gas cost information from
export class GoudaOrderSizeFilter implements QuoteFilter {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'OnlyConfiguredQuotersFilter' });
  }

  async filter(request: QuoteRequest, quotes: Quote[]): Promise<Quote[]> {
    let routingApiResponse: Quote | null = null;
    let goudaResponse: Quote | null = null;

    // TODO: throw if multiple of one type?
    for (const quote of quotes) {
      if (quote.routingType === RoutingType.CLASSIC) {
        routingApiResponse = quote;
      } else if (quote.routingType === RoutingType.DUTCH_LIMIT) {
        goudaResponse = quote;
      }
    }

    if (!routingApiResponse) {
      this.log.error('Missing routing api response');
      return quotes;
    }

    if (!goudaResponse) {
      this.log.error('Missing gouda response');
      return quotes;
    }

    const routingApiQuoteData = routingApiResponse.toJSON() as ClassicQuoteDataJSON;
    const routingApiQuote = BigNumber.from(routingApiQuoteData.quote);
    // quote - quoteGasAdjusted = gas adjustement in output token
    const gasUsedInOutput = routingApiQuote.sub(routingApiQuoteData.quoteGasAdjusted);
  }
}
