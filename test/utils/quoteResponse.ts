import { TradeType } from '@uniswap/sdk-core';

import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchLimitConfig,
  DutchLimitQuote,
  DutchLimitQuoteJSON,
  Quote,
  RoutingConfig,
  RoutingType,
} from '../../lib/entities';
import { DL_CONFIG } from '../constants';

type ReceivedQuoteData = DutchLimitQuoteJSON | ClassicQuoteDataJSON;

export function buildQuoteResponse(
  body: {
    routing: string;
    quote: ReceivedQuoteData;
  },
  tradeType: TradeType = TradeType.EXACT_INPUT,
  config: RoutingConfig = DL_CONFIG as DutchLimitConfig
): Quote {
  return parseQuote(body.routing, body.quote, tradeType, config);
}

function parseQuote(routing: string, quote: ReceivedQuoteData, tradeType: TradeType, config?: RoutingConfig): Quote {
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
