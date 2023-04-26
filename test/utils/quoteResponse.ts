import { RoutingType } from '../../lib/constants';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchLimitQuote,
  DutchLimitQuoteJSON,
  DutchLimitRequest,
  Quote,
  QuoteRequest,
} from '../../lib/entities';

type ReceivedQuoteData = DutchLimitQuoteJSON | ClassicQuoteDataJSON;

export function buildQuoteResponse(
  body: {
    routing: RoutingType;
    quote: ReceivedQuoteData;
  },
  request: QuoteRequest
): Quote {
  return parseQuote(request, body.routing, body.quote);
}

function parseQuote(request: QuoteRequest, routing: RoutingType, quote: ReceivedQuoteData): Quote {
  switch (routing) {
    case RoutingType.DUTCH_LIMIT:
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return DutchLimitQuote.fromResponseBody(request as DutchLimitRequest, quote as DutchLimitQuoteJSON);
    case RoutingType.CLASSIC:
      // TODO: figure out how to determine tradetype from output JSON
      // also: is this parsing quote responses even needed outside of testing?
      return ClassicQuote.fromResponseBody(request, quote as ClassicQuoteDataJSON);
    default:
      throw new Error(`Unknown routing type: ${routing}`);
  }
}
