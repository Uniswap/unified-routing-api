import { MethodParameters } from '@uniswap/smart-order-router';
import { V2PoolInRoute, V3PoolInRoute } from '@uniswap/universal-router-sdk';
import { RoutingType } from '../../lib/constants';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchQuoteJSON,
  DutchQuoteRequest,
  Quote,
  QuoteRequest,
  RelayQuote,
  RelayQuoteJSON,
  RelayRequest,
} from '../../lib/entities';
import { DutchQuoteFactory } from '../../lib/entities/quote/DutchQuoteFactory';
import { Portion } from '../../lib/fetchers/PortionFetcher';

type ReceivedQuoteData = DutchQuoteJSON | ClassicQuoteDataJSON;

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
    case RoutingType.DUTCH_V2:
      return DutchQuoteFactory.fromResponseBody(request as DutchQuoteRequest, quote as DutchQuoteJSON, nonce, portion);
    case RoutingType.CLASSIC:
      // TODO: figure out how to determine tradetype from output JSON
      // also: is this parsing quote responses even needed outside of testing?
      return ClassicQuote.fromResponseBody(request, quote as ClassicQuoteDataJSON);
    case RoutingType.RELAY:
      return RelayQuote.fromResponseBody(request as RelayRequest, quote as RelayQuoteJSON, nonce);
    default:
      throw new Error(`Unknown routing type: ${routing}`);
  }
}
