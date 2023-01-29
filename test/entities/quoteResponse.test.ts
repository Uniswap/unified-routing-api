import { QuoteResponse, QuoteResponseJSON } from '../../lib/entities/QuoteResponse';
import { DutchLimitQuote, DutchLimitQuoteJSON } from '../../lib/entities/quotes';
import { AMOUNT_IN, CHAIN_IN_ID, FILLER, OFFERER, TOKEN_IN, TOKEN_OUT } from '../constants';

const DL_QUOTE_JSON: DutchLimitQuoteJSON = {
  chainId: CHAIN_IN_ID,
  requestId: '0xrequestId',
  tokenIn: TOKEN_IN,
  amountIn: AMOUNT_IN,
  tokenOut: TOKEN_OUT,
  amountOut: AMOUNT_IN,
  offerer: OFFERER,
  filler: FILLER,
};

const QUOTE_RESPONSE_JSON: QuoteResponseJSON = {
  routing: 'DUTCH_LIMIT',
  quote: DL_QUOTE_JSON,
};

describe('QuoteResponse', () => {
  it('parses dutch limit quote from param-api properly', () => {
    const quote = DutchLimitQuote.fromResponseBody(DL_QUOTE_JSON);
    expect(quote.toJSON()).toEqual(DL_QUOTE_JSON);
  });

  it('parses the winning quote properly', () => {
    const quote = QuoteResponse.fromResponseBody(QUOTE_RESPONSE_JSON);
    expect(quote.toJSON()).toEqual(QUOTE_RESPONSE_JSON);
  });
});
