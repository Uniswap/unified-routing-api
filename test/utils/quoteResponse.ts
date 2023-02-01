import { TradeType } from '@uniswap/sdk-core';

import { QuoteResponse, QuoteResponseJSON } from '../../lib/entities/QuoteResponse';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchLimitQuote,
  DutchLimitQuoteJSON,
  Quote,
  QuoteJSON,
} from '../../lib/entities/quotes';
import { RoutingType } from '../../lib/entities/routing';

export function buildQuoteResponse(
  body: QuoteResponseJSON,
  tradeType: TradeType = TradeType.EXACT_INPUT
): QuoteResponse {
  return new QuoteResponse(
    RoutingType[body.routing as keyof typeof RoutingType],
    parseQuote(body.routing, body.quote, tradeType)
  );
}

function parseQuote(routing: string, quote: QuoteJSON, tradeType: TradeType): Quote {
  switch (routing) {
    case RoutingType.DUTCH_LIMIT:
      return DutchLimitQuote.fromResponseBody(quote as DutchLimitQuoteJSON);
    case RoutingType.CLASSIC:
      // TODO: figure out how to determine tradetype from output JSON
      // also: is this parsing quote responses even needed outside of testing?
      return ClassicQuote.fromResponseBody(quote as ClassicQuoteDataJSON, tradeType);
    default:
      throw new Error(`Unknown routing type: ${routing}`);
  }
}
