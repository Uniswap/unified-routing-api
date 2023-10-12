import { MethodParameters } from '@uniswap/smart-order-router';
import { RoutingType } from '../../lib/constants';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchQuote,
  DutchQuoteJSON,
  DutchRequest,
  Quote,
  QuoteRequest,
} from '../../lib/entities';
import { Portion } from '../../lib/fetchers/PortionFetcher';

type ReceivedQuoteData = DutchQuoteJSON | ClassicQuoteDataJSON;

type TokenInRoute = {
  address: string;
  chainId: number;
  symbol: string;
  decimals: string;
};

type V3PoolInRoute = {
  type: 'v3-pool';
  address: string;
  tokenIn: TokenInRoute;
  tokenOut: TokenInRoute;
  sqrtRatioX96: string;
  liquidity: string;
  tickCurrent: string;
  fee: string;
  amountIn?: string;
  amountOut?: string;
};

type V2Reserve = {
  token: TokenInRoute;
  quotient: string;
};

type V2PoolInRoute = {
  type: 'v2-pool';
  address: string;
  tokenIn: TokenInRoute;
  tokenOut: TokenInRoute;
  reserve0: V2Reserve;
  reserve1: V2Reserve;
  amountIn?: string;
  amountOut?: string;
};

export type RoutingApiQuoteResponse = {
  quoteId: string;
  amount: string;
  amountDecimals: string;
  quote: string;
  quoteDecimals: string;
  quoteGasAdjusted: string;
  quoteGasAdjustedDecimals: string;
  gasUseEstimate: string;
  gasUseEstimateQuote: string;
  gasUseEstimateQuoteDecimals: string;
  gasUseEstimateUSD: string;
  simulationError?: boolean;
  simulationStatus: string;
  gasPriceWei: string;
  blockNumber: string;
  route: Array<(V3PoolInRoute | V2PoolInRoute)[]>;
  routeString: string;
  methodParameters?: MethodParameters;
};

export function buildQuoteResponse(
  body: { routing: RoutingType; quote: ReceivedQuoteData },
  request: QuoteRequest,
  nonce?: string,
  portion?: Portion
): Quote {
  return parseQuote(request, body.routing, body.quote, nonce, portion);
}

function parseQuote(
  request: QuoteRequest,
  routing: RoutingType,
  quote: ReceivedQuoteData,
  nonce?: string,
  portion?: Portion
): Quote {
  switch (routing) {
    case RoutingType.DUTCH_LIMIT:
      return DutchQuote.fromResponseBody(request as DutchRequest, quote as DutchQuoteJSON, nonce, portion);
    case RoutingType.CLASSIC:
      // TODO: figure out how to determine tradetype from output JSON
      // also: is this parsing quote responses even needed outside of testing?
      return ClassicQuote.fromResponseBody(request, quote as ClassicQuoteDataJSON);
    default:
      throw new Error(`Unknown routing type: ${routing}`);
  }
}
