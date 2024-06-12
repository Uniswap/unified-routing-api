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
import { ChainConfigManager } from '../../config/ChainConfigManager';
import { BPS, DEFAULT_V2_DEADLINE_BUFFER_SECS, frontendAndUraEnablePortion, RoutingType } from '../../constants';
import { generateRandomNonce } from '../../util/nonce';
import { timestampInMstoSeconds } from '../../util/time';
import { DutchQuote, getPortionAdjustedOutputs } from './DutchQuote';

export const DEFAULT_LABS_COSIGNER = ethers.constants.AddressZero;
export const DEFAULT_V2_OUTPUT_AMOUNT_BUFFER_BPS = 10;

// JSON format of a DutchV2Quote, to be returned by the API
export type DutchV2QuoteDataJSON = SharedOrderQuoteDataJSON & {
  orderInfo: UnsignedV2DutchOrderInfoJSON;
  deadlineBufferSecs: number;
  permitData: PermitTransferFromData;
  portionBips?: number;
  portionAmount?: string;
  portionRecipient?: string;
};

export class DutchV2Quote extends DutchQuote<DutchV2Request> implements IQuote {
  public readonly routingType: RoutingType.DUTCH_V2 = RoutingType.DUTCH_V2;
  public readonly defaultDeadlineBufferInSecs: number = DEFAULT_V2_DEADLINE_BUFFER_SECS;

  public toJSON(): DutchV2QuoteDataJSON {
    const quoteConfig = ChainConfigManager.getQuoteConfig(this.chainId, this.request.routingType);
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
        portionAmount:
          applyBufferToPortion(
            this.portionAmountOutStart,
            this.request.info.type,
            quoteConfig.priceBufferBps ?? DEFAULT_V2_OUTPUT_AMOUNT_BUFFER_BPS
          ).toString() ?? '0',
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
    const quoteConfig = ChainConfigManager.getQuoteConfig(this.chainId, this.request.routingType);
    const { input: bufferedInput, output: bufferedOutput } = DutchV2Quote.applyBufferToInputOutput(
      input,
      output,
      this.request.info.type,
      quoteConfig.priceBufferBps
    );
    builder.input(bufferedInput);

    const outputs = getPortionAdjustedOutputs(
      bufferedOutput,
      this.request.info.type,
      this.request.info.sendPortionEnabled,
      this.portion
    );
    outputs.forEach((output) => builder.output(output));

    return builder.buildPartial();
  }

  public toLog(): LogJSON {
    const quoteConfig = ChainConfigManager.getQuoteConfig(this.chainId, this.request.routingType);
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
      portionAmountOutStart: applyBufferToPortion(
        this.portionAmountOutStart,
        this.request.info.type,
        quoteConfig.priceBufferBps ?? DEFAULT_V2_OUTPUT_AMOUNT_BUFFER_BPS
      ).toString(),
      portionAmountOutEnd: applyBufferToPortion(
        this.portionAmountOutEnd,
        this.request.info.type,
        quoteConfig.priceBufferBps ?? DEFAULT_V2_OUTPUT_AMOUNT_BUFFER_BPS
      ).toString(),
    };
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

/*
 * if exact_input, apply buffer to both user and portion outputs
 *  if exact_output, do nothing since the buffer is applied to user input
 */
export function applyBufferToPortion(portionAmount: BigNumber, type: TradeType, bps: number): BigNumber {
  if (type === TradeType.EXACT_INPUT) {
    return portionAmount.mul(BPS - bps).div(BPS);
  } else {
    return portionAmount;
  }
}
