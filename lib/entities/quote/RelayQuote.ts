import { RelayOrder, RelayOrderBuilder, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { SwapRouter, UniswapTrade, UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber, ethers } from 'ethers';

import { PermitBatchTransferFromData } from '@uniswap/permit2-sdk';
import { Percent } from '@uniswap/sdk-core';
import { IQuote, SharedOrderQuoteDataJSON } from '.';
import {
  DEFAULT_AUCTION_PERIOD_SECS,
  DEFAULT_DEADLINE_BUFFER_SECS,
  DEFAULT_START_TIME_BUFFER_SECS,
  RELAY_BASE_GAS,
  RoutingType,
} from '../../constants';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { RelayRequest } from '../request/RelayRequest';
import { ClassicQuote, ClassicQuoteDataJSON } from './ClassicQuote';
import { LogJSON } from './index';

// Data returned by the API
export type RelayQuoteDataJSON = SharedOrderQuoteDataJSON & {
  orderInfo: RelayOrderInfoJSON;
  startTimeBufferSecs: number;
  auctionPeriodSecs: number;
  deadlineBufferSecs: number;
  permitData: PermitBatchTransferFromData;
  classicQuoteData: ClassicQuoteDataJSON;
};

export type RelayQuoteJSON = {
  chainId: number;
  quoteId: string;
  requestId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  feeAmountStart: string;
  feeAmountEnd: string;
  swapper: string;
  gasToken: string;
  // from classic quote
  classicQuoteData: ClassicQuoteDataJSON;
};

type RelayQuoteConstructorArgs = {
  createdAtMs?: string;
  request: RelayRequest;
  chainId: number;
  requestId: string;
  quoteId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: BigNumber;
  amountOut: BigNumber;
  feeAmountStart: BigNumber;
  feeAmountEnd: BigNumber;
  swapper: string;
  classicQuoteData: ClassicQuoteDataJSON;
  nonce?: string;
};

type FeeStartEndAmounts = {
  feeAmountStart: BigNumber;
  feeAmountEnd: BigNumber;
};

export class RelayQuote implements IQuote {
  public readonly createdAt: string;
  public routingType: RoutingType.RELAY = RoutingType.RELAY;
  public classicQuote: ClassicQuote;

  public readonly createdAtMs: string;
  public readonly request: RelayRequest;
  public readonly chainId: number;
  public readonly requestId: string;
  public readonly quoteId: string;
  public readonly tokenIn: string;
  public readonly tokenOut: string;
  // Used for swap related tokens
  // these values should NOT be gas adjusted
  public readonly amountIn: BigNumber;
  public readonly amountOut: BigNumber;
  // Used for gas token parameterization
  public readonly feeAmountStart: BigNumber;
  public readonly feeAmountEnd: BigNumber;
  public readonly swapper: string;
  // Used to compare X quotes vs Relay quotes
  public readonly classicQuoteData: ClassicQuoteDataJSON;
  public readonly nonce?: string;

  public static fromResponseBody(request: RelayRequest, body: RelayQuoteJSON, nonce?: string): RelayQuote {
    return new RelayQuote({
      request,
      chainId: body.chainId,
      requestId: body.requestId,
      quoteId: body.quoteId,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amountIn: BigNumber.from(body.amountIn),
      amountOut: BigNumber.from(body.amountOut),
      feeAmountStart: BigNumber.from(body.feeAmountStart),
      feeAmountEnd: BigNumber.from(body.feeAmountEnd),
      swapper: body.swapper,
      classicQuoteData: body.classicQuoteData,
      nonce,
    });
  }

  // The only way to create a relay quote is from a classic quote
  public static fromClassicQuote(request: RelayRequest, classicQuote: ClassicQuote): RelayQuote {
    // Relay quotes require a gas token estimation
    if (!classicQuote.gasUseEstimateGasToken) {
      throw new Error('Classic quote must have gasUseEstimateGasToken');
    }
    const gasEstimateInFeeToken = request.config.feeAmountStartOverride
      ? BigNumber.from(request.config.feeAmountStartOverride)
      : classicQuote.gasUseEstimateGasToken;
    const { feeAmountStart, feeAmountEnd } = this.applyGasAdjustment(gasEstimateInFeeToken, classicQuote);

    return new RelayQuote({
      createdAtMs: classicQuote.createdAtMs,
      request,
      chainId: request.info.tokenInChainId,
      requestId: request.info.requestId,
      quoteId: classicQuote.quoteId,
      tokenIn: request.info.tokenIn,
      tokenOut: request.info.tokenOut,
      amountIn: classicQuote.amountIn, // apply no gas adjustment
      amountOut: classicQuote.amountOut, // apply no gas adjustment
      feeAmountStart,
      feeAmountEnd,
      swapper: request.config.swapper,
      classicQuoteData: classicQuote.toJSON(),
      nonce: generateRandomNonce(), // add a nonce
    });
  }

  private constructor(args: RelayQuoteConstructorArgs) {
    Object.assign(this, args, {
      createdAtMs: args.createdAtMs || currentTimestampInMs(),
    });
    this.createdAt = timestampInMstoSeconds(parseInt(this.createdAtMs));
    // regenerate the classic quote from the data
    this.classicQuote = ClassicQuote.fromResponseBody(this.request, this.classicQuoteData);
  }

  public toJSON(): RelayQuoteDataJSON {
    return {
      orderInfo: this.toOrder().toJSON(),
      encodedOrder: this.toOrder().serialize(),
      quoteId: this.quoteId,
      requestId: this.requestId,
      orderHash: this.toOrder().hash(),
      startTimeBufferSecs: this.startTimeBufferSecs,
      auctionPeriodSecs: this.auctionPeriodSecs,
      deadlineBufferSecs: this.deadlineBufferSecs,
      slippageTolerance: this.request.info.slippageTolerance,
      permitData: this.getPermitData(),
      classicQuoteData: this.classicQuoteData,
    };
  }

  public toOrder(): RelayOrder {
    const orderBuilder = new RelayOrderBuilder(this.chainId);
    const feeStartTime = Math.floor(Date.now() / 1000);
    const deadline = feeStartTime + this.auctionPeriodSecs + this.deadlineBufferSecs;
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
      .nonce(BigNumber.from(nonce))
      .deadline(deadline)
      // Add the swap input to UR
      .input({
        token: this.tokenIn,
        amount: this.amountIn,
        recipient: UNIVERSAL_ROUTER_ADDRESS(this.chainId),
      })
      // Add the gas token input to the filler
      .fee({
        token: this.request.config.gasToken,
        startAmount: this.feeAmountStart,
        endAmount: this.feeAmountEnd,
        startTime: feeStartTime,
        endTime: feeStartTime + this.auctionPeriodSecs,
      })
      .universalRouterCalldata(this.universalRouterCalldata(deadline));

    return builder.build();
  }

  public toLog(): LogJSON {
    return {
      ...this.classicQuote.toLog(),
      requestId: this.requestId,
      quoteId: this.quoteId,
      amountIn: this.amountIn.toString(),
      amountOut: this.amountOut.toString(),
      gasToken: this.request.config.gasToken,
      feeAmountStart: this.feeAmountStart.toString(),
      feeAmountEnd: this.feeAmountEnd.toString(),
      swapper: this.swapper,
      routing: RoutingType[this.routingType],
      slippage: parseFloat(this.request.info.slippageTolerance),
      createdAt: this.createdAt,
      createdAtMs: this.createdAtMs,
    };
  }

  getPermitData(): PermitBatchTransferFromData {
    return this.toOrder().permitData();
  }

  public get slippage(): Percent {
    return new Percent(parseFloat(this.request.info.slippageTolerance) * 100, 10_000);
  }

  public universalRouterCalldata(deadline: number): string {
    return SwapRouter.swapCallParameters(
      new UniswapTrade(this.classicQuote.toRouterTrade(), {
        slippageTolerance: this.slippage,
        recipient: this.swapper,
        useRouterBalance: true,
        deadlineOrPreviousBlockhash: deadline,
      })
    ).calldata;
  }

  // The number of seconds from now that fee escalation should begin
  public get startTimeBufferSecs(): number {
    if (this.request.config.startTimeBufferSecs !== undefined) {
      return this.request.config.startTimeBufferSecs;
    }

    return DEFAULT_START_TIME_BUFFER_SECS;
  }

  // The number of seconds from startTime that fee escalation should end
  public get auctionPeriodSecs(): number {
    if (this.request.config.auctionPeriodSecs !== undefined) {
      return this.request.config.auctionPeriodSecs;
    }

    switch (this.chainId) {
      case 1:
        return DEFAULT_AUCTION_PERIOD_SECS;
      default:
        return DEFAULT_AUCTION_PERIOD_SECS;
    }
  }

  // The number of seconds from endTime that the order should expire
  public get deadlineBufferSecs(): number {
    if (this.request.config.deadlineBufferSecs !== undefined) {
      return this.request.config.deadlineBufferSecs;
    }

    switch (this.chainId) {
      case 1:
        return DEFAULT_DEADLINE_BUFFER_SECS;
      default:
        return DEFAULT_DEADLINE_BUFFER_SECS;
    }
  }

  validate(): boolean {
    // fee escalation must be strictly increasing
    if (this.feeAmountStart.gt(this.feeAmountEnd)) return false;
    return true;
  }

  // static helpers

  // We want to parameterize the gas token amount to be used in the relay quote
  // The start amount should take into consideration the base gas overhead from filling the order
  // and the end amount should account for increasing base fees
  static applyGasAdjustment(gasEstimateInFeeToken: BigNumber, classicQuote: ClassicQuote): FeeStartEndAmounts {
    const gasAdjustment = RelayQuote.getGasAdjustment();
    return RelayQuote.getGasAdjustedAmounts(gasEstimateInFeeToken, gasAdjustment, classicQuote);
  }

  static getGasAdjustedAmounts(
    gasEstimateInFeeToken: BigNumber,
    gasAdjustment: BigNumber,
    classicQuote: ClassicQuote
  ): FeeStartEndAmounts {
    const gasUseEstimate = BigNumber.from(classicQuote.toJSON().gasUseEstimate);
    const gasPriceWei = BigNumber.from(classicQuote.toJSON().gasPriceWei);
    
    // get the classic estimated gas cost in native token
    const classicGasNative = gasUseEstimate.mul(gasPriceWei);
    // apply the gas adjustment, and get the cost in native token
    const adjustedGasNative = gasUseEstimate.add(gasAdjustment).mul(gasPriceWei);
    // multiply the gas estimate in fee token by the ratio of the adjusted gas to the classic gas
    const feeAmountStart = gasEstimateInFeeToken.mul(adjustedGasNative).div(classicGasNative);
    // add a 25% buffer to the fee start amount to account for potential gas price increases
    const feeAmountEnd = feeAmountStart.mul(125).div(100);

    return {
      feeAmountStart,
      feeAmountEnd,
    };
  }

  // Returns the number of gas units extra required to execute this quote through the relayer
  static getGasAdjustment(): BigNumber {
    return BigNumber.from(RELAY_BASE_GAS);
  }
}
