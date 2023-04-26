import { TradeType } from '@uniswap/sdk-core';
import { MethodParameters } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';

import { v4 as uuidv4 } from 'uuid';
import { Quote, QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { currentTimestampInSeconds } from '../../util/time';
import { LogJSON } from './index';

export type V2ReserveJSON = {
  token: TokenInRouteJSON;
  quotient: string;
};

export type V2PoolInRouteJSON = {
  type: 'v2-pool';
  address: string;
  tokenIn: TokenInRouteJSON;
  tokenOut: TokenInRouteJSON;
  reserve0: V2ReserveJSON;
  reserve1: V2ReserveJSON;
  amountIn?: string;
  amountOut?: string;
};

export type TokenInRouteJSON = {
  address: string;
  chainId: number;
  symbol: string;
  decimals: string;
};

export type V3PoolInRouteJSON = {
  type: 'v3-pool';
  address: string;
  tokenIn: TokenInRouteJSON;
  tokenOut: TokenInRouteJSON;
  sqrtRatioX96: string;
  liquidity: string;
  tickCurrent: string;
  fee: string;
  amountIn?: string;
  amountOut?: string;
};

export type ClassicQuoteDataJSON = {
  quoteId: string;
  amount: string;
  amountDecimals: string;
  quote: string;
  quoteDecimals: string;
  quoteGasAdjusted: string;
  quoteGasAdjustedDecimals: string;
  gasUseEstimate: string;
  gasUseEstimateQuote: string;
  gasUseEstimateQuoteDecimals: string;
  gasUseEstimateUSD: string;
  simulationError?: boolean;
  simulationStatus: string;
  gasPriceWei: string;
  blockNumber: string;
  route: Array<(V3PoolInRouteJSON | V2PoolInRouteJSON)[]>;
  routeString: string;
  methodParameters?: MethodParameters;
};

export class ClassicQuote implements Quote {
  public routingType: RoutingType.CLASSIC = RoutingType.CLASSIC;
  public createdAt: string;
  public readonly quoteId: string = uuidv4();

  public static fromResponseBody(request: QuoteRequest, body: ClassicQuoteDataJSON): ClassicQuote {
    return new ClassicQuote(request, body);
  }

  constructor(
    public request: QuoteRequest,
    private quoteData: ClassicQuoteDataJSON,
    createdAt: string = currentTimestampInSeconds()
  ) {
    this.createdAt = createdAt;
  }

  public toJSON(): ClassicQuoteDataJSON {
    return {
      ...this.quoteData,
      quoteId: this.quoteId,
    };
  }

  public toLog(): LogJSON {
    return {
      quoteId: this.quoteId,
      requestId: this.request.info.requestId,
      tokenInChainId: this.request.info.tokenInChainId,
      tokenOutChainId: this.request.info.tokenOutChainId,
      tokenIn: this.request.info.tokenIn,
      tokenOut: this.request.info.tokenOut,
      amountIn: this.amountIn.toString(),
      endAmountIn: this.amountIn.toString(),
      amountOut: this.amountOut.toString(),
      endAmountOut: this.amountOut.toString(),
      amountInGasAdjusted: this.amountInGasAdjusted.toString(),
      amountOutGasAdjusted: this.amountOutGasAdjusted.toString(),
      offerer: '',
      routing: RoutingType[this.routingType],
      slippage: this.request.info.slippageTolerance ? parseFloat(this.request.info.slippageTolerance) : -1,
      createdAt: this.createdAt,
      gasPriceWei: this.gasPriceWei,
    };
  }

  public get amountOut(): BigNumber {
    return this.request.info.type === TradeType.EXACT_INPUT
      ? BigNumber.from(this.quoteData.quote)
      : BigNumber.from(this.quoteData.amount);
  }

  public get amountOutGasAdjusted(): BigNumber {
    return this.request.info.type === TradeType.EXACT_INPUT
      ? BigNumber.from(this.quoteData.quoteGasAdjusted)
      : BigNumber.from(this.quoteData.amount);
  }

  public get amountIn(): BigNumber {
    return this.request.info.type === TradeType.EXACT_OUTPUT
      ? BigNumber.from(this.quoteData.quote)
      : BigNumber.from(this.quoteData.amount);
  }

  public get amountInGasAdjusted(): BigNumber {
    return this.request.info.type === TradeType.EXACT_OUTPUT
      ? BigNumber.from(this.quoteData.quoteGasAdjusted)
      : BigNumber.from(this.quoteData.amount);
  }

  public get gasPriceWei(): string {
    return this.quoteData.gasPriceWei;
  }
}
