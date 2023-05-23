import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import { NATIVE_ADDRESS, RoutingType } from '../../lib/constants';

import {
  ClassicQuoteDataJSON,
  ClassicRequest,
  DutchLimitQuoteJSON,
  DutchLimitRequest,
  parseQuoteRequests,
  QuoteRequestBodyJSON,
} from '../../lib/entities';
import { ClassicQuote, DutchLimitQuote, Quote } from '../../lib/entities/quote';
import { AMOUNT_IN, CHAIN_IN_ID, CHAIN_OUT_ID, FILLER, OFFERER, TOKEN_IN, TOKEN_OUT } from '../constants';
import { buildQuoteResponse } from './quoteResponse';

export const BASE_REQUEST_INFO_EXACT_IN = {
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  requestId: 'requestId',
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_INPUT',
};

export const REQUEST_INFO_ETH_EXACT_IN = {
  ...BASE_REQUEST_INFO_EXACT_IN,
  tokenIn: NATIVE_ADDRESS,
  tokenOut: TOKEN_IN, // Uni
};

export const BASE_REQUEST_INFO_EXACT_OUT = {
  ...BASE_REQUEST_INFO_EXACT_IN,
  type: 'EXACT_OUTPUT',
};

export const QUOTE_REQUEST_BODY_MULTI: QuoteRequestBodyJSON = {
  ...BASE_REQUEST_INFO_EXACT_IN,
  configs: [
    {
      routingType: RoutingType.DUTCH_LIMIT,
      offerer: OFFERER,
      exclusivityOverrideBps: 12,
      auctionPeriodSecs: 60,
    },
    {
      routingType: RoutingType.CLASSIC,
      protocols: ['V3', 'V2', 'MIXED'],
    },
  ],
};

export const DL_REQUEST_BODY = {
  ...BASE_REQUEST_INFO_EXACT_IN,
  configs: [
    {
      routingType: RoutingType.DUTCH_LIMIT,
      offerer: OFFERER,
      exclusivityOverrideBps: 12,
      auctionPeriodSecs: 60,
    },
  ],
};

export const CLASSIC_REQUEST_BODY: QuoteRequestBodyJSON = {
  ...BASE_REQUEST_INFO_EXACT_IN,
  configs: [
    {
      routingType: RoutingType.CLASSIC,
      protocols: ['V3', 'V2', 'MIXED'],
    },
  ],
};

export function makeClassicRequest(overrides: Partial<QuoteRequestBodyJSON>): ClassicRequest {
  const requestInfo = Object.assign({}, BASE_REQUEST_INFO_EXACT_IN, overrides);

  return parseQuoteRequests({
    ...requestInfo,
    configs: [
      {
        routingType: RoutingType.CLASSIC,
        protocols: ['v3'],
        gasPriceWei: '12',
      },
    ],
  }).quoteRequests[0] as ClassicRequest;
}

export const QUOTE_REQUEST_CLASSIC = makeClassicRequest({});

export function makeDutchLimitRequest(overrides: Partial<QuoteRequestBodyJSON>): DutchLimitRequest {
  const requestInfo = Object.assign({}, BASE_REQUEST_INFO_EXACT_IN, overrides);
  return parseQuoteRequests({
    ...requestInfo,
    configs: [
      {
        routingType: RoutingType.DUTCH_LIMIT,
        offerer: OFFERER,
        exclusivityOverrideBps: 12,
        auctionPeriodSecs: 60,
      },
    ],
  }).quoteRequests[0] as DutchLimitRequest;
}

export const QUOTE_REQUEST_DL = makeDutchLimitRequest({});
export const QUOTE_REQUEST_DL_EXACT_OUT = makeDutchLimitRequest({ type: 'EXACT_OUTPUT' });
export const QUOTE_REQUEST_DL_NATIVE_IN = makeDutchLimitRequest({
  tokenIn: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_IN_ID)].address,
});
export const QUOTE_REQUEST_DL_NATIVE_OUT = makeDutchLimitRequest({
  tokenOut: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_OUT_ID)].address,
});

export const { quoteRequests: QUOTE_REQUEST_MULTI } = parseQuoteRequests({
  ...BASE_REQUEST_INFO_EXACT_IN,
  configs: [
    {
      routingType: RoutingType.DUTCH_LIMIT,
      offerer: OFFERER,
      exclusivityOverrideBps: 12,
      auctionPeriodSecs: 60,
    },
    {
      routingType: RoutingType.CLASSIC,
      protocols: ['v3', 'v2', 'mixed'],
      gasPriceWei: '12',
    },
  ],
});

export const QUOTE_REQUEST_ETH_IN_MULTI = parseQuoteRequests({
  ...REQUEST_INFO_ETH_EXACT_IN,
  configs: [
    {
      routingType: RoutingType.DUTCH_LIMIT,
      offerer: OFFERER,
      exclusivityOverrideBps: 12,
      auctionPeriodSecs: 60,
    },
    {
      routingType: RoutingType.CLASSIC,
      protocols: ['v3', 'v2', 'mixed'],
      gasPriceWei: '12',
    },
  ],
});

