import { DutchLimitOrder, parseValidation, ValidationType } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchLimitQuote,
  DutchLimitQuoteJSON,
  DutchLimitRequest,
} from '../../../../lib/entities';
import { AMOUNT_IN, CHAIN_IN_ID, FILLER, OFFERER, TOKEN_IN, TOKEN_OUT } from '../../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  QUOTE_REQUEST_DL,
} from '../../../utils/fixtures';

const DL_QUOTE_JSON: DutchLimitQuoteJSON = {
  chainId: CHAIN_IN_ID,
  requestId: '0xrequestId',
  quoteId: '0xquoteId',
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
  const config: DutchLimitRequest = QUOTE_REQUEST_DL;

  it('parses dutch limit quote from param-api properly', () => {
    expect(() => DutchLimitQuote.fromResponseBody(config, DL_QUOTE_JSON)).not.toThrow();
  });

  it('produces dutch limit order info from param-api response and config', () => {
    const quote = DutchLimitQuote.fromResponseBody(config, DL_QUOTE_JSON);
    expect(quote.toOrder().toJSON()).toMatchObject({
      offerer: OFFERER,
      input: {
        token: TOKEN_IN,
        startAmount: AMOUNT_IN,
        endAmount: AMOUNT_IN,
      },
      outputs: [
        {
          token: TOKEN_OUT,
          startAmount: AMOUNT_IN,
          endAmount: BigNumber.from(AMOUNT_IN).mul(995).div(1000).toString(), // default 5% slippage
          recipient: OFFERER,
        },
      ],
    });
    const order = DutchLimitOrder.fromJSON(quote.toOrder().toJSON(), quote.chainId);
    expect(order.info.exclusiveFiller).toEqual(FILLER);
    expect(order.info.exclusivityOverrideBps.toString()).toEqual('12');

    expect(BigNumber.from(quote.toOrder().toJSON().nonce).gt(0)).toBeTruthy();
  });

  it('produces dutch limit order info from param-api response and config without filler', () => {
    const quote = DutchLimitQuote.fromResponseBody(config, Object.assign({}, DL_QUOTE_JSON, { filler: undefined }));
    expect(quote.toOrder().toJSON()).toMatchObject({
      offerer: OFFERER,
      input: {
        token: TOKEN_IN,
        startAmount: AMOUNT_IN,
        endAmount: AMOUNT_IN,
      },
      outputs: [
        {
          token: TOKEN_OUT,
          startAmount: AMOUNT_IN,
          endAmount: BigNumber.from(AMOUNT_IN).mul(995).div(1000).toString(), // default 0.5% slippage
          recipient: OFFERER,
        },
      ],
    });
    const order = DutchLimitOrder.fromJSON(quote.toOrder().toJSON(), quote.chainId);
    const parsedValidation = parseValidation(order.info);
    expect(parsedValidation.type).toEqual(ValidationType.None);
    expect(BigNumber.from(quote.toOrder().toJSON().nonce).gt(0)).toBeTruthy();
  });

  it('parses classic quote exactInput', () => {
    const quote = ClassicQuote.fromResponseBody(CLASSIC_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_JSON);
    expect(quote.toJSON()).toMatchObject({ ...CLASSIC_QUOTE_JSON, quoteId: expect.any(String) });
    expect(quote.amountIn.toString()).toEqual(CLASSIC_QUOTE_JSON.amount);
    expect(quote.amountOut.toString()).toEqual(CLASSIC_QUOTE_JSON.quote);
  });

  it('parses classic quote exactOutput', () => {
    const quote = ClassicQuote.fromResponseBody(CLASSIC_QUOTE_EXACT_OUT_BETTER.request, CLASSIC_QUOTE_JSON);
    expect(quote.toJSON()).toMatchObject({ ...CLASSIC_QUOTE_JSON, quoteId: expect.any(String) });
    expect(quote.amountIn.toString()).toEqual(CLASSIC_QUOTE_JSON.quote);
    expect(quote.amountOut.toString()).toEqual(CLASSIC_QUOTE_JSON.amount);
  });
});
