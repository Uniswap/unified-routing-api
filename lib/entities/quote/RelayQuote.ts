import { RelayOrder, RelayOrderBuilder, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';

import { PermitTransferFromData } from '@uniswap/permit2-sdk';
import { v4 as uuidv4 } from 'uuid';
import { IQuote } from '.';
import {
  DEFAULT_START_TIME_BUFFER_SECS,
  NATIVE_ADDRESS,
  RELAY_BASE_GAS,
  RoutingType
} from '../../constants';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { ClassicQuote } from './ClassicQuote';
import { LogJSON } from './index';
import { RelayRequest } from '../request/RelayRequest';

export type RelayQuoteDerived = {
  largeTrade: boolean;
}

export type RelayQuoteDataJSON = {
  orderInfo: RelayOrderInfoJSON;
  quoteId: string;
  requestId: string;
  encodedOrder: string;
  orderHash: string;
  startTimeBufferSecs: number;
  auctionPeriodSecs: number;
  deadlineBufferSecs: number;
  permitData: PermitTransferFromData;
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
  filler?: string;
};

export type ParameterizationOptions = {
  hasApprovedPermit2: boolean;
  largeTrade: boolean;
};

type Amounts = {
  amountIn: BigNumber;
  amountInGasToken: BigNumber;
};

export class RelayQuote implements IQuote {
  public readonly createdAt: string;
  public derived: RelayQuoteDerived;
  public routingType: RoutingType.RELAY = RoutingType.RELAY;

  // build a relay quote from a classic quote
  public static fromClassicQuote(request: RelayRequest, quote: ClassicQuote): RelayQuote {
    // Relay quotes require a gas token estimation
    if(!quote.gasUseEstimateGasToken) {
      throw new Error('Classic quote must have gasUseEstimateGasToken');
    }
    const startAmounts = { amountIn: quote.amountIn, amountInGasToken: quote.gasUseEstimateGasToken };
    const gasAdjustedAmounts = this.applyGasAdjustment(startAmounts, quote);
    const endAmounts = this.applySlippage(gasAdjustedAmounts, request);

    return new RelayQuote(
      quote.createdAtMs,
      request,
      request.info.tokenInChainId,
      request.info.requestId,
      uuidv4(), // synthetic quote doesn't receive a quoteId from RFQ api, so generate one
      request.info.tokenIn,
      quote.request.info.tokenOut,
      startAmounts.amountIn, 
      endAmounts.amountIn,
      quote.amountOut, // classic quote has no gas adjustment
      quote.amountOut, // classic quote has no gas adjustment
      startAmounts.amountInGasToken,
      endAmounts.amountInGasToken,
      request.config.swapper,
      NATIVE_ADDRESS, // synthetic quote has no filler
      generateRandomNonce(), // synthetic quote has no nonce
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
    public readonly filler?: string,
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
      permitData: this.getPermitData()
    };
  }

  public toOrder(): RelayOrder {
    const orderBuilder = new RelayOrderBuilder(this.chainId);
    const decayStartTime = Math.floor(Date.now() / 1000);
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .deadline(decayStartTime + this.auctionPeriodSecs + this.deadlineBufferSecs)
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
      .nonce(BigNumber.from(nonce))
      .input({
        token: this.tokenIn,
        startAmount: this.amountInStart,
        endAmount: this.amountInEnd,
      });


    // Amount to swapper
    builder.output({
            token: this.tokenOut,
            startAmount: this.amountOutStart,
            endAmount: this.amountOutEnd,
            recipient: this.request.config.swapper,
    });
    
    
    // Amount to swapper
    builder.output({
            token: this.tokenOut,
            startAmount: this.amountOutStart,
            endAmount: this.amountOutEnd,
            recipient: this.request.config.swapper,
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
      amountInGasAdjusted: this.amountIn.toString(),
      swapper: this.swapper,
      filler: this.filler,
      routing: RoutingType[this.routingType],
      slippage: parseFloat(this.request.info.slippageTolerance),
      createdAt: this.createdAt,
      createdAtMs: this.createdAtMs
    };
  }

  // reparameterize an RFQ quote with awareness of classic
  public static reparameterize(
      quote: RelayQuote,
      classic: ClassicQuote,
      options?: ParameterizationOptions
    ): RelayQuote {
      if (!classic) return quote;
  
      const { amountIn: amountInStart, amountInGasToken: amountGasTokenStart } = this.applyPreSwapGasAdjustment(
        { amountIn: quote.amountInStart, amountInGasToken: classic.gasUseEstimateGasToken },
        classic,
        options
      );
  
      const classicAmounts = this.applyGasAdjustment(
        { amountIn: classic.amountInGasAdjusted, amountInGasToken: classic.amountOutGasAdjusted },
        classic
      );

      const { amountIn: amountInEnd, amountInGasToken: amountGasTokenEnd } = this.applySlippage(classicAmounts, quote.request);
  
      return new RelayQuote(
        quote.createdAtMs,
        quote.request,
        quote.chainId,
        quote.requestId,
        quote.quoteId,
        quote.tokenIn,
        quote.tokenOut,
        amountInStart,
        amountInEnd,
        classic.amountOut,
        classic.amountOut,
        amountGasTokenStart,
        amountGasTokenEnd,
        quote.swapper,
        quote.filler,
        quote.nonce,
      );
  }

  getPermitData(): PermitTransferFromData {
    return this.toOrder().permitData();
  }

  // The total amount of tokens that will be received by the user from the relayed swap
  public get amountOut(): BigNumber {
    return this.amountOutStart;
  }

  // The total amount of tokens that will be spent by the user, including gas tokens
  public get amountIn(): BigNumber {
    return this.amountInStart.add(this.amountInGasTokenStart);
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
    if (this.amountOutStart.lt(this.amountOutEnd)) return false;
    if (this.amountInStart.gt(this.amountInEnd)) return false;
    return true;
  }

  // static helpers

  // Slipapge is handled in the encoded call and not checked by the reactor
  static applySlippage(amounts: Amounts, request: RelayRequest): Amounts {
    return amounts;
  }

  // Calculates the gas adjustment for the given quote if processed through UniswapX
  // Swap gas adjustments are paid by the filler in the process of filling a trade
  // and should be applied to endAmounts
  static applyGasAdjustment(amounts: Amounts, classicQuote: ClassicQuote): Amounts {
    const gasAdjustment = RelayQuote.getGasAdjustment(classicQuote);
    if (gasAdjustment.eq(0)) return amounts;
    return RelayQuote.getGasAdjustedAmounts(
      amounts,
      // routing api gas adjustment is already applied
      // apply both the uniswapx gas adjustment
      gasAdjustment,
      classicQuote
    );
  }

  // return the amounts, with the gasAdjustment value taken out
  // classicQuote used to get the gas price values in quote token
  static getGasAdjustedAmounts(amounts: Amounts, gasAdjustment: BigNumber, classicQuote: ClassicQuote): Amounts {
    const { amountIn: startAmountIn, amountInGasToken: startAmountInGasToken } = amounts;

    // TODO: naively for now just add 25% buffer
    const endAmountInGasToken = startAmountInGasToken.add(gasAdjustment.mul(125).div(100));
    return { amountIn: startAmountIn, amountInGasToken: endAmountInGasToken };
  }

  // Returns the number of gas units extra required to execute this quote through the relayer
  static getGasAdjustment(classicQuote: ClassicQuote): BigNumber {
    let result = BigNumber.from(0);

    return result.add(RELAY_BASE_GAS);
  }
}