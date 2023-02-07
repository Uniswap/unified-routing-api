import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import { RoutingType } from '..';
import { ClassicQuoteDataJSON } from './ClassicQuote';

export * from './ClassicQuote';
export * from './DutchLimitQuote';

export type QuoteJSON = DutchLimitOrderInfoJSON | ClassicQuoteDataJSON;

export interface Quote {
  routingType: RoutingType;
  toJSON(): QuoteJSON;
  amountOut: BigNumber;
  amountIn: BigNumber;
}
