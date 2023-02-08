import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import { QuoteFilter } from '.';
import { ClassicQuoteDataJSON, Quote, QuoteRequest, RoutingType } from '../../entities';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
const GAS_PROPORTION_THRESHOLD_BPS = 1000;
const BPS = 10000;

// filters out any gouda orders which are too small to be worth filling
// NOTE: there must also be a routing-api quote response for this filter to function
// as that is where we get the gas cost information from
export class GoudaOrderSizeFilter implements QuoteFilter {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'GoudaOrderSizeFilter' });
  }

  async filter(_requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
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
    const routingApiQuoteGasAdjusted = BigNumber.from(routingApiQuoteData.quoteGasAdjusted);
    // quote - quoteGasAdjusted = gas adjustement in output token if exactInput (gasAdjustment is less output)
    // quoteGasAdjusted - quote = gas adjustement in input token if exactOutput (gasAdjustment is more input)
    const gasUsedQuote =
      routingApiResponse.request.info.type === TradeType.EXACT_INPUT
        ? routingApiQuote.sub(routingApiQuoteGasAdjusted)
        : routingApiQuoteGasAdjusted.sub(routingApiQuote);

    if (gasUsedQuote.eq(0)) {
      this.log.info('No gas estimate for quote, not filtering', routingApiResponse);
      return quotes;
    }

    const goudaQuote =
      goudaResponse.request.info.type === TradeType.EXACT_INPUT ? goudaResponse.amountOut : goudaResponse.amountIn;
    const quoteGasThreshold = goudaQuote.mul(GAS_PROPORTION_THRESHOLD_BPS).div(BPS);

    this.log.info({
      gasUsedQuote: gasUsedQuote.toString(),
      quoteGasThreshold: quoteGasThreshold.toString(),
      routingApiQuoteGasAdjusted: routingApiQuoteGasAdjusted.toString(),
      goudaQuote: goudaQuote.toString(),
    });

    // the gas used is less than the threshold, so no filtering
    if (gasUsedQuote.lt(quoteGasThreshold)) {
      return quotes;
    }
    this.log.info('Filtering UniswapX quote due to gas cost');
    return [routingApiResponse];
  }
}
