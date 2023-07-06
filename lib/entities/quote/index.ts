import { BigNumber } from 'ethers';

import { DutchQuoteDataJSON, QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { ClassicQuoteDataJSON } from './ClassicQuote';

export * from './ClassicQuote';
export * from './DutchQuote';

export type QuoteJSON = DutchQuoteDataJSON | ClassicQuoteDataJSON;

export type LogJSON = {
  quoteId: string;
  requestId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  endAmountIn: string;
  endAmountOut: string;
  amountInGasAdjusted?: string;
  amountOutGasAdjusted?: string;
  tokenInChainId: number;
  tokenOutChainId: number;
  swapper: string;
  routing: string;
  createdAt: string;
  slippage: number;
  filler?: string;
  gasPriceWei?: string;
};

export interface Quote {
  routingType: RoutingType;
  amountOut: BigNumber;
  amountIn: BigNumber;
  toJSON(): QuoteJSON;
  request: QuoteRequest;
  toLog(): LogJSON;
}
