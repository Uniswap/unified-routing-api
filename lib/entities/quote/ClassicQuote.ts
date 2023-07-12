import { TradeType } from '@uniswap/sdk-core';
import { MethodParameters } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';

import { PermitDetails, PermitSingleData, PermitTransferFromData } from '@uniswap/permit2-sdk';
import { v4 as uuidv4 } from 'uuid';
import { Quote, QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { createPermitData } from '../../util/permit2';
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
  requestId: string;
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
  permitData?: PermitSingleData | PermitTransferFromData;
  tradeType: string;
  slippage: number;
};

export class ClassicQuote implements Quote {
  public routingType: RoutingType.CLASSIC = RoutingType.CLASSIC;
  public createdAt: string;
  public readonly quoteId: string = uuidv4();
  private allowanceData?: PermitDetails;

  public static fromResponseBody(request: QuoteRequest, body: ClassicQuoteDataJSON): ClassicQuote {
    return new ClassicQuote(request, body);
  }

  constructor(public request: QuoteRequest, private quoteData: ClassicQuoteDataJSON) {
    this.createdAt = currentTimestampInSeconds();
  }

  public toJSON(): ClassicQuoteDataJSON {
    return {
      ...this.quoteData,
      quoteId: this.quoteId,
      requestId: this.request.info.requestId,
      permitData: this.getPermitData(),
      tradeType: this.request.info.type === TradeType.EXACT_INPUT ? 'EXACT_INPUT' : 'EXACT_OUTPUT',
      slippage: this.slippage,
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
      swapper: '',
      routing: RoutingType[this.routingType],
      slippage: this.slippage,
      createdAt: this.createdAt,
      gasPriceWei: this.gasPriceWei,
    };
  }

  getPermitData(): PermitSingleData | undefined {
    if (
      !this.request.info.swapper ||
      (this.allowanceData &&
        BigNumber.from(this.allowanceData.amount).gte(this.amountOut) &&
        BigNumber.from(this.allowanceData.expiration).gt(Math.floor(new Date().getTime() / 1000)))
    )
      return undefined;

    return createPermitData(
      this.request.info.tokenIn,
      this.request.info.tokenInChainId,
      this.allowanceData?.nonce.toString() || '0'
    );
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

  public setAllowanceData(data?: PermitDetails): void {
    this.allowanceData = data;
  }

  public get slippage(): number {
    return this.request.info.slippageTolerance ? parseFloat(this.request.info.slippageTolerance) : -1;
  }
}
