import { RelayOrder, RelayOrderBuilder, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber, ethers } from 'ethers';

import { PermitBatchTransferFromData } from '@uniswap/permit2-sdk';
import { v4 as uuidv4 } from 'uuid';
import { IQuote } from '.';
import { DEFAULT_START_TIME_BUFFER_SECS, RELAY_BASE_GAS, RoutingType } from '../../constants';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { RelayRequest } from '../request/RelayRequest';
import { ClassicQuote } from './ClassicQuote';
import { LogJSON } from './index';

export type RelayQuoteDerived = {
  largeTrade: boolean;
};

export type RelayQuoteDataJSON = {
  orderInfo: RelayOrderInfoJSON;
  quoteId: string;
  requestId: string;
  encodedOrder: string;
  orderHash: string;
  startTimeBufferSecs: number;
  auctionPeriodSecs: number;
  deadlineBufferSecs: number;
  permitData: PermitBatchTransferFromData;
};

export type RelayQuoteJSON = {
  chainId: number;
  requestId: string;
  quoteId: string;
  tokenIn: string;
  amountIn: string;
  tokenOut: string;
  amountOut: string;
  gasToken: string;
  amountInGasToken: string;
  swapper: string;
  classicAmountInGasAndPortionAdjusted: string;
  classicAmountOutGasAndPortionAdjusted: string;
};

type Amounts = {
  amountIn: BigNumber;
  amountInGasToken: BigNumber;
};

export class RelayQuote implements IQuote {
  public readonly createdAt: string;
  public derived: RelayQuoteDerived;
  public routingType: RoutingType.RELAY = RoutingType.RELAY;

  public static fromResponseBody(request: RelayRequest, body: RelayQuoteJSON): RelayQuote {
    return new RelayQuote(
      currentTimestampInMs(),
      request,
      request.info.tokenInChainId,
      request.info.requestId,
      uuidv4(), // synthetic quote doesn't receive a quoteId from RFQ api, so generate one
      request.info.tokenIn,
      body.tokenOut,
      BigNumber.from(body.amountIn), // apply no gas adjustment
      BigNumber.from(body.amountIn), // apply no gas adjustment
      BigNumber.from(body.amountOut), // apply no gas adjustment
      BigNumber.from(body.amountOut), // apply no gas adjustment
      BigNumber.from(body.amountInGasToken),
      BigNumber.from(body.amountInGasToken),
      request.config.swapper,
      BigNumber.from(body.classicAmountInGasAndPortionAdjusted),
      BigNumber.from(body.classicAmountOutGasAndPortionAdjusted),
      generateRandomNonce()
    );
  }

  // build a relay quote from a classic quote
  public static fromClassicQuote(request: RelayRequest, quote: ClassicQuote): RelayQuote {
    // Relay quotes require a gas token estimation
    if (!quote.gasUseEstimateGasToken) {
      throw new Error('Classic quote must have gasUseEstimateGasToken');
    }
    const startAmounts = {
      amountIn: quote.amountIn,
      amountInGasToken: request.config.amountInGasTokenStartOverride
        ? BigNumber.from(request.config.amountInGasTokenStartOverride)
        : quote.gasUseEstimateGasToken,
    };
    const endAmounts = this.applyGasAdjustment(startAmounts, quote);

    return new RelayQuote(
      quote.createdAtMs,
      request,
      request.info.tokenInChainId,
      request.info.requestId,
      uuidv4(), // synthetic quote doesn't receive a quoteId from RFQ api, so generate one
      request.info.tokenIn,
      quote.request.info.tokenOut,
      quote.amountIn, // apply no gas adjustment
      quote.amountIn, // apply no gas adjustment
      quote.amountOut, // apply no gas adjustment
      quote.amountOut, // apply no gas adjustment
      startAmounts.amountInGasToken,
      endAmounts.amountInGasToken,
      request.config.swapper,
      quote.amountInGasAndPortionAdjusted,
      quote.amountOutGasAndPortionAdjusted,
      generateRandomNonce() // synthetic quote has no nonce
    );
  }