export const QUOTE_REQUEST_MULTI_EXACT_OUT = parseQuoteRequests({
  ...BASE_REQUEST_INFO_EXACT_OUT,
  configs: [
    {
      routingType: RoutingType.DUTCH_LIMIT,
      offerer: OFFERER,
      exclusivityOverrideBps: 12,
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
    quoteId: 'quoteId',
    tokenIn: TOKEN_IN,
    amountIn: '1',
    tokenOut: TOKEN_OUT,
    amountOut: '1',
    offerer: OFFERER,
    filler: FILLER,
  },
};

export const CLASSIC_QUOTE_DATA = {
  routing: RoutingType.CLASSIC,
  quote: {
    requestId: 'requestId',
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

export function createDutchLimitQuote(overrides: Partial<DutchLimitQuoteJSON>, type: string): DutchLimitQuote {
  return buildQuoteResponse(
    Object.assign({}, DL_QUOTE_DATA, {
      quote: { ...DL_QUOTE_DATA.quote, type: RoutingType.DUTCH_LIMIT, ...overrides },
    }),
    makeDutchLimitRequest({ type })
  ) as DutchLimitQuote;
}

export function createClassicQuote(overrides: Partial<ClassicQuoteDataJSON>, type: string): ClassicQuote {
  return buildQuoteResponse(
    Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, ...overrides } }),
    makeClassicRequest({ type })
  ) as ClassicQuote;
}

export function createRouteBackToNativeQuote(overrides: Partial<ClassicQuoteDataJSON>, type: string): Quote {
  return buildQuoteResponse(
    Object.assign({}, CLASSIC_QUOTE_DATA, {
      quote: {
        ...CLASSIC_QUOTE_DATA.quote,
        ...overrides,
      },
    }),
    makeClassicRequest({
      type: type,
      tokenIn: TOKEN_OUT,
      tokenOut: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_OUT_ID)].address,
    })
  );
}

export const DL_QUOTE_EXACT_IN_BETTER = createDutchLimitQuote({ amountOut: '2' }, 'EXACT_INPUT');
export const DL_QUOTE_NATIVE_EXACT_IN_BETTER = createDutchLimitQuote(
  { amountOut: '2', tokenIn: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_OUT_ID)].address },
  'EXACT_INPUT'
);
export const DL_QUOTE_EXACT_IN_WORSE_PREFERENCE = createDutchLimitQuote({ amountOut: '100000' }, 'EXACT_INPUT');
export const DL_QUOTE_EXACT_IN_WORSE = createDutchLimitQuote({ amountOut: '1' }, 'EXACT_INPUT');
export const DL_QUOTE_EXACT_IN_LARGE = createDutchLimitQuote({ amountOut: '10000' }, 'EXACT_INPUT');
export const DL_QUOTE_EXACT_OUT_BETTER = createDutchLimitQuote({ amountIn: '1' }, 'EXACT_OUTPUT');
export const DL_QUOTE_EXACT_OUT_WORSE = createDutchLimitQuote({ amountIn: '2' }, 'EXACT_OUTPUT');
export const DL_QUOTE_EXACT_OUT_LARGE = createDutchLimitQuote({ amountOut: '10000' }, 'EXACT_INPUT');

export const CLASSIC_QUOTE_EXACT_IN_BETTER_PREFERENCE = createClassicQuote(
  { quote: '100100', quoteGasAdjusted: '100100' },
  'EXACT_INPUT'
);
export const CLASSIC_QUOTE_EXACT_IN_BETTER = createClassicQuote({ quote: '2', quoteGasAdjusted: '2' }, 'EXACT_INPUT');
export const CLASSIC_QUOTE_EXACT_IN_WORSE = createClassicQuote({ quote: '1', quoteGasAdjusted: '1' }, 'EXACT_INPUT');
export const CLASSIC_QUOTE_EXACT_IN_LARGE = createClassicQuote(
  { quote: '10000', quoteGasAdjusted: '9000' },
  'EXACT_INPUT'
);
export const CLASSIC_QUOTE_EXACT_IN_LARGE_GAS = createClassicQuote(
  // quote: 1 ETH, quoteGasAdjusted: 0.9 ETH, gasUseEstimate: 100000, gasUseEstimateQuote: 0.1 ETH
  {
    quote: '10000000000000000000000',
    quoteGasAdjusted: '9000000000000000000000',
    gasUseEstimate: '100000',
    gasUseEstimateQuote: '1000000000000000000000',
  },
  'EXACT_INPUT'
);

export const CLASSIC_QUOTE_EXACT_IN_NATIVE = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, {
    quote: {
      ...CLASSIC_QUOTE_DATA.quote,
      quote: '10000000000000000000000',
      quoteGasAdjusted: '9000000000000000000000',
      gasUseEstimate: '100000',
      gasUseEstimateQuote: '1000000000000000000000',
    },
  }),
  makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: NATIVE_ADDRESS, tokenOut: TOKEN_IN })
);

