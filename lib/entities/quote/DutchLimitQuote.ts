import { DutchLimitOrderBuilder, DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { BigNumber, ethers } from 'ethers';

import { v4 as uuidv4 } from 'uuid';
import { Quote, QuoteJSON } from '.';
import { DutchLimitRequest, QuoteRequestInfo } from '..';
import {
  GOUDA_BASE_GAS,
  HUNDRED_PERCENT,
  NATIVE_ADDRESS,
  RoutingType,
  WETH_UNWRAP_GAS,
  WETH_WRAP_GAS,
} from '../../constants';
import { currentTimestampInSeconds } from '../../util/time';
import { ClassicQuote } from './ClassicQuote';
import { LogJSON } from './index';

export type DutchLimitQuoteJSON = {
  chainId: number;
  requestId: string;
  quoteId: string;
  tokenIn: string;
  amountIn: string;
  tokenOut: string;
  amountOut: string;
  offerer: string;
  filler?: string;
};

type Amounts = {
  amountIn: BigNumber;
  amountOut: BigNumber;
};

export class DutchLimitQuote implements Quote {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;
  // TODO: replace with better values
  // public static improvementExactIn = BigNumber.from(10100);
  // public static improvementExactOut = BigNumber.from(9900);
  public static improvementExactIn = BigNumber.from(10010);
  public static improvementExactOut = BigNumber.from(9990);

  // build a dutch quote from an RFQ response
  public static fromResponseBody(
    request: DutchLimitRequest,
    body: DutchLimitQuoteJSON,
    nonce?: string
  ): DutchLimitQuote {
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
      request.info,
      BigNumber.from(body.amountIn),
      BigNumber.from(body.amountOut)
    );
    return new DutchLimitQuote(
      currentTimestampInSeconds(),
      request,
      body.chainId,
      body.requestId,
      body.quoteId,
      body.tokenIn,
      body.tokenOut,
      BigNumber.from(body.amountIn),
      amountInEnd,
      BigNumber.from(body.amountOut),
      amountOutEnd,
      body.offerer,
      body.filler,
      nonce
    );
  }

  // build a synthetic dutch quote from a classic quote
  public static fromClassicQuote(request: DutchLimitRequest, quote: ClassicQuote): DutchLimitQuote {
    const { amountIn, amountOut } = DutchLimitQuote.applyGasAdjustment(quote);
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
      request.info,
      amountIn,
      amountOut
    );
    return new DutchLimitQuote(
      quote.createdAt,
      request,
      request.info.tokenInChainId,
      request.info.requestId,
      uuidv4(), // synthetic quote doesn't receive a quoteId from RFQ api, so generate one
      request.info.tokenIn,
      quote.request.info.tokenOut,
      amountIn,
      amountInEnd,
      amountOut,
      amountOutEnd,
      request.config.offerer,
      '', // synthetic quote has no filler
      undefined // synthetic quote has no nonce
    );
  }

  // reparameterize an RFQ quote with awareness of classic
  public static reparameterize(quote: DutchLimitQuote, classic?: ClassicQuote): DutchLimitQuote {
    if (!classic) return quote;
    const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchLimitQuote.applyGasAdjustment(classic);
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
      quote.request.info,
      amountInClassic,
      amountOutClassic
    );
    return new DutchLimitQuote(
      quote.createdAt,
      quote.request,
      quote.chainId,
      quote.requestId,
      quote.quoteId,
      quote.tokenIn,
      quote.tokenOut,
      quote.amountInStart,
      amountInEnd,
      quote.amountOutStart,
      amountOutEnd,
      quote.offerer,
      quote.filler,
      quote.nonce
    );
  }

  constructor(
    public readonly createdAt: string,
    public readonly request: DutchLimitRequest,
    public readonly chainId: number,
    public readonly requestId: string,
    public readonly quoteId: string,
    public readonly tokenIn: string,
    public readonly tokenOut: string,
    public readonly amountInStart: BigNumber,
    public readonly amountInEnd: BigNumber,
    public readonly amountOutStart: BigNumber,
    public readonly amountOutEnd: BigNumber,
    public readonly offerer: string,
    public readonly filler?: string,
    public readonly nonce?: string
  ) {
    this.createdAt = createdAt || currentTimestampInSeconds();
  }

  public toJSON(): QuoteJSON {
    return {
      ...this.toOrder(),
      quoteId: this.quoteId,
      requestId: this.requestId,
    };
  }

  public toOrder(): DutchLimitOrderInfoJSON {
    const orderBuilder = new DutchLimitOrderBuilder(this.chainId);
    const startTime = Math.floor(Date.now() / 1000);
    const nonce = this.nonce ?? this.generateRandomNonce();
    const decayStartTime = startTime;

    const builder = orderBuilder
      .startTime(decayStartTime)
      .endTime(decayStartTime + this.request.config.auctionPeriodSecs)
      .deadline(decayStartTime + this.request.config.auctionPeriodSecs)
      .offerer(this.request.config.offerer)
      .nonce(BigNumber.from(nonce))
      .input({
        token: this.tokenIn,
        startAmount: this.amountInStart,
        endAmount: this.amountInEnd,
      })
      .output({
        token: this.tokenOut,
        startAmount: this.amountOutStart,
        endAmount: this.amountOutEnd,
        recipient: this.request.config.offerer,
      });

    if (this.filler) {
      builder.exclusiveFiller(this.filler, BigNumber.from(this.request.config.exclusivityOverrideBps));
    }

    const order = builder.build();

    return order.toJSON();
  }

  public toLog(): LogJSON {
    return {
      tokenInChainId: this.chainId,
      tokenOutChainId: this.chainId,
      requestId: this.requestId,
      quoteId: this.quoteId,
      tokenIn: this.tokenIn,
      tokenOut: this.tokenOut,
      amountIn: this.amountInStart.toString(),
      amountOut: this.amountOutStart.toString(),
      endAmountIn: this.amountInEnd.toString(),
      endAmountOut: this.amountOutEnd.toString(),
      amountInGasAdjusted: this.amountInStart.toString(),
      amountOutGasAdjusted: this.amountOutStart.toString(),
      offerer: this.offerer,
      filler: this.filler,
      routing: RoutingType[this.routingType],
      slippage: this.request.info.slippageTolerance ? parseFloat(this.request.info.slippageTolerance) : -1,
      createdAt: this.createdAt,
    };
  }

  private generateRandomNonce(): string {
    return ethers.BigNumber.from(ethers.utils.randomBytes(31)).shl(8).toString();
  }

  public get amountOut(): BigNumber {
    return this.amountOutStart;
  }

  public get amountIn(): BigNumber {
    return this.amountInStart;
  }

  // static helpers

  static calculateEndAmountFromSlippage(
    info: QuoteRequestInfo,
    amountInStart: BigNumber,
    amountOutStart: BigNumber
  ): Amounts {
    const isExactIn = info.type === TradeType.EXACT_INPUT;
    if (isExactIn) {
      return {
        amountIn: amountInStart,
        amountOut: amountOutStart.mul(HUNDRED_PERCENT.sub(BigNumber.from(info.slippageTolerance))).div(HUNDRED_PERCENT),
      };
    } else {
      return {
        amountIn: amountInStart.mul(HUNDRED_PERCENT.add(BigNumber.from(info.slippageTolerance))).div(HUNDRED_PERCENT),
        amountOut: amountOutStart,
      };
    }
  }

  // Calculates the gas adjustment for the given quote if processed through Gouda
  static applyGasAdjustment(classicQuote: ClassicQuote): { amountIn: BigNumber; amountOut: BigNumber } {
    const info = classicQuote.request.info;
    const gasAdjustment = DutchLimitQuote.getGasAdjustment(classicQuote);

    // get ratio of gas used to gas used with WETH wrap
    const gasUseEstimate = BigNumber.from(classicQuote.toJSON().gasUseEstimate);
    const gasUseRatio = gasUseEstimate.add(gasAdjustment).mul(100).div(gasUseEstimate);

    // multiply the original gasUseEstimate in quoteToken by the ratio
    const newGasUseEstimateQuote = BigNumber.from(classicQuote.toJSON().gasUseEstimateQuote).mul(gasUseRatio).div(100);

    if (info.type === TradeType.EXACT_INPUT) {
      const amountOut = newGasUseEstimateQuote.gt(classicQuote.amountOut)
        ? BigNumber.from(0)
        : classicQuote.amountOut
            .sub(newGasUseEstimateQuote)
            .mul(DutchLimitQuote.improvementExactIn)
            .div(HUNDRED_PERCENT);
      return {
        amountIn: info.amount,
        amountOut: amountOut.lt(0) ? BigNumber.from(0) : amountOut,
      };
    } else {
      return {
        amountIn: classicQuote.amountIn
          .add(newGasUseEstimateQuote)
          .mul(DutchLimitQuote.improvementExactOut)
          .div(HUNDRED_PERCENT),
        amountOut: info.amount,
      };
    }
  }

  // Returns the number of gas units extra required to execute this quote through Gouda
  static getGasAdjustment(classicQuote: ClassicQuote): BigNumber {
    const wethAdjustment = DutchLimitQuote.getWETHGasAdjustment(classicQuote);
    return wethAdjustment.add(GOUDA_BASE_GAS);
  }

  // Returns the number of gas units to wrap ETH if required
  static getWETHGasAdjustment(quote: ClassicQuote): BigNumber {
    const info = quote.request.info;
    let result = BigNumber.from(0);

    // gouda does not naturally support ETH input, but user still has to wrap it
    // so should be considered in the quote pricing
    if (info.tokenIn === NATIVE_ADDRESS) {
      result = result.add(WETH_WRAP_GAS);
    }

    // fill contract must unwrap WETH output tokens
    if (info.tokenOut === NATIVE_ADDRESS) {
      result = result.add(WETH_UNWRAP_GAS);
    }

    return result;
  }
}
