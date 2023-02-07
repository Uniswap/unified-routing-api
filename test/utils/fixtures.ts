import { TradeType } from '@uniswap/sdk-core';

import { RoutingType } from '../../lib/entities/routing';
import { QuoteRequest } from '../../lib/entities/QuoteRequest';
import { AMOUNT_IN, CHAIN_IN_ID, CHAIN_OUT_ID, OFFERER, TOKEN_IN, TOKEN_OUT } from '../constants';
import { buildQuoteResponse } from './quoteResponse';

const baseQuote = {
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  requestId: 'requestId',
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_INPUT',
};

export const QUOTE_REQUEST_CLASSIC = QuoteRequest.fromRequestBody({
  ...baseQuote,
  configs: [
    {
      routingType: 'CLASSIC',
      protocols: ['v3'],
      gasPriceWei: '12',
    },
  ],
});

export const QUOTE_REQUEST_DL = QuoteRequest.fromRequestBody({
  ...baseQuote,
  configs: [
    {
      routingType: 'DUTCH_LIMIT',
      offerer: OFFERER,
      exclusivePeriodSecs: 12,
      auctionPeriodSecs: 60,
    },
  ],
});

export const QUOTE_REQUEST_MULTI = QuoteRequest.fromRequestBody({
  ...baseQuote,
  configs: [
    {
      routingType: 'DUTCH_LIMIT',
      offerer: OFFERER,
      exclusivePeriodSecs: 12,
      auctionPeriodSecs: 60,
    },
    {
      routingType: 'CLASSIC',
      protocols: ['v3'],
      gasPriceWei: '12',
    },
  ],
});

const DL_QUOTE_DATA = {
  routing: 'DUTCH_LIMIT',
  quote: {
    chainId: 1,
    requestId: 'requestId',
    tokenIn: 'tokenIn',
    amountIn: '1',
    tokenOut: 'tokenOut',
    amountOut: '1',
    offerer: 'offerer',
  },
};

const CLASSIC_QUOTE_DATA = {
  routing: 'CLASSIC',
  quote: {
    quoteId: '1',
    amount: '1',
    amountDecimals: '18',
    quote: '1',
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
  },
};

export const DL_QUOTE_EXACT_IN_BETTER = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, type: RoutingType.DUTCH_LIMIT, amountOut: '2' } })
);
export const DL_QUOTE_EXACT_IN_WORSE = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountOut: '1' } })
);
export const DL_QUOTE_EXACT_OUT_BETTER = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountIn: '1' } })
);
export const DL_QUOTE_EXACT_OUT_WORSE = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountIn: '2' } })
);
export const CLASSIC_QUOTE_EXACT_IN_BETTER = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '2' } })
);
export const CLASSIC_QUOTE_EXACT_IN_WORSE = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '1' } })
);
export const CLASSIC_QUOTE_EXACT_OUT_BETTER = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '1' } }),
  TradeType.EXACT_OUTPUT
);
export const CLASSIC_QUOTE_EXACT_OUT_WORSE = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '2' } }),
  TradeType.EXACT_OUTPUT
);