export const CLASSIC_QUOTE_EXACT_OUT_BETTER = createClassicQuote({ quote: '1', quoteGasAdjusted: '1' }, 'EXACT_OUTPUT');
export const CLASSIC_QUOTE_EXACT_OUT_WORSE = createClassicQuote({ quote: '2', quoteGasAdjusted: '2' }, 'EXACT_OUTPUT');
export const CLASSIC_QUOTE_EXACT_OUT_LARGE = createClassicQuote(
  { quote: '10000', quoteGasAdjusted: '10000' },
  'EXACT_OUTPUT'
);
export const CLASSIC_QUOTE_HAS_ROUTE_TO_NATIVE = createRouteBackToNativeQuote(
  {
    quote: '100',
    quoteGasAdjusted: '98',
  },
  'EXACT_OUTPUT'
);
export const CLASSIC_QUOTE_NO_ROUTE_TO_NATIVE = createRouteBackToNativeQuote(
  {
    quote: '100',
    quoteGasAdjusted: '100',
  },
  'EXACT_OUTPUT'
);

export const DL_PERMIT = {"domain":{"name":"Permit2","chainId":1,"verifyingContract":"0x000000000022d473030f116ddee9f6b43ac78ba3"},"types":{"PermitWitnessTransferFrom":[{"name":"permitted","type":"TokenPermissions"},{"name":"spender","type":"address"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"},{"name":"witness","type":"ExclusiveDutchLimitOrder"}],"TokenPermissions":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"}],"ExclusiveDutchLimitOrder":[{"name":"info","type":"OrderInfo"},{"name":"startTime","type":"uint256"},{"name":"endTime","type":"uint256"},{"name":"exclusiveFiller","type":"address"},{"name":"exclusivityOverrideBps","type":"uint256"},{"name":"inputToken","type":"address"},{"name":"inputStartAmount","type":"uint256"},{"name":"inputEndAmount","type":"uint256"},{"name":"outputs","type":"DutchOutput[]"}],"OrderInfo":[{"name":"reactor","type":"address"},{"name":"offerer","type":"address"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"},{"name":"validationContract","type":"address"},{"name":"validationData","type":"bytes"}],"DutchOutput":[{"name":"token","type":"address"},{"name":"startAmount","type":"uint256"},{"name":"endAmount","type":"uint256"},{"name":"recipient","type":"address"}]},"values":{"permitted":{"token":"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984","amount":{"type":"BigNumber","hex":"0x01"}},"spender":"0xbD7F9D0239f81C94b728d827a87b9864972661eC","nonce":{"type":"BigNumber","hex":"0x01"},"deadline":60,"witness":{"info":{"reactor":"0xbD7F9D0239f81C94b728d827a87b9864972661eC","offerer":"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","nonce":{"type":"BigNumber","hex":"0x01"},"deadline":60,"validationContract":"0x0000000000000000000000000000000000000000","validationData":"0x"},"startTime":0,"endTime":60,"exclusiveFiller":"0x0000000000000000000000000000000000000000","exclusivityOverrideBps":{"type":"BigNumber","hex":"0x0c"},"inputToken":"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984","inputStartAmount":{"type":"BigNumber","hex":"0x01"},"inputEndAmount":{"type":"BigNumber","hex":"0x01"},"outputs":[{"token":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","startAmount":{"type":"BigNumber","hex":"0x2710"},"endAmount":{"type":"BigNumber","hex":"0x26de"},"recipient":"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}]}}}
export const PERMIT2 = { "domain": { "name": "Permit2", "chainId": 1, "verifyingContract": "0x000000000022D473030F116dDEE9F6B43aC78BA3" }, "types": { "PermitSingle": [{ "name": "details", "type": "PermitDetails" }, { "name": "spender", "type": "address" }, { "name": "sigDeadline", "type": "uint256" }], "PermitDetails": [{ "name": "token", "type": "address" }, { "name": "amount", "type": "uint160" }, { "name": "expiration", "type": "uint48" }, { "name": "nonce", "type": "uint48" }] }, "values": { "details": { "token": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "amount": "1461501637330902918203684832716283019655932542975", "expiration": 2592000, "nonce": "0" }, "spender": "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B", "sigDeadline": 1800 } }
export const PERMIT2_POLYGON = { "domain": { "name": "Permit2", "chainId": 137, "verifyingContract": "0x000000000022D473030F116dDEE9F6B43aC78BA3" }, "types": { "PermitSingle": [{ "name": "details", "type": "PermitDetails" }, { "name": "spender", "type": "address" }, { "name": "sigDeadline", "type": "uint256" }], "PermitDetails": [{ "name": "token", "type": "address" }, { "name": "amount", "type": "uint160" }, { "name": "expiration", "type": "uint48" }, { "name": "nonce", "type": "uint48" }] }, "values": { "details": { "token": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "amount": "1461501637330902918203684832716283019655932542975", "expiration": 2592000, "nonce": "0" }, "spender": "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B", "sigDeadline": 1800 } }
