import { TradeType } from '@uniswap/sdk-core';
import { V2DutchOrder, V2DutchOrderBuilder, V2DutchOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';
import { PermitTransferFromData } from '@uniswap/permit2-sdk';

import { IQuote, LogJSON } from '.';
import { DutchV2Request } from '..';
import {
  BPS,
  frontendAndUraEnablePortion,
  NATIVE_ADDRESS,
  RoutingType,
  UNISWAPX_BASE_GAS,
  WETH_UNWRAP_GAS,
  WETH_WRAP_GAS,
  WETH_WRAP_GAS_ALREADY_APPROVED,
} from '../../constants';
import { Portion } from '../../fetchers/PortionFetcher';
import { log } from '../../util/log';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { ClassicQuote } from './ClassicQuote';
import { Amounts, DutchQuote, DutchRFQQuoteResponseJSON, getPortionAdjustedOutputs, ParameterizationOptions, parseSlippageToleranceBps } from './DutchQuote';

// TODO: replace with real cosigner when deployed
const LABS_COSIGNER = '0x0000000000000000000000000000000000000000';

// JSON format of a DutchQuote, to be returned by the API
export type DutchV2QuoteDataJSON = {
  orderInfo: V2DutchOrderInfoJSON;
  quoteId: string;
  requestId: string;
  encodedOrder: string;
  orderHash: string;
  deadlineBufferSecs: number;
  slippageTolerance: string;
  permitData: PermitTransferFromData;
  portionBips?: number;
  portionAmount?: string;
  portionRecipient?: string;
};

type DutchV2QuoteConstructorArgs = {
  createdAtMs?: string;
  request: DutchV2Request;
  chainId: number;
  requestId: string;
  quoteId: string;
  tokenIn: string;
  tokenOut: string;
  amountInStart: BigNumber;
  amountInEnd: BigNumber;
  amountOutStart: BigNumber;
  amountOutEnd: BigNumber;
  swapper: string;
  nonce?: string;
  portion?: Portion;
};

export class DutchV2Quote implements IQuote {
  public readonly routingType: RoutingType.DUTCH_V2 = RoutingType.DUTCH_V2;

  public readonly request: DutchV2Request;
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
  public readonly nonce?: string;
  public readonly portion?: Portion;

  // build a dutch v2 quote from an RFQ response
  public static fromResponseBody(
    request: DutchV2Request,
    body: DutchRFQQuoteResponseJSON,
    nonce?: string,
    portion?: Portion
  ): DutchV2Quote {
    // if it's exact out, we will explicitly define the amount out start to be the swapper's requested amount
    const amountOutStart =
      request.info.type === TradeType.EXACT_OUTPUT ? request.info.amount : BigNumber.from(body.amountOut);
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchV2Quote.applySlippage(
      { amountIn: BigNumber.from(body.amountIn), amountOut: amountOutStart },
      request
    );
    return new DutchV2Quote({
      ...body,
      createdAtMs: currentTimestampInMs(),
      request,
      amountInStart: BigNumber.from(body.amountIn),
      amountInEnd,
      amountOutStart,
      amountOutEnd,
      nonce,
      portion,
    });
  }

  // reparameterize an RFQ quote with awareness of classic
  // sets the ending prices of the dutch auction to be a reasonable fillable price for classic
  public static fromRFQAndClassic(
    quote: DutchV2Quote,
    classic?: ClassicQuote,
    options?: ParameterizationOptions
  ): DutchV2Quote {
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

    return new DutchV2Quote({
      ...quote,
      amountInStart,
      amountInEnd,
      amountOutStart,
      amountOutEnd,
    });
  }

  private constructor(args: DutchV2QuoteConstructorArgs) {
    Object.assign(this, args, {
      createdAtMs: args.createdAtMs || currentTimestampInMs(),
    });
  }

  public toJSON(): DutchV2QuoteDataJSON {
    return {
      orderInfo: this.toOrder().toJSON(),
      encodedOrder: this.toOrder().serialize(),
      quoteId: this.quoteId,
      requestId: this.requestId,
      orderHash: this.toOrder().hash(),
      deadlineBufferSecs: this.deadlineBufferSecs,
      slippageTolerance: this.request.info.slippageTolerance,
      permitData: this.getPermitData(),
      // NOTE: important for URA to return 0 bps and amount, in case of no portion.
      // this is FE requirement
      portionBips: frontendAndUraEnablePortion(this.request.info.sendPortionEnabled)
        ? this.portion?.bips ?? 0
        : undefined,
      portionAmount: frontendAndUraEnablePortion(this.request.info.sendPortionEnabled)
        ? this.portionAmountOutStart.toString() ?? '0'
        : undefined,
      portionRecipient: this.portion?.recipient,
    };
  }

  public toOrder(): V2DutchOrder {
    const orderBuilder = new V2DutchOrderBuilder(this.chainId);
    const deadline = Math.floor(Date.now() / 1000 + this.deadlineBufferSecs);
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .deadline(deadline)
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
      .nonce(BigNumber.from(nonce))
      .cosigner(LABS_COSIGNER)
      .input({
        token: this.tokenIn,
        startAmount: this.amountInStart,
        endAmount: this.amountInEnd,
      });

    const outputs = getPortionAdjustedOutputs(
      {
        token: this.tokenOut,
        startAmount: this.amountOutStart,
        endAmount: this.amountOutEnd,
        recipient: this.request.config.swapper,
      },
      this.request.info.type,
      this.request.info.sendPortionEnabled,
      this.portion
    );
    outputs.forEach((output) => builder.output(output));

    return builder.buildPartial();
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
      amountInGasAndPortionAdjusted:
        this.request.info.type === TradeType.EXACT_OUTPUT ? this.amountInGasAndPortionAdjusted.toString() : undefined,
      amountOutGasAdjusted: this.amountOutStart.toString(),
      amountOutGasAndPortionAdjusted:
        this.request.info.type === TradeType.EXACT_INPUT ? this.amountOutGasAndPortionAdjusted.toString() : undefined,
      swapper: this.swapper,
      routing: RoutingType[this.routingType],
      slippage: parseFloat(this.request.info.slippageTolerance),
      createdAt: timestampInMstoSeconds(parseInt(this.createdAtMs)),
      createdAtMs: this.createdAtMs,
      portionBips: this.portion?.bips,
      portionRecipient: this.portion?.recipient,
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

  // The number of seconds from endTime that the order should expire
  public get deadlineBufferSecs(): number {
    if (this.request.config.deadlineBufferSecs !== undefined) {
      return this.request.config.deadlineBufferSecs;
    }

    switch (this.chainId) {
      case 1:
        // 10 blocks from now
        // to cover time to sign, run secondary auction, and some blocks for decay
        return 120;
      default:
        return 30;
    }
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

  static applySlippage(amounts: Amounts, request: DutchV2Request): Amounts {
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

  // Calculates the pre-swap gas adjustment for the given quote if processed through UniswapX
  // pre-swap gas adjustments are paid directly by the user pre-swap
  // and should be applied to startAmounts
  // e.g. ETH wraps
  static applyPreSwapGasAdjustment(
    amounts: Amounts,
    classicQuote: ClassicQuote,
    options?: ParameterizationOptions
  ): Amounts {
    const gasAdjustment = DutchV2Quote.getPreSwapGasAdjustment(classicQuote, options);
    if (gasAdjustment.eq(0)) return amounts;
    return DutchV2Quote.getGasAdjustedAmounts(amounts, gasAdjustment, classicQuote);
  }

  // Calculates the gas adjustment for the given quote if processed through UniswapX
  // Swap gas adjustments are paid by the filler in the process of filling a trade
  // and should be applied to endAmounts
  static applyGasAdjustment(amounts: Amounts, classicQuote: ClassicQuote): Amounts {
    const gasAdjustment = DutchV2Quote.getGasAdjustment(classicQuote);
    if (gasAdjustment.eq(0)) return amounts;
    return DutchV2Quote.getGasAdjustedAmounts(
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
