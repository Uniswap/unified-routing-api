import { PermitTransferFromData } from '@uniswap/permit2-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { UnsignedV2DutchOrder, UnsignedV2DutchOrderInfoJSON, V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';

import { IQuote, LogJSON, SharedOrderQuoteDataJSON } from '.';
import { DutchV2Request } from '..';
import { DEFAULT_V2_DEADLINE_BUFFER_SECS, frontendAndUraEnablePortion, RoutingType } from '../../constants';
import { generateRandomNonce } from '../../util/nonce';
import { timestampInMstoSeconds } from '../../util/time';
import { DutchQuote, getPortionAdjustedOutputs } from './DutchQuote';

export const DEFAULT_LABS_COSIGNER = ethers.constants.AddressZero;

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
  public readonly defaultDeadlienBufferInSecs: number = DEFAULT_V2_DEADLINE_BUFFER_SECS;

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

  static getLabsCosigner(): string {
    return process.env.RFQ_LABS_COSIGNER_ADDRESS || DEFAULT_LABS_COSIGNER;
  }
}
