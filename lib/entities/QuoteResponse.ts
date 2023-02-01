import { Quote, QuoteJSON } from './quotes';
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

  public toJSON(): QuoteResponseJSON {
    return {
      routing: this.routing,
      quote: this.quote.toJSON(),
    };
  }
}
