import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import { ClassicQuoteDataJSON } from './ClassicQuote';
import { RoutingType } from './routing';

export * from './DutchLimitQuote';
export * from './ClassicQuote';

export type QuoteJSON = DutchLimitOrderInfoJSON | ClassicQuoteDataJSON;

export interface Quote {
  routingType: RoutingType;
  toJSON(): QuoteJSON;
  amountOut: BigNumber;
  amountIn: BigNumber;
}
