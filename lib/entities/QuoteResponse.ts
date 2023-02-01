import { TradeType } from '@uniswap/sdk-core';

import { ClassicQuote, ClassicQuoteDataJSON, DutchLimitQuote, DutchLimitQuoteJSON, Quote, QuoteJSON } from './quotes';
import { RoutingType } from './routing';

export interface QuoteResponseData {
  routing: RoutingType;
  quote: Quote;
}

export interface QuoteResponseJSON {
  routing: string;
  quote: QuoteJSON;
}

export class QuoteResponse implements QuoteResponseData {
  public static fromResponseBody(body: QuoteResponseJSON, tradeType: TradeType = TradeType.EXACT_INPUT): QuoteResponse {
    return new QuoteResponse(
      RoutingType[body.routing as keyof typeof RoutingType],
      this.parseQuote(body.routing, body.quote, tradeType)
    );
  }

  constructor(public readonly routing: RoutingType, public readonly quote: Quote) {}

  private static parseQuote(routing: string, quote: QuoteJSON, tradeType: TradeType): Quote {
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

  public toJSON(): QuoteResponseJSON {
    return {
      routing: this.routing,
      quote: this.quote.toJSON(),
    };
  }
}
