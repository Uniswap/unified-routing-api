import { DutchLimitQuote, Quote, QuoteData, QuoteJSON } from './quotes';
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
  public static fromResponseJSON(body: QuoteResponseJSON): QuoteResponse {
    return new QuoteResponse(
      RoutingType[body.routing as keyof typeof RoutingType],
      this.parseQuote(body.routing, body.quote)
    );
  }

  constructor(public readonly routing: RoutingType, public readonly quote: Quote) {}

  private static parseQuote(routing: string, quote: QuoteJSON): Quote {
    switch (routing) {
      case RoutingType.DUTCH_LIMIT:
        return DutchLimitQuote.fromResponseBody(quote);
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
