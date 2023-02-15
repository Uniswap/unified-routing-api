import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import { QuoteTransformer } from '..';
import { ClassicQuoteDataJSON, Quote, QuoteRequest, RoutingType } from '../../../entities';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
const GAS_PROPORTION_THRESHOLD_BPS = 1000;
const BPS = 10000;

// filters out any UniswapX orders which are too small to be worth filling
// NOTE: there must also be a routing-api quote response for this filter to function
// as that is where we get the gas cost information from
export class UniswapXOrderSizeFilter implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'UniswapXOrderSizeFilter' });
  }

  async transform(_requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const routingApiResponse: Quote | undefined = quotes.find((quote) => quote.routingType === RoutingType.CLASSIC);

    if (!routingApiResponse) {
      this.log.error('Missing routing api response');
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

    // filter any dutch quotes that are too small relative to gas
    return quotes.filter((quote) => {
      if (quote.routingType !== RoutingType.DUTCH_LIMIT) {
        return true;
      }

      const uniswapXQuote = quote.request.info.type === TradeType.EXACT_INPUT ? quote.amountOut : quote.amountIn;
      const quoteGasThreshold = uniswapXQuote.mul(GAS_PROPORTION_THRESHOLD_BPS).div(BPS);

      // the gas used is less than the threshold, so no filtering
      if (gasUsedQuote.gte(quoteGasThreshold)) {
        this.log.info(
          { uniswapXQuote: uniswapXQuote, gasUsedQuote: gasUsedQuote },
          'Removing UniswapX quote due to gas cost'
        );
        return false;
      }

      return true;
    });
  }
}
