import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import { QuoteRequest, RoutingType } from '..';
import { ClassicQuoteDataJSON } from './ClassicQuote';

export * from './ClassicQuote';
export * from './DutchLimitQuote';

export type QuoteJSON = (DutchLimitOrderInfoJSON & { quoteId: string }) | ClassicQuoteDataJSON;

export type QuoteByRoutingType = { [key in RoutingType]?: Quote };

export type QuotesByRoutingType = { [key in RoutingType]?: Quote[] };

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
  offerer: string;
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
