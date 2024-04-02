import { Currency, TradeType } from '@uniswap/sdk-core';
import { MethodParameters } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';

import { PermitDetails, PermitSingleData, PermitTransferFromData } from '@uniswap/permit2-sdk';
import { Trade } from '@uniswap/router-sdk';
import { RouterTradeAdapter, V2PoolInRoute, V3PoolInRoute } from '@uniswap/universal-router-sdk';
import { v4 as uuidv4 } from 'uuid';
import { QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { Portion, PortionType } from '../../fetchers/PortionFetcher';
import { createPermitData } from '../../util/permit2';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { IQuote, LogJSON } from './index';

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
  gasUseEstimateGasToken?: string;
  gasUseEstimateGasTokenDecimals?: string;
  gasUseEstimateUSD: string;
  simulationError?: boolean;
  simulationStatus: string;
  gasPriceWei: string;
  blockNumber: string;
  route: Array<(V3PoolInRoute | V2PoolInRoute)[]>;
  routeString: string;
  methodParameters?: MethodParameters;
  permitData?: PermitSingleData | PermitTransferFromData;
  tradeType: string;
  slippage: number;
  portionBips?: number;
  portionRecipient?: string;
  portionAmount?: string;
  portionAmountDecimals?: string;
  quoteGasAndPortionAdjusted?: string;
  quoteGasAndPortionAdjustedDecimals?: string;
};

export class ClassicQuote implements IQuote {
  public routingType: RoutingType.CLASSIC = RoutingType.CLASSIC;
  public createdAt: string;
  public createdAtMs: string;
  public readonly quoteId: string = uuidv4();
  private allowanceData?: PermitDetails;

  public static fromResponseBody(request: QuoteRequest, body: ClassicQuoteDataJSON): ClassicQuote {
    return new ClassicQuote(request, body);
  }

  private constructor(public request: QuoteRequest, private quoteData: ClassicQuoteDataJSON) {
    this.createdAtMs = currentTimestampInMs();
    this.createdAt = timestampInMstoSeconds(parseInt(this.createdAtMs));
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
      createdAtMs: this.createdAtMs,
      gasPriceWei: this.gasPriceWei,
      portionBips: this.quoteData.portionBips,
      portionRecipient: this.quoteData.portionRecipient,
      portionAmount: this.quoteData.portionAmount,
      portionAmountDecimals: this.quoteData.portionAmountDecimals,
      quoteGasAndPortionAdjusted: this.quoteData.quoteGasAndPortionAdjusted,
      quoteGasAndPortionAdjustedDecimals: this.quoteData.quoteGasAndPortionAdjustedDecimals,
    };
  }

  public getPermitData(): PermitSingleData | undefined {
    if (
      !this.request.info.swapper ||
      (this.allowanceData &&
        BigNumber.from(this.allowanceData.amount).gte(this.amountIn) &&
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

  public get amountOutGasAndPortionAdjusted(): BigNumber {
    return this.request.info.type === TradeType.EXACT_INPUT
      ? // there's a possibility that quoteGasAndPortionAdjusted doesn't get populated if the flag is off
        // in that case fallback to existing quoteGasAdjusted.
        // undefined will cause the request to fail due to BigNumber.from(undefined)
        BigNumber.from(this.quoteData.quoteGasAndPortionAdjusted ?? this.quoteData.quoteGasAdjusted)
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

  public get amountInGasAndPortionAdjusted(): BigNumber {
    return this.request.info.type === TradeType.EXACT_OUTPUT
      ? // there's a possibility that quoteGasAndPortionAdjusted doesn't get populated if the flag is off
        // in that case fallback to existing quoteGasAdjusted.
        // undefined will cause the request to fail due to BigNumber.from(undefined)
        BigNumber.from(this.quoteData.quoteGasAndPortionAdjusted ?? this.quoteData.quoteGasAdjusted)
      : BigNumber.from(this.quoteData.amount);
  }

  public get gasUseEstimateGasToken(): BigNumber | undefined {
    return BigNumber.from(this.quoteData.gasUseEstimateGasToken);
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

  public get portion(): Portion | undefined {
    // we get the portion _type_ from the original classic URA request
    // and merge it with the bips / recipient from the routing API quoteData
    if (this.quoteData.portionBips === undefined || this.quoteData.portionRecipient === undefined) return undefined;

    return {
      bips: this.quoteData.portionBips,
      recipient: this.quoteData.portionRecipient,
      type: this.request.info.portion?.type ?? PortionType.Flat,
    };
  }

  public toRouterTrade(): Trade<Currency, Currency, TradeType> {
    if (!this.quoteData.route) throw new Error('Route is missing from classic quote data');

    return RouterTradeAdapter.fromClassicQuote({
      route: this.quoteData.route,
      tokenIn: this.request.info.tokenIn,
      tokenOut: this.request.info.tokenOut,
      tradeType: this.request.info.type,
    });
  }
}
