import { TradeType } from '@uniswap/sdk-core';
import { DutchInput, DutchOrder, DutchOrderInfoJSON, DutchOutput, UnsignedV2DutchOrder } from '@uniswap/uniswapx-sdk';
import { BigNumber } from 'ethers';

import { PermitTransferFromData } from '@uniswap/permit2-sdk';
import { DutchV2QuoteDataJSON, IQuote, SharedOrderQuoteDataJSON } from '.';
import { DutchQuoteRequest } from '..';
import { ChainConfigManager } from '../../config/ChainConfigManager';
import {
  BPS,
  frontendAndUraEnablePortion,
  NATIVE_ADDRESS,
  QuoteType,
  RoutingType,
  UNISWAPX_BASE_GAS,
  WETH_UNWRAP_GAS,
  WETH_WRAP_GAS,
  WETH_WRAP_GAS_ALREADY_APPROVED,
} from '../../constants';
import { Portion } from '../../fetchers/PortionFetcher';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { ClassicQuote } from './ClassicQuote';
import { LogJSON } from './index';

export type DutchQuoteDerived = {
  largeTrade: boolean;
};

export type DutchQuoteDataJSON = SharedOrderQuoteDataJSON & {
  orderInfo: DutchOrderInfoJSON;
  startTimeBufferSecs: number;
  auctionPeriodSecs: number;
  deadlineBufferSecs: number;
  permitData: PermitTransferFromData;
  portionBips?: number;
  portionAmount?: string;
  portionRecipient?: string;
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
  largeTrade: boolean;
};

export type Amounts = {
  amountIn: BigNumber;
  amountOut: BigNumber;
};

export type DutchQuoteConstructorArgs = {
  createdAtMs?: string;
  request: DutchQuoteRequest;
  tokenInChainId: number;
  tokenOutChainId: number;
  requestId: string;
  quoteId: string;
  tokenIn: string;
  tokenOut: string;
  amountInStart: BigNumber;
  amountInEnd: BigNumber;
  amountOutStart: BigNumber;
  amountOutEnd: BigNumber;
  swapper: string;
  quoteType: QuoteType;
  filler?: string;
  nonce?: string;
  portion?: Portion;
  derived?: DutchQuoteDerived;
};

// A common class for both DutchV1 and DutchV2 quotes
export abstract class DutchQuote<T extends DutchQuoteRequest> implements IQuote {
  public readonly createdAt: string;
  public derived: DutchQuoteDerived;
  public routingType: RoutingType.DUTCH_LIMIT | RoutingType.DUTCH_V2;
  public abstract readonly defaultDeadlienBufferInSecs: number;
  // Add 1bps price improvmement to favor Dutch
  public static defaultPriceImprovementBps = 1;

  public readonly request: T;
  public readonly createdAtMs: string;
  public readonly chainId: number;
  public readonly requestId: string;
  public readonly quoteId: string;
  public readonly tokenIn: string;
  public readonly tokenOut: string;
  public readonly amountInStart: BigNumber;
  public readonly amountInEnd: BigNumber;
  public readonly amountOutStart: BigNumber;
  public readonly amountOutEnd: BigNumber;
  public readonly swapper: string;
  public readonly quoteType: QuoteType;
  public readonly filler?: string;
  public readonly nonce?: string;
  public readonly portion?: Portion;

