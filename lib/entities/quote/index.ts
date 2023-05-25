import { BigNumber } from 'ethers';

import { PermitDetails, PermitSingleData, PermitTransferFromData } from '@uniswap/permit2-sdk';
import { DutchLimitQuoteDataJSON, QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { ClassicQuoteDataJSON } from './ClassicQuote';

export * from './ClassicQuote';
export * from './DutchLimitQuote';

export type QuoteJSON = DutchLimitQuoteDataJSON | ClassicQuoteDataJSON;

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
  getPermit(currentPermit: Omit<PermitDetails, 'token'> | null): PermitSingleData | PermitTransferFromData | null;
}
