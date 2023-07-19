import { TradeType } from '@uniswap/sdk-core';
import { DutchOrder, DutchOrderBuilder, DutchOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';

import { PermitTransferFromData } from '@uniswap/permit2-sdk';
import { v4 as uuidv4 } from 'uuid';
import { IQuote, QuoteJSON } from '.';
import { DutchRequest } from '..';
import {
  BPS,
  NATIVE_ADDRESS,
  RoutingType,
  UNISWAPX_BASE_GAS,
  WETH_UNWRAP_GAS,
  WETH_WRAP_GAS,
  WETH_WRAP_GAS_ALREADY_APPROVED,
} from '../../constants';
import { log } from '../../util/log';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInSeconds } from '../../util/time';
import { ClassicQuote } from './ClassicQuote';
import { LogJSON } from './index';

export type DutchQuoteDataJSON = {
  orderInfo: DutchOrderInfoJSON;
  quoteId: string;
  requestId: string;
  encodedOrder: string;
  auctionPeriodSecs: number;
  deadlineBufferSecs: number;
  slippageTolerance: string;
  permitData: PermitTransferFromData;
};

export type DutchQuoteJSON = {
  chainId: number;
  requestId: string;
  quoteId: string;
  tokenIn: string;
  amountIn: string;
  tokenOut: string;
  amountOut: string;
  swapper: string;
  filler?: string;
};

export type ParameterizationOptions = {
  hasApprovedPermit2: boolean;
};

type Amounts = {
  amountIn: BigNumber;
  amountOut: BigNumber;
};

export enum DutchQuoteType {
  RFQ,
  SYNTHETIC,
}

export class DutchQuote implements IQuote {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;
  // Add 1bps price improvmement to favor Dutch
  public static amountOutImprovementExactIn = BigNumber.from(10001);
  public static amountInImprovementExactOut = BigNumber.from(9999);

