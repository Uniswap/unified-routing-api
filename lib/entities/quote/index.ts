import { BigNumber } from 'ethers';

import { DutchQuote, DutchQuoteDataJSON, DutchQuoteRequest, DutchV2QuoteDataJSON, QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { ClassicQuote, ClassicQuoteDataJSON } from './ClassicQuote';
import { RelayQuote, RelayQuoteDataJSON } from './RelayQuote';

export * from './ClassicQuote';
export * from './DutchQuote';
export * from './DutchV2Quote';
export * from './RelayQuote';

export type QuoteJSON = DutchQuoteDataJSON | DutchV2QuoteDataJSON | RelayQuoteDataJSON | ClassicQuoteDataJSON;

// Shared fields between all non classic quote types
export type SharedOrderQuoteDataJSON = {
  quoteId: string;
  requestId: string;
  encodedOrder: string;
  orderHash: string;
  slippageTolerance: string;
};

// Superset of all possible log fields from the quote types
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
  amountInGasAndPortionAdjusted?: string;
  amountOutGasAdjusted?: string;
  amountOutGasAndPortionAdjusted?: string;
  tokenInChainId: number;
  tokenOutChainId: number;
  swapper: string;
  routing: string;
  createdAt: string;
  createdAtMs: string;
  slippage: number;
  filler?: string;
  gasPriceWei?: string;
  portionBips?: number;
  portionRecipient?: string;
  portionAmount?: string;
  portionAmountDecimals?: string;
  quoteGasAndPortionAdjusted?: string;
  quoteGasAndPortionAdjustedDecimals?: string;
  portionAmountOutStart?: string;
  portionAmountOutEnd?: string;
  gasToken?: string;
  feeAmountStart?: string;
  feeAmountEnd?: string;
};

export interface IQuote {
  routingType: RoutingType;
  amountOut: BigNumber;
  amountIn: BigNumber;
  toJSON(): QuoteJSON;
  request: QuoteRequest;
  toLog(): LogJSON;
}

export type Quote = DutchQuote<DutchQuoteRequest> | RelayQuote | ClassicQuote;
