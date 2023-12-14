import { TradeType } from '@uniswap/sdk-core';
import { MethodParameters } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';

import { PermitBatchData, PermitDetails, PermitSingleData, PermitTransferFromData } from '@uniswap/permit2-sdk';
import { v4 as uuidv4 } from 'uuid';
import { QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { createPermitData } from '../../util/permit2';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { ClassicQuote, ClassicQuoteDataJSON, IQuote, LogJSON } from './index';
import { RelayConfig } from '../request/RelayRequest';

export type RelayClassicQuoteDataJson = ClassicQuoteDataJSON & {
  gasUseEstimateGasToken: string;
  gasUseEstimateGasTokenDecimals: string;
};

export class RelayQuote implements IQuote {
  public routingType: RoutingType = RoutingType.RELAY;
  public createdAt: string;
  public createdAtMs: string;
  public readonly quoteId: string = uuidv4();
  private allowanceData?: PermitDetails;

  public static fromResponseBody(request: QuoteRequest, body: RelayClassicQuoteDataJson): RelayQuote {
    return new RelayQuote(request, body);
  }

  private constructor(public request: QuoteRequest, private quoteData: RelayClassicQuoteDataJson) {
    this.createdAtMs = currentTimestampInMs();
    this.createdAt = timestampInMstoSeconds(parseInt(this.createdAtMs));
  }

  public toJSON(): RelayClassicQuoteDataJson {
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
      gasToken: (this.request.config as RelayConfig).gasToken,
      gasTokenAmount: this.quoteData.gasUseEstimateGasToken,
      gasTokenAmountDecimals: this.quoteData.gasUseEstimateGasTokenDecimals,
    };
  }

  getPermitData(): PermitTransferFromData {
    return this.toOrder().permitData();
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
      // there's a possibility that quoteGasAndPortionAdjusted doesn't get populated if the flag is off
      // in that case fallback to existing quoteGasAdjusted.
      // undefined will cause the request to fail due to BigNumber.from(undefined)
      ? BigNumber.from(this.quoteData.quoteGasAndPortionAdjusted ?? this.quoteData.quoteGasAdjusted)
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
      // there's a possibility that quoteGasAndPortionAdjusted doesn't get populated if the flag is off
      // in that case fallback to existing quoteGasAdjusted.
      // undefined will cause the request to fail due to BigNumber.from(undefined)
      ? BigNumber.from(this.quoteData.quoteGasAndPortionAdjusted ?? this.quoteData.quoteGasAdjusted)
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

  public getPortionBips(): number | undefined {
    return this.quoteData.portionBips;
  }

  public getPortionRecipient(): string | undefined {
    return this.quoteData.portionRecipient;
  }
}