  private constructor(
    public readonly createdAtMs: string,
    public readonly request: RelayRequest,
    public readonly chainId: number,
    public readonly requestId: string,
    public readonly quoteId: string,
    public readonly tokenIn: string,
    public readonly tokenOut: string,
    // Used for swap related tokens
    // these values should NOT be gas adjusted
    public readonly amountInStart: BigNumber,
    public readonly amountInEnd: BigNumber,
    public readonly amountOutStart: BigNumber,
    public readonly amountOutEnd: BigNumber,
    // Used for gas token
    public readonly amountInGasTokenStart: BigNumber,
    public readonly amountInGasTokenEnd: BigNumber,
    public readonly swapper: string,
    // Used to compare X quotes vs Relay quotes
    public readonly classicAmountInGasAndPortionAdjusted: BigNumber,
    public readonly classicAmountOutGasAndPortionAdjusted: BigNumber,
    public readonly nonce?: string,
    derived?: RelayQuoteDerived
  ) {
    this.createdAtMs = createdAtMs || currentTimestampInMs();
    this.createdAt = timestampInMstoSeconds(parseInt(this.createdAtMs));
    this.derived = derived || { largeTrade: false };
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
      permitData: this.getPermitData(),
    };
  }

  // note: calldata must be built by the caller and added to the built order
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
        amount: this.amountInStart,
        recipient: UNIVERSAL_ROUTER_ADDRESS(this.chainId),
      })
      // Add the gas token input to the filler
      .fee({
        token: this.request.config.gasToken,
        startAmount: this.amountInGasTokenStart,
        endAmount: this.amountInGasTokenEnd,
        startTime: feeStartTime,
        endTime: feeStartTime + this.auctionPeriodSecs
      });

    return builder.build();
  }

  public toLog(): LogJSON {
    return {
      tokenInChainId: this.chainId,
      tokenOutChainId: this.chainId,
      requestId: this.requestId,
      quoteId: this.quoteId,
      tokenIn: this.tokenIn,
      amountIn: this.amountInStart.toString(),
      endAmountIn: this.amountInEnd.toString(),
      tokenOut: this.tokenOut,
      amountOut: this.amountOutStart.toString(),
      endAmountOut: this.amountOutEnd.toString(),
      gasToken: this.request.config.gasToken,
      amountInGasToken: this.amountInGasTokenStart.toString(),
      endAmountInGasToken: this.amountInGasTokenEnd.toString(),
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

  // The total amount of tokens that will be received by the user from the relayed swap
  public get amountOut(): BigNumber {
    return this.amountOutStart;
  }

  // The total amount of tokens that will be spent by the user for the swap
  // note that this does not include gas tokens since they are not guaranteed to be in the same token denomination
  public get amountIn(): BigNumber {
    return this.amountInStart;
  }

  // Values used only for comparing relay quotes vs. other types of quotes
  public get amountInGasAndPortionAdjustedClassic(): BigNumber {
    return this.classicAmountInGasAndPortionAdjusted;
  }

  public get amountOutGasAndPortionAdjustedClassic(): BigNumber {
    return this.classicAmountOutGasAndPortionAdjusted;
  }

  // The number of seconds from now that order decay should begin
  public get startTimeBufferSecs(): number {
    if (this.request.config.startTimeBufferSecs !== undefined) {
      return this.request.config.startTimeBufferSecs;
    }

    return DEFAULT_START_TIME_BUFFER_SECS;
  }

  // The number of seconds from startTime that decay should end
  public get auctionPeriodSecs(): number {
    if (this.request.config.auctionPeriodSecs !== undefined) {
      return this.request.config.auctionPeriodSecs;
    }

    switch (this.chainId) {
      case 1:
        return this.derived.largeTrade ? 120 : 60;
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
    // Should be no decay in output amount
    if (!this.amountOutStart.eq(this.amountOutEnd)) return false;
    // Inputs must only decay upwards
    if (this.amountInStart.gt(this.amountInEnd)) return false;
    return true;
  }

  // static helpers

  // Calculates the gas adjustment for the given quote if processed through UniswapX
  // Swap gas adjustments are paid by the filler in the process of filling a trade
  // and should be applied to endAmounts
  static applyGasAdjustment(amounts: Amounts, classicQuote: ClassicQuote): Amounts {
    const gasAdjustment = RelayQuote.getGasAdjustment(classicQuote);
    if (gasAdjustment.eq(0)) return amounts;
    return RelayQuote.getGasAdjustedAmounts(
      amounts,
      // routing api gas adjustment is already applied
      gasAdjustment,
      classicQuote
    );
  }

  // return the amounts, with the gasAdjustment value taken out
  // classicQuote used to get the gas price values in quote token
  static getGasAdjustedAmounts(amounts: Amounts, gasAdjustment: BigNumber, _classicQuote: ClassicQuote): Amounts {
    const { amountIn: startAmountIn, amountInGasToken: startAmountInGasToken } = amounts;

    // TODO: naively for now just add 25% buffer
    const endAmountInGasToken = startAmountInGasToken.add(gasAdjustment.mul(125).div(100));
    return { amountIn: startAmountIn, amountInGasToken: endAmountInGasToken };
  }

  // Returns the number of gas units extra required to execute this quote through the relayer
  static getGasAdjustment(_classicQuote: ClassicQuote): BigNumber {
    const result = BigNumber.from(0);

    return result.add(RELAY_BASE_GAS);
  }
}
