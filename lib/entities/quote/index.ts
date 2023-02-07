import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import { QuoteRequest, RoutingType } from '..';
import { ClassicQuoteDataJSON } from './ClassicQuote';

export * from './ClassicQuote';
export * from './DutchLimitQuote';

export type QuoteJSON = DutchLimitOrderInfoJSON | ClassicQuoteDataJSON;

export interface Quote {
  routingType: RoutingType;
  amountOut: BigNumber;
  amountIn: BigNumber;
  toJSON(): QuoteJSON;
  request: QuoteRequest;
}