  // build a dutch quote from an RFQ response
  public static fromResponseBody(request: DutchRequest, body: DutchQuoteJSON, nonce?: string): DutchQuote {
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
      { amountIn: BigNumber.from(body.amountIn), amountOut: BigNumber.from(body.amountOut) },
      request
    );
    return new DutchQuote(
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
      body.swapper,
      DutchQuoteType.RFQ,
      body.filler,
      nonce
    );
  }

  // build a synthetic dutch quote from a classic quote
  public static fromClassicQuote(request: DutchRequest, quote: ClassicQuote): DutchQuote {
    const priceImprovedStartAmounts = this.applyPriceImprovement(
      { amountIn: quote.amountInGasAdjusted, amountOut: quote.amountOutGasAdjusted },
      request.info.type
    );
    const startAmounts = this.applyPreSwapGasAdjustment(priceImprovedStartAmounts, quote);

    const gasAdjustedAmounts = this.applyGasAdjustment(startAmounts, quote);
    const endAmounts = this.applySlippage(gasAdjustedAmounts, request);

    log.info('Synthetic quote parameterization', {
      priceImprovedAmountIn: priceImprovedStartAmounts.amountIn.toString(),
      priceImprovedAmountOut: priceImprovedStartAmounts.amountOut.toString(),
      startAmountIn: startAmounts.amountIn.toString(),
      startAmountOut: startAmounts.amountOut.toString(),
      gasAdjustedAmountIn: gasAdjustedAmounts.amountIn.toString(),
      gasAdjustedAmountOut: gasAdjustedAmounts.amountOut.toString(),
      slippageAdjustedAmountIn: endAmounts.amountIn.toString(),
      slippageAdjustedAmountOut: endAmounts.amountOut.toString(),
    });

    return new DutchQuote(
      quote.createdAt,
      request,
      request.info.tokenInChainId,
      request.info.requestId,
      uuidv4(), // synthetic quote doesn't receive a quoteId from RFQ api, so generate one
      request.info.tokenIn,
      quote.request.info.tokenOut,
      startAmounts.amountIn,
      endAmounts.amountIn,
      startAmounts.amountOut,
      endAmounts.amountOut,
      request.config.swapper,
      DutchQuoteType.SYNTHETIC,
      '', // synthetic quote has no filler
      generateRandomNonce() // synthetic quote has no nonce
    );
  }

  // reparameterize an RFQ quote with awareness of classic
  public static reparameterize(
    quote: DutchQuote,
    classic?: ClassicQuote,
    options?: ParameterizationOptions,
  ): DutchQuote {
    if (!classic) return quote;

    const { amountIn: amountInStart, amountOut: amountOutStart } = this.applyPreSwapGasAdjustment(
      { amountIn: quote.amountInStart, amountOut: quote.amountOutStart },
      classic,
      options
    );

    const classicAmounts = this.applyGasAdjustment(
      { amountIn: classic.amountInGasAdjusted, amountOut: classic.amountOutGasAdjusted },
      classic
    );
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = this.applySlippage(classicAmounts, quote.request);

    log.info('RFQ quote parameterization', {
      startAmountIn: amountInStart.toString(),
      startAmountOut: amountOutStart.toString(),
      gasAdjustedClassicAmountIn: classicAmounts.amountIn.toString(),
      gasAdjustedClassicAmountOut: classicAmounts.amountOut.toString(),
      slippageAdjustedClassicAmountIn: amountInEnd.toString(),
      slippageAdjustedClassicAmountOut: amountOutEnd.toString(),
    });

    return new DutchQuote(
      quote.createdAt,
      quote.request,
      quote.chainId,
      quote.requestId,
      quote.quoteId,
      quote.tokenIn,
      quote.tokenOut,
      amountInStart,
      amountInEnd,
      amountOutStart,
      amountOutEnd,
      quote.swapper,
      quote.quoteType,
      quote.filler,
      quote.nonce
    );
  }

  constructor(
    public readonly createdAt: string,
    public readonly request: DutchRequest,
    public readonly chainId: number,
    public readonly requestId: string,
    public readonly quoteId: string,
    public readonly tokenIn: string,
    public readonly tokenOut: string,
    public readonly amountInStart: BigNumber,
    public readonly amountInEnd: BigNumber,
    public readonly amountOutStart: BigNumber,
    public readonly amountOutEnd: BigNumber,
    public readonly swapper: string,
    public readonly quoteType: DutchQuoteType,
    public readonly filler?: string,
    public readonly nonce?: string
  ) {
    this.createdAt = createdAt || currentTimestampInSeconds();
  }

  public toJSON(): QuoteJSON {
    return {
      orderInfo: this.toOrder().toJSON(),
      encodedOrder: this.toOrder().serialize(),
      quoteId: this.quoteId,
      requestId: this.requestId,
      auctionPeriodSecs: this.request.config.auctionPeriodSecs,
      deadlineBufferSecs: this.request.config.deadlineBufferSecs,
      slippageTolerance: this.request.info.slippageTolerance,
      permitData: this.getPermitData(),
    };
  }

  public toOrder(): DutchOrder {
    const orderBuilder = new DutchOrderBuilder(this.chainId);
    const decayStartTime = Math.floor(Date.now() / 1000);
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .decayStartTime(decayStartTime)
      .decayEndTime(decayStartTime + this.request.config.auctionPeriodSecs)
      .deadline(decayStartTime + this.request.config.auctionPeriodSecs + this.request.config.deadlineBufferSecs)
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
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
        recipient: this.request.config.swapper,
      });

    if (this.filler) {
      builder.exclusiveFiller(this.filler, BigNumber.from(this.request.config.exclusivityOverrideBps));
    }

    return builder.build();
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
      swapper: this.swapper,
      filler: this.filler,
      routing: RoutingType[this.routingType],
      slippage: parseFloat(this.request.info.slippageTolerance),
      createdAt: this.createdAt,
    };
  }

  getPermitData(): PermitTransferFromData {
    return this.toOrder().permitData();
  }

  public get amountOut(): BigNumber {
    return this.amountOutStart;
  }

  public get amountIn(): BigNumber {
    return this.amountInStart;
  }

  validate(): boolean {
    if (this.amountOutStart.lt(this.amountOutEnd)) return false;
    if (this.amountInStart.gt(this.amountInEnd)) return false;
    return true;
  }

  // static helpers

  static applySlippage(amounts: Amounts, request: DutchRequest): Amounts {
    const { amountIn: amountInStart, amountOut: amountOutStart } = amounts;
    const isExactIn = request.info.type === TradeType.EXACT_INPUT;
    if (isExactIn) {
      return {
        amountIn: amountInStart,
        amountOut: amountOutStart.mul(BPS - parseSlippageToleranceBps(request.info.slippageTolerance)).div(BPS),
      };
    } else {
      return {
        amountIn: amountInStart.mul(BPS + parseSlippageToleranceBps(request.info.slippageTolerance)).div(BPS),
        amountOut: amountOutStart,
      };
    }
  }

  static applyPriceImprovement(amounts: Amounts, type: TradeType): Amounts {
    const { amountIn, amountOut } = amounts;
    if (type === TradeType.EXACT_INPUT) {
      return { amountIn, amountOut: amountOut.mul(DutchQuote.amountOutImprovementExactIn).div(BPS) };
    } else {
      return { amountIn: amountIn.mul(DutchQuote.amountInImprovementExactOut).div(BPS), amountOut };
    }
  }

  // Calculates the pre-swap gas adjustment for the given quote if processed through UniswapX
  // pre-swap gas adjustments are paid directly by the user pre-swap
  // and should be applied to startAmounts
  // e.g. ETH wraps
  static applyPreSwapGasAdjustment(
    amounts: Amounts,
    classicQuote: ClassicQuote,
    options?: ParameterizationOptions
  ): Amounts {
    const gasAdjustment = DutchQuote.getPreSwapGasAdjustment(classicQuote, options);
    if (gasAdjustment.eq(0)) return amounts;
    return DutchQuote.getGasAdjustedAmounts(amounts, gasAdjustment, classicQuote);
  }

  // Calculates the gas adjustment for the given quote if processed through UniswapX
  // Swap gas adjustments are paid by the filler in the process of filling a trade
  // and should be applied to endAmounts
  static applyGasAdjustment(amounts: Amounts, classicQuote: ClassicQuote): Amounts {
    const gasAdjustment = DutchQuote.getGasAdjustment(classicQuote);
    if (gasAdjustment.eq(0)) return amounts;
    return DutchQuote.getGasAdjustedAmounts(
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
    const { amountIn: startAmountIn, amountOut: startAmountOut } = amounts;
    const info = classicQuote.request.info;

    // get ratio of gas used to gas used with WETH wrap
    const gasUseEstimate = BigNumber.from(classicQuote.toJSON().gasUseEstimate);
    const originalGasQuote = BigNumber.from(classicQuote.toJSON().gasUseEstimateQuote);
    const gasPriceWei = BigNumber.from(classicQuote.toJSON().gasPriceWei);

    const originalGasNative = gasUseEstimate.mul(gasPriceWei);
    const gasAdjustmentNative = gasAdjustment.mul(gasPriceWei);
    // use the ratio of original gas in native and original gas in quote tokens
    // to calculate the gas adjustment in quote tokens
    const gasAdjustmentQuote = originalGasQuote.mul(gasAdjustmentNative).div(originalGasNative);

    if (info.type === TradeType.EXACT_INPUT) {
      const amountOut = gasAdjustmentQuote.gt(startAmountOut)
        ? BigNumber.from(0)
        : startAmountOut.sub(gasAdjustmentQuote);
      return {
        amountIn: startAmountIn,
        amountOut: amountOut.lt(0) ? BigNumber.from(0) : amountOut,
      };
    } else {
      return {
        amountIn: startAmountIn.add(gasAdjustmentQuote),
        amountOut: startAmountOut,
      };
    }
  }

  // Returns the number of gas units extra paid by the user before the swap
  static getPreSwapGasAdjustment(classicQuote: ClassicQuote, options?: ParameterizationOptions): BigNumber {
    let result = BigNumber.from(0);

    // uniswapx does not naturally support ETH input, but user still has to wrap it
    // so should be considered in the quote pricing
    if (classicQuote.request.info.tokenIn === NATIVE_ADDRESS) {
      const wrapAdjustment = options?.hasApprovedPermit2 ? WETH_WRAP_GAS_ALREADY_APPROVED : WETH_WRAP_GAS;
      result = result.add(wrapAdjustment);
    }

    return result;
  }

  // Returns the number of gas units extra required to execute this quote through UniswapX
  static getGasAdjustment(classicQuote: ClassicQuote): BigNumber {
    let result = BigNumber.from(0);

    // fill contract must unwrap WETH output tokens
    if (classicQuote.request.info.tokenOut === NATIVE_ADDRESS) {
      result = result.add(WETH_UNWRAP_GAS);
    }

    return result.add(UNISWAPX_BASE_GAS);
  }
}

// parses a slippage tolerance as a percent string
// and returns it as a number between 0 and 10000
function parseSlippageToleranceBps(slippageTolerance: string): number {
  return Math.round(parseFloat(slippageTolerance) * 100);
}
