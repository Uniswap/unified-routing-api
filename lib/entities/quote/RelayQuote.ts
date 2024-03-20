import { RelayOrder, RelayOrderBuilder, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { RouterTradeAdapter, SwapRouter, UNIVERSAL_ROUTER_ADDRESS, UniswapTrade } from '@uniswap/universal-router-sdk';
import { BigNumber, ethers } from 'ethers';

import { IQuote } from '.';
import { DEFAULT_START_TIME_BUFFER_SECS, RELAY_BASE_GAS, RoutingType } from '../../constants';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { RelayRequest } from '../request/RelayRequest';
import { ClassicQuote, ClassicQuoteDataJSON } from './ClassicQuote';
import { LogJSON } from './index';
import { PermitBatchTransferFromData } from '@uniswap/permit2-sdk';
import { Percent } from '@uniswap/sdk-core';

// Data returned by the API
export type RelayQuoteDataJSON = {
  orderInfo: RelayOrderInfoJSON;
  quoteId: string;
  requestId: string;
  encodedOrder: string;
  orderHash: string;
  startTimeBufferSecs: number;
  auctionPeriodSecs: number;
  deadlineBufferSecs: number;
  slippageTolerance: string;
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
  amountInGasTokenStart: string;
  amountInGasTokenEnd: string;
  swapper: string;
  gasToken: string;
  // from classic quote
  classicQuoteData: ClassicQuoteDataJSON;
}

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
  amountInGasTokenStart: BigNumber;
  amountInGasTokenEnd: BigNumber;
  swapper: string;
  classicQuoteData: ClassicQuoteDataJSON;
  nonce?: string;
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
  public readonly amountInGasTokenStart: BigNumber;
  public readonly amountInGasTokenEnd: BigNumber;
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
      amountInGasTokenStart: BigNumber.from(body.amountInGasTokenStart),
      amountInGasTokenEnd: BigNumber.from(body.amountInGasTokenEnd),
      swapper: body.swapper,
      classicQuoteData: body.classicQuoteData,
      nonce
    });
  }

  // The only way to create a relay quote is from a classic quote
  public static fromClassicQuote(request: RelayRequest, classicQuote: ClassicQuote): RelayQuote {
    // Relay quotes require a gas token estimation
    if (!classicQuote.gasUseEstimateGasToken) {
      throw new Error('Classic quote must have gasUseEstimateGasToken');
    }
    const amountInGasTokenStart = request.config.amountInGasTokenStartOverride
      ? BigNumber.from(request.config.amountInGasTokenStartOverride)
      : classicQuote.gasUseEstimateGasToken;
    const amountInGasTokenEnd = this.applyGasAdjustment(amountInGasTokenStart, classicQuote);

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
      amountInGasTokenStart,
      amountInGasTokenEnd,
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

  // Callers MUST add the calldata to the order before submitting it
  // by default we build orders with calldata that will revert
  public toOrder(): RelayOrder {
    const orderBuilder = new RelayOrderBuilder(this.chainId);
    const feeStartTime = Math.floor(Date.now() / 1000);
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
      .nonce(BigNumber.from(nonce))
      .deadline(feeStartTime + this.auctionPeriodSecs + this.deadlineBufferSecs)
      // Add the swap input to UR
      .input({
        token: this.tokenIn,
        amount: this.amountIn,
        recipient: UNIVERSAL_ROUTER_ADDRESS(this.chainId),
      })
      // Add the gas token input to the filler
      .fee({
        token: this.request.config.gasToken,
        startAmount: this.amountInGasTokenStart,
        endAmount: this.amountInGasTokenEnd,
        startTime: feeStartTime,
        endTime: feeStartTime + this.auctionPeriodSecs,
      })
      .universalRouterCalldata(this.universalRouterCalldata);

    return builder.build();
  }

  public toLog(): LogJSON {
    return {
      ...this.classicQuote.toLog(),
      // TODO: determine which fields to override here
      requestId: this.requestId,
      quoteId: this.quoteId,
      amountIn: this.amountIn.toString(),
      amountOut: this.amountOut.toString(),
      gasToken: this.request.config.gasToken,
      amountInGasTokenStart: this.amountInGasTokenStart.toString(),
      amountInGasTokenEnd: this.amountInGasTokenEnd.toString(),
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

  public get universalRouterCalldata(): string {
    return SwapRouter.swapCallParameters(new UniswapTrade(RouterTradeAdapter.fromClassicQuote({
      route: this.classicQuote.toJSON().route,
      tokenIn: this.tokenIn,
      tokenOut: this.tokenOut,
      tradeType: this.request.info.type,
    }), {
      slippageTolerance: new Percent(this.request.info.slippageTolerance, 100),
      recipient: this.swapper,
    }), {
      
    }).calldata;
  }

  // Value used only for comparing relay quotes vs. other types of quotes
  public get amountInGasAndPortionAdjustedClassic(): BigNumber {
    return this.classicQuote.amountInGasAndPortionAdjusted;
  }

  // Value used only for comparing relay quotes vs. other types of quotes
  public get amountOutGasAndPortionAdjustedClassic(): BigNumber {
    return this.classicQuote.amountOutGasAndPortionAdjusted;
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
        return 60;
      case 137:
        return 60;
      default:
        return 60;
    }
  }

  // The number of seconds from endTime that the order should expire
  public get deadlineBufferSecs(): number {
    if (this.request.config.deadlineBufferSecs !== undefined) {
      return this.request.config.deadlineBufferSecs;
    }

    switch (this.chainId) {
      case 1:
        return 12;
      case 137:
        return 5;
      default:
        return 5;
    }
  }

  validate(): boolean {
    // TODO:
    return true;
  }

  // static helpers

  // Calculates the gas adjustment for the given quote if processed through UniswapX
  // Swap gas adjustments are paid by the filler in the process of filling a trade
  // and should be applied to endAmounts
  static applyGasAdjustment(amountInGasToken: BigNumber, classicQuote: ClassicQuote): BigNumber {
    const gasAdjustment = RelayQuote.getGasAdjustment();
    if (gasAdjustment.eq(0)) return amountInGasToken;
    return RelayQuote.getGasAdjustedAmounts(
      amountInGasToken,
      // routing api gas adjustment is already applied
      gasAdjustment,
      classicQuote
    );
  }

  // return the amounts, with the gasAdjustment value taken out
  // classicQuote used to get the gas price values in quote token
  static getGasAdjustedAmounts(amountInGasToken: BigNumber, gasAdjustment: BigNumber, _classicQuote: ClassicQuote): BigNumber {
    // TODO: naively for now just add 25% buffer
    const amountInGasTokenEnd = amountInGasToken.add(gasAdjustment.mul(125).div(100));
    return amountInGasTokenEnd;
  }

  // Returns the number of gas units extra required to execute this quote through the relayer
  static getGasAdjustment(): BigNumber {
    return BigNumber.from(RELAY_BASE_GAS);
  }
}
