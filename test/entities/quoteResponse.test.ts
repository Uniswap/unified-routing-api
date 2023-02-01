import { TradeType } from '@uniswap/sdk-core';

import { ClassicQuote, ClassicQuoteDataJSON, DutchLimitQuote, DutchLimitQuoteJSON } from '../../lib/entities/quotes';
import { DutchLimitConfig, DutchLimitConfigJSON } from '../../lib/entities/routing';
import { AMOUNT_IN, CHAIN_IN_ID, DL_CONFIG, FILLER, OFFERER, TOKEN_IN, TOKEN_OUT } from '../constants';

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

const CLASSIC_QUOTE_JSON: ClassicQuoteDataJSON = {
  quoteId: '0xquoteId',
  amount: AMOUNT_IN,
  amountDecimals: '18',
  quote: '2000000',
  quoteDecimals: '18',
  quoteGasAdjusted: AMOUNT_IN,
  quoteGasAdjustedDecimals: '18',
  gasUseEstimate: '100',
  gasUseEstimateQuote: '100',
  gasUseEstimateQuoteDecimals: '18',
  gasUseEstimateUSD: '100',
  simulationStatus: 'asdf',
  gasPriceWei: '10000',
  blockNumber: '1234',
  route: [],
  routeString: 'USD-ETH',
};

describe('QuoteResponse', () => {
  let config: DutchLimitConfig;
  beforeAll(() => {
    config = DutchLimitConfig.fromRequestBody(DL_CONFIG as DutchLimitConfigJSON);
  });

  it('parses dutch limit quote from param-api properly', () => {
    expect(() => DutchLimitQuote.fromResponseBodyAndConfig(config, DL_QUOTE_JSON)).not.toThrow();
  });

  it('produces dutch limit order info from param-api respone and config', () => {
    const quote = DutchLimitQuote.fromResponseBodyAndConfig(config, DL_QUOTE_JSON);
    expect(quote.toOrder()).toMatchObject({
      offerer: OFFERER,
      nonce: '100',
      input: {
        token: TOKEN_IN,
        startAmount: AMOUNT_IN,
        endAmount: AMOUNT_IN,
      },
      outputs: [
        {
          token: TOKEN_OUT,
          startAmount: AMOUNT_IN,
          endAmount: AMOUNT_IN,
          recipient: OFFERER,
          isFeeOutput: false,
        },
      ],
    });
  });

  it('parses classic quote exactInput', () => {
    const quote = ClassicQuote.fromResponseBody(CLASSIC_QUOTE_JSON, TradeType.EXACT_INPUT);
    expect(quote.toJSON()).toEqual(CLASSIC_QUOTE_JSON);
    expect(quote.amountIn.toString()).toEqual(CLASSIC_QUOTE_JSON.amount);
    expect(quote.amountOut.toString()).toEqual(CLASSIC_QUOTE_JSON.quote);
  });

  it('parses classic quote exactOutput', () => {
    const quote = ClassicQuote.fromResponseBody(CLASSIC_QUOTE_JSON, TradeType.EXACT_OUTPUT);
    expect(quote.toJSON()).toEqual(CLASSIC_QUOTE_JSON);
    expect(quote.amountIn.toString()).toEqual(CLASSIC_QUOTE_JSON.quote);
    expect(quote.amountOut.toString()).toEqual(CLASSIC_QUOTE_JSON.amount);
  });
});
