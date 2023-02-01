import { Quote, QuoteJSON, ReceivedQuoteJSON } from './quotes';
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
  constructor(public readonly routing: RoutingType, public readonly quote: Quote) {}

  public toJSON(): { routing: string; quote: ReceivedQuoteJSON } {
    return {
      routing: this.routing,
      quote: this.quote.toJSON(),
    };
  }

  public toOrder(): QuoteResponseJSON {
    return {
      routing: this.routing,
      quote: this.quote.toOrder(),
    };
  }
}
