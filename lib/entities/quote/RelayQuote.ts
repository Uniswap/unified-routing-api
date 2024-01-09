import { TradeType } from '@uniswap/sdk-core';
import { RelayOrder, RelayOrderBuilder, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';

import { PermitTransferFromData } from '@uniswap/permit2-sdk';
import { v4 as uuidv4 } from 'uuid';
import { IQuote } from '.';
import { DutchRequest } from '..';
import {
  BPS,
  DEFAULT_START_TIME_BUFFER_SECS,
  frontendAndUraEnablePortion,
  NATIVE_ADDRESS,
  OPEN_QUOTE_START_TIME_BUFFER_SECS,
  RoutingType,
  UNISWAPX_BASE_GAS,
  WETH_UNWRAP_GAS,
  WETH_WRAP_GAS,
  WETH_WRAP_GAS_ALREADY_APPROVED
} from '../../constants';
import { Portion } from '../../fetchers/PortionFetcher';
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
  portionBips?: number;
  portionAmount?: string;
  portionRecipient?: string;
};

export type RelayQuoteJSON = {
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

type Amounts = {
  amountIn: BigNumber;
  amountOut: BigNumber;
};

export class RelayQuote implements IQuote {
  public readonly createdAt: string;
  public derived: RelayQuoteDerived;
  public routingType: RoutingType.RELAY = RoutingType.RELAY;

  // build a relay quote from a classic quote
  public static fromClassicQuote(request: RelayRequest, quote: ClassicQuote): RelayQuote {
    const startAmounts = this.applyPreSwapGasAdjustment({ amountIn: quote.amountInGasAdjusted, amountOut: quote.amountOutGasAdjusted }, quote);
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
      startAmounts.amountOut,
      endAmounts.amountOut,
      request.config.swapper,
      NATIVE_ADDRESS, // synthetic quote has no filler
      generateRandomNonce(), // synthetic quote has no nonce
      quote.getPortionBips(),
      quote.getPortionRecipient()
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
    public readonly amountInStart: BigNumber,
    public readonly amountInEnd: BigNumber,
    public readonly amountOutStart: BigNumber,
    public readonly amountOutEnd: BigNumber,
    public readonly swapper: string,
    public readonly filler?: string,
    public readonly nonce?: string,
    public readonly portionBips?: number,
    public readonly portionRecipient?: string,
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
      // NOTE: important for URA to return 0 bps and amount, in case of no portion.
      // this is FE requirement
      portionBips: frontendAndUraEnablePortion(this.request.info.sendPortionEnabled) ? this.portionBips ?? 0 : undefined,
      portionAmount: frontendAndUraEnablePortion(this.request.info.sendPortionEnabled) ? this.portionAmountOutStart.toString() ?? '0' : undefined,
      portionRecipient: this.portionRecipient,
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

    if (this.portionRecipient && this.portionBips && frontendAndUraEnablePortion(this.request.info.sendPortionEnabled)) {
      if (this.request.info.type === TradeType.EXACT_INPUT) {
        // Amount to swapper
        builder.output({
          token: this.tokenOut,
          startAmount: this.amountOutStart.sub(this.portionAmountOutStart),
          endAmount: this.amountOutEnd.sub(this.portionAmountOutEnd),
          recipient: this.request.config.swapper,
        });
      } else if (this.request.info.type === TradeType.EXACT_OUTPUT) {
        // Amount to swapper
        builder.output({
          token: this.tokenOut,
          startAmount: this.amountOutStart,
          endAmount: this.amountOutEnd,
          recipient: this.request.config.swapper,
        });
      }

      // Amount to portion recipient
      builder.output({
        token: this.tokenOut,
        startAmount: this.portionAmountOutStart,
        endAmount: this.portionAmountOutEnd,
        recipient: this.portionRecipient,
      });
    } else {
      // Amount to swapper
      builder.output({
        token: this.tokenOut,
        startAmount: this.amountOutStart,
        endAmount: this.amountOutEnd,
        recipient: this.request.config.swapper,
      });
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
      amountInGasAndPortionAdjusted: this.request.info.type === TradeType.EXACT_OUTPUT ? this.amountInGasAndPortionAdjusted.toString() : undefined,
      amountOutGasAdjusted: this.amountOutStart.toString(),
      amountOutGasAndPortionAdjusted: this.request.info.type === TradeType.EXACT_INPUT ? this.amountOutGasAndPortionAdjusted.toString() : undefined,
      swapper: this.swapper,
      filler: this.filler,
      routing: RoutingType[this.routingType],
      slippage: parseFloat(this.request.info.slippageTolerance),
      createdAt: this.createdAt,
      createdAtMs: this.createdAtMs,
      portionBips: this.portionBips,
      portionRecipient: this.portionRecipient,
      portionAmountOutStart: this.portionAmountOutStart.toString(),
      portionAmountOutEnd: this.portionAmountOutEnd.toString(),
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

  // The number of seconds from now that order decay should begin
  public get startTimeBufferSecs(): number {
    if (this.request.config.startTimeBufferSecs !== undefined) {
      return this.request.config.startTimeBufferSecs;
    }

    if (this.isOpenQuote()) {
      return OPEN_QUOTE_START_TIME_BUFFER_SECS;
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

  public get portionAmountOutStart(): BigNumber {
    return this.amountOutStart.mul(this.portionBips ?? 0).div(BPS);
  }

  public get portionAmountOutEnd(): BigNumber {
    return this.amountOutEnd.mul(this.portionBips ?? 0).div(BPS);
  }

  public get portionAmountInStart(): BigNumber {
    // we have to multiply first, and then divide
    // because BigNumber doesn't support decimals
    return this.portionAmountOutStart.mul(this.amountInStart).div(this.amountOutStart.add(this.portionAmountOutStart));
  }

  public get amountInGasAndPortionAdjusted(): BigNumber {
    return this.amountIn.add(this.portionAmountInStart);
  }

  public get amountOutGasAndPortionAdjusted(): BigNumber {
    return this.amountOut.sub(this.portionAmountOutStart);
  }

  validate(): boolean {
    if (this.amountOutStart.lt(this.amountOutEnd)) return false;
    if (this.amountInStart.gt(this.amountInEnd)) return false;
    return true;
  }

  // static helpers

  static applySlippage(amounts: Amounts, request: RelayRequest): Amounts {
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
      return { amountIn, amountOut: amountOut.mul(RelayQuote.amountOutImprovementExactIn).div(BPS) };
    } else {
      return { amountIn: amountIn.mul(RelayQuote.amountInImprovementExactOut).div(BPS), amountOut };
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
    const gasAdjustment = RelayQuote.getPreSwapGasAdjustment(classicQuote, options);
    if (gasAdjustment.eq(0)) return amounts;
    return RelayQuote.getGasAdjustedAmounts(amounts, gasAdjustment, classicQuote);
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
