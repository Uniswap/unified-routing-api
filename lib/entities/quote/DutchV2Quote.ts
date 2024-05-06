import { PermitTransferFromData } from '@uniswap/permit2-sdk';
import { TradeType } from '@uniswap/sdk-core';
import {
  DutchInput,
  DutchOutput,
  UnsignedV2DutchOrder,
  UnsignedV2DutchOrderInfoJSON,
  V2DutchOrderBuilder,
} from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';

import { IQuote, LogJSON, SharedOrderQuoteDataJSON } from '.';
import { DutchV2Request } from '..';
import { BPS, frontendAndUraEnablePortion, RoutingType } from '../../constants';
import { Portion } from '../../fetchers/PortionFetcher';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs, timestampInMstoSeconds } from '../../util/time';
import { DutchQuote as DutchV1Quote, getPortionAdjustedOutputs } from './DutchQuote';

export const DEFAULT_LABS_COSIGNER = ethers.constants.AddressZero;
export const V2_OUTPUT_AMOUNT_BUFFER_BPS = 10;

// JSON format of a DutchV2Quote, to be returned by the API
export type DutchV2QuoteDataJSON = SharedOrderQuoteDataJSON & {
  orderInfo: UnsignedV2DutchOrderInfoJSON;
  deadlineBufferSecs: number;
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
  filler?: string;
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
  public readonly filler?: string;
  public readonly nonce?: string;
  public readonly portion?: Portion;

  // build a v2 quote from a v1 quote
  public static fromV1Quote(request: DutchV2Request, quote: DutchV1Quote): DutchV2Quote {
    return new DutchV2Quote({
      ...quote,
      request,
    });
  }

  private constructor(args: DutchV2QuoteConstructorArgs) {
    Object.assign(this, args, {
      createdAtMs: args.createdAtMs || currentTimestampInMs(),
    });
    this.routingType = RoutingType.DUTCH_V2;
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
      ...(frontendAndUraEnablePortion(this.request.info.sendPortionEnabled) && {
        portionBips: this.portion?.bips ?? 0,
        portionAmount: this.portionAmountOutStart.toString() ?? '0',
        portionRecipient: this.portion?.recipient,
      }),
    };
  }

  public toOrder(): UnsignedV2DutchOrder {
    const orderBuilder = new V2DutchOrderBuilder(this.chainId);
    const deadline = Math.floor(Date.now() / 1000 + this.deadlineBufferSecs);
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .deadline(deadline)
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
      .nonce(BigNumber.from(nonce))
      .cosigner(DutchV2Quote.getLabsCosigner())
      // empty cosignature so we can serialize the order
      .cosignature(ethers.constants.HashZero)
      .input({
        token: this.tokenIn,
        startAmount: this.amountInStart,
        endAmount: this.amountInEnd,
      });

    const input = {
      token: this.tokenIn,
      startAmount: this.amountInStart,
      endAmount: this.amountInEnd,
      recipient: this.request.config.swapper,
    };

    const output = {
      token: this.tokenOut,
      startAmount: this.amountOutStart,
      endAmount: this.amountOutEnd,
      recipient: this.request.config.swapper,
    };

    // Apply negative buffer to allow for improvement during hard quote process
    // - the buffer is applied to the output for EXACT_INPUT and to the input for EXACT_OUTPUT
    // - any portion is taken out of the the transformed output
    const { input: V2Input, output: V2Output } = addBufferToV2InputOutput(
      input,
      output,
      this.request.info.type,
      V2_OUTPUT_AMOUNT_BUFFER_BPS
    );
    builder.input(V2Input);

    const outputs = getPortionAdjustedOutputs(
      V2Output,
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
      filler: this.filler,
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
        // 25 blocks from now
        // to cover time to sign, run secondary auction, and some blocks for decay
        return 300;
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

  static getLabsCosigner(): string {
    return process.env.RFQ_LABS_COSIGNER_ADDRESS || DEFAULT_LABS_COSIGNER;
  }
}

export function addBufferToV2InputOutput(
  input: DutchInput,
  output: DutchOutput,
  type: TradeType,
  bps: number
): {
  input: DutchInput;
  output: DutchOutput;
} {
  if (type === TradeType.EXACT_INPUT) {
    return {
      input,
      output: {
        ...output,
        // subtract buffer from output
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
