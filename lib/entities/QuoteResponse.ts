import { BigNumber } from 'ethers';
import { string } from 'joi';
import { v4 as uuidv4 } from 'uuid';

import { ClassicQuote, Quote, QuoteJSON, TradeType } from './quotes';
import { RoutingType } from './routing';

export interface QuoteResponseData {
  routing: RoutingType;
  quote: Quote;
}

export interface QuoteResponseJSON {
  routingType: string;
  quote: QuoteJSON;
}

export class QuoteResponse implements QuoteResponseData {
  public static fromResponseJSON(body: QuoteResponseJSON): QuoteResponse {
    return new QuoteResponse({
      routing: RoutingType[body.routingType as keyof typeof RoutingType],
      quote: parseQuote(body.routingType, body.quote),
    });
  }

  constructor(private data: QuoteResponseData) {}

  private parseQuote(routing: string, quote: QuoteJSON): Quote {
    switch (routing) {
      case RoutingType.CLASSIC:
        return ClassicQuote.from(quote);
      case RoutingType.DUTCH_LIMIT:
        return DutchLimitQuote.fromJSON(quote);
      default:
        throw new Error(`Unknown quote type: ${quote.type}`);
    }
  }

  public toJSON(): QuoteResponseJson {
    return {
      ...this.data,
      tradeType: TradeType[this.data.tradeType],
      amountIn: this.data.amountIn.toString(),
      amountOut: this.data.amountOut.toString(),
    };
  }

  public get routing(): RoutingType {
    return this.data.routing;
  }

  public get quote(): Quote {
    return this.data.quote;
  }
}
