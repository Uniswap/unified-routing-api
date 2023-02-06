import { TradeType } from '@uniswap/sdk-core';

import { QuoteResponse } from '../../../lib/entities/QuoteResponse';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchLimitQuote,
  DutchLimitQuoteJSON,
  Quote,
  ReceivedQuoteJSON,
} from '../../../lib/entities/quotes';
import { DutchLimitConfig, RoutingConfig, RoutingType } from '../../../lib/entities/routing';
import { DL_CONFIG } from '../../constants';

export function buildQuoteResponse(
  body: {
    routing: string;
    quote: ReceivedQuoteJSON;
  },
  tradeType: TradeType = TradeType.EXACT_INPUT,
  config: RoutingConfig = DL_CONFIG as DutchLimitConfig
): QuoteResponse {
  return new QuoteResponse(
    RoutingType[body.routing as keyof typeof RoutingType],
    parseQuote(body.routing, body.quote, tradeType, config)
  );
}

function parseQuote(routing: string, quote: ReceivedQuoteJSON, tradeType: TradeType, config?: RoutingConfig): Quote {
  switch (routing) {
    case RoutingType.DUTCH_LIMIT:
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return DutchLimitQuote.fromResponseBodyAndConfig(config! as DutchLimitConfig, quote as DutchLimitQuoteJSON);
    case RoutingType.CLASSIC:
      // TODO: figure out how to determine tradetype from output JSON
      // also: is this parsing quote responses even needed outside of testing?
      return ClassicQuote.fromResponseBody(quote as ClassicQuoteDataJSON, tradeType);
    default:
      throw new Error(`Unknown routing type: ${routing}`);
  }
}
