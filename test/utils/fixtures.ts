import {
  ClassicQuoteDataJSON,
  ClassicRequest,
  DutchLimitQuoteJSON,
  DutchLimitRequest,
  parseQuoteRequests,
  Quote,
  QuoteRequestBodyJSON,
  RoutingType,
} from '../../lib/entities';
import { AMOUNT_IN, CHAIN_IN_ID, CHAIN_OUT_ID, OFFERER, TOKEN_IN, TOKEN_OUT } from '../constants';
import { buildQuoteResponse } from './quoteResponse';

export const BASE_REQUEST_INFO = {
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  requestId: 'requestId',
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_INPUT',
};

function makeClassicRequest(overrides: Partial<QuoteRequestBodyJSON>): ClassicRequest {
  const requestInfo = Object.assign({}, BASE_REQUEST_INFO, overrides);

  return parseQuoteRequests({
    ...requestInfo,
    configs: [
      {
        routingType: RoutingType.CLASSIC,
        protocols: ['v3'],
        gasPriceWei: '12',
      },
    ],
  })[0] as ClassicRequest;
}

export const QUOTE_REQUEST_CLASSIC = makeClassicRequest({});

function makeDutchLimitRequest(overrides: Partial<QuoteRequestBodyJSON>): DutchLimitRequest {
  const requestInfo = Object.assign({}, BASE_REQUEST_INFO, overrides);
  return parseQuoteRequests({
    ...requestInfo,
    configs: [
      {
        routingType: RoutingType.DUTCH_LIMIT,
        offerer: OFFERER,
        exclusivePeriodSecs: 12,
        auctionPeriodSecs: 60,
      },
    ],
  })[0] as DutchLimitRequest;
}

export const QUOTE_REQUEST_DL = makeDutchLimitRequest({});

export const QUOTE_REQUEST_MULTI = parseQuoteRequests({
  ...BASE_REQUEST_INFO,
  configs: [
    {
      routingType: RoutingType.DUTCH_LIMIT,
      offerer: OFFERER,
      exclusivePeriodSecs: 12,
      auctionPeriodSecs: 60,
    },
    {
      routingType: RoutingType.CLASSIC,
      protocols: ['v3'],
      gasPriceWei: '12',
    },
  ],
});

const DL_QUOTE_DATA = {
  routing: RoutingType.DUTCH_LIMIT,
  quote: {
    chainId: 1,
    requestId: 'requestId',
    tokenIn: TOKEN_IN,
    amountIn: '1',
    tokenOut: TOKEN_OUT,
    amountOut: '1',
    offerer: OFFERER,
  },
};

const CLASSIC_QUOTE_DATA = {
  routing: RoutingType.CLASSIC,
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
    simulationStatus: 'start',
    gasPriceWei: '10000',
    blockNumber: '1234',
    route: [],
    routeString: 'USD-ETH',
  },
};

function dlQuote(overrides: Partial<DutchLimitQuoteJSON>, type: string): Quote {
  return buildQuoteResponse(
    Object.assign({}, DL_QUOTE_DATA, {
      quote: { ...DL_QUOTE_DATA.quote, type: RoutingType.DUTCH_LIMIT, ...overrides },
    }),
    makeDutchLimitRequest({ type })
  );
}

function classicQuote(overrides: Partial<ClassicQuoteDataJSON>, type: string): Quote {
  return buildQuoteResponse(
    Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, ...overrides } }),
    makeClassicRequest({ type })
  );
}

export const DL_QUOTE_EXACT_IN_BETTER = dlQuote({ amountOut: '2' }, 'EXACT_INPUT');
export const DL_QUOTE_EXACT_IN_WORSE = dlQuote({ amountOut: '1' }, 'EXACT_INPUT');
export const DL_QUOTE_EXACT_OUT_BETTER = dlQuote({ amountIn: '1' }, 'EXACT_OUTPUT');
export const DL_QUOTE_EXACT_OUT_WORSE = dlQuote({ amountIn: '2' }, 'EXACT_OUTPUT');

export const CLASSIC_QUOTE_EXACT_IN_BETTER = classicQuote({ quote: '2' }, 'EXACT_INPUT');
export const CLASSIC_QUOTE_EXACT_IN_WORSE = classicQuote({ quote: '1' }, 'EXACT_INPUT');
export const CLASSIC_QUOTE_EXACT_OUT_BETTER = classicQuote({ quote: '1' }, 'EXACT_OUTPUT');
export const CLASSIC_QUOTE_EXACT_OUT_WORSE = classicQuote({ quote: '2' }, 'EXACT_OUTPUT');