  public constructor(args: DutchQuoteConstructorArgs) {
    Object.assign(this, args, {
      chainId: args.tokenInChainId,
      createdAtMs: args.createdAtMs || currentTimestampInMs(),
      createdAt: timestampInMstoSeconds(parseInt(args.createdAtMs || currentTimestampInMs())),
      derived: args.derived || { largeTrade: false },
    });
  }
  abstract toJSON(): DutchQuoteDataJSON | DutchV2QuoteDataJSON;

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
      amountInGasAdjusted:
        this.request.info.type === TradeType.EXACT_OUTPUT ? this.amountInGasAdjusted.toString() : undefined,
      amountInGasAndPortionAdjusted:
        this.request.info.type === TradeType.EXACT_OUTPUT ? this.amountInGasAndPortionAdjusted.toString() : undefined,
      amountOutGasAdjusted: this.amountOutStart.toString(),
      amountOutGasAndPortionAdjusted:
        this.request.info.type === TradeType.EXACT_INPUT ? this.amountOutGasAndPortionAdjusted.toString() : undefined,
      swapper: this.swapper,
      filler: this.filler,
      routing: RoutingType[this.routingType],
      slippage: parseFloat(this.request.info.slippageTolerance),
      createdAt: this.createdAt,
      createdAtMs: this.createdAtMs,
      portionBips: this.portion?.bips,
      portionRecipient: this.portion?.recipient,
      portionAmountOutStart: this.portionAmountOutStart.toString(),
      portionAmountOutEnd: this.portionAmountOutEnd.toString(),
    };
  }

  public abstract toOrder(): DutchOrder | UnsignedV2DutchOrder;

  getPermitData(): PermitTransferFromData {
    return this.toOrder().permitData();
  }

  public get amountOut(): BigNumber {
    return this.amountOutStart;
  }

  public get amountIn(): BigNumber {
    // The correct amount in should be amountInStart - portionAmountInStart
    // But many places use amountIn, so we better stay safe untouched
    return this.amountInStart;
  }

  // The number of seconds from endTime that the order should expire
  public get deadlineBufferSecs(): number {
    if (this.request.config.deadlineBufferSecs !== undefined) {
      return this.request.config.deadlineBufferSecs;
    }
    const quoteConfig = ChainConfigManager.getQuoteConfig(this.chainId, this.request.routingType);
    return quoteConfig.deadlineBufferSecs ?? this.defaultDeadlienBufferInSecs;
  }

  public get portionAmountOutStart(): BigNumber {
    return this.amountOutStart.mul(this.portion?.bips ?? 0).div(BPS);
  }

  public get portionAmountOutEnd(): BigNumber {
    return this.amountOutEnd.mul(this.portion?.bips ?? 0).div(BPS);
  }

  public get portionAmountInStart(): BigNumber {
    // we have to multiply first, and then divide
    // because BigNumber doesn't support decimals
    return this.portionAmountOutStart.mul(this.amountInStart).div(this.amountOutStart.add(this.portionAmountOutStart));
  }

  public get amountInGasAdjusted(): BigNumber {
    return this.amountIn.sub(this.portionAmountInStart);
  }

  public get amountInGasAndPortionAdjusted(): BigNumber {
    return this.amountIn;
  }

  public get amountOutGasAndPortionAdjusted(): BigNumber {
    return this.amountOut.sub(this.portionAmountOutStart);
  }

  validate(): boolean {
    if (this.amountOutStart.lt(this.amountOutEnd)) return false;
    if (this.amountInStart.gt(this.amountInEnd)) return false;
    return true;
  }

  isExclusiveQuote(): boolean {
    return !!this.filler && this.filler !== NATIVE_ADDRESS;
  }

  isOpenQuote(): boolean {
    return !this.isExclusiveQuote();
  }

  // static helpers

  static applySlippage(amounts: Amounts, request: DutchQuoteRequest): Amounts {
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

  static applyPriceImprovement(
    amounts: Amounts,
    type: TradeType,
    priceImprovementBps: number = DutchQuote.defaultPriceImprovementBps
  ): Amounts {
    const { amountIn, amountOut } = amounts;
    if (type === TradeType.EXACT_INPUT) {
      const amountOutImprovementExactIn = BigNumber.from(BPS).add(priceImprovementBps);
      return { amountIn, amountOut: amountOut.mul(amountOutImprovementExactIn).div(BPS) };
    } else {
      const amountInImprovementExactOut = BigNumber.from(BPS).sub(priceImprovementBps);
      return { amountIn: amountIn.mul(amountInImprovementExactOut).div(BPS), amountOut };
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

  /**
   * Shift the start and end price down by the provided BPs
   */
  static applyBufferToInputOutput(
    input: DutchInput,
    output: DutchOutput,
    type: TradeType,
    bps = 0
  ): {
    input: DutchInput;
    output: DutchOutput;
  } {
    if (type === TradeType.EXACT_INPUT) {
      return {
        input,
        output: {
          ...output,
          // add buffer to output
          startAmount: output.startAmount.mul(BPS - bps).div(BPS),
          endAmount: output.endAmount.mul(BPS - bps).div(BPS),
        },
      };
    } else {
      return {
        input: {
          ...input,
          // add buffer to input
          startAmount: input.startAmount.mul(BPS + bps).div(BPS),
          endAmount: input.endAmount.mul(BPS + bps).div(BPS),
        },
        output,
      };
    }
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

// baseOutput is the output that we would use for the swapper if no portion
// returns list of outputs including portion
export function getPortionAdjustedOutputs(
  baseOutput: DutchOutput,
  tradeType: TradeType,
  sendPortionEnabled?: boolean,
  portion?: Portion
): DutchOutput[] {
  if (portion === undefined || !frontendAndUraEnablePortion(sendPortionEnabled)) return [baseOutput];
  const portionStartAmount = baseOutput.startAmount.mul(portion.bips).div(BPS);
  const portionEndAmount = baseOutput.endAmount.mul(portion.bips).div(BPS);

  const outputs: DutchOutput[] = [];

  // Output to swapper
  if (tradeType === TradeType.EXACT_INPUT) {
    outputs.push({
      token: baseOutput.token,
      startAmount: baseOutput.startAmount.sub(portionStartAmount),
      endAmount: baseOutput.endAmount.sub(portionEndAmount),
      recipient: baseOutput.recipient,
    });
  } else if (tradeType === TradeType.EXACT_OUTPUT) {
    // Amount to swapper
    // for exact output, we append portion rather than subtracting it from the base
    outputs.push({
      token: baseOutput.token,
      startAmount: baseOutput.startAmount,
      endAmount: baseOutput.endAmount,
      recipient: baseOutput.recipient,
    });
  }

  // Output to portion recipient
  outputs.push({
    token: baseOutput.token,
    startAmount: portionStartAmount,
    endAmount: portionEndAmount,
    recipient: portion.recipient,
  });

  return outputs;
}

// parses a slippage tolerance as a percent string
// and returns it as a number between 0 and 10000
function parseSlippageToleranceBps(slippageTolerance: string): number {
  return Math.round(parseFloat(slippageTolerance) * 100);
}
