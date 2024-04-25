import { DutchOrder, DutchOrderBuilder } from '@uniswap/uniswapx-sdk';
import { BigNumber, ethers } from 'ethers';

import { DutchQuote, DutchQuoteDataJSON, getPortionAdjustedOutputs, IQuote } from '.';
import { DutchV1Request } from '..';
import { ChainConfigManager } from '../../config/ChainConfigManager';
import {
  DEFAULT_AUCTION_PERIOD_SECS,
  DEFAULT_DEADLINE_BUFFER_SECS,
  DEFAULT_START_TIME_BUFFER_SECS,
  frontendAndUraEnablePortion,
  OPEN_QUOTE_START_TIME_BUFFER_SECS,
  RoutingType,
} from '../../constants';
import { generateRandomNonce } from '../../util/nonce';

export class DutchV1Quote extends DutchQuote<DutchV1Request> implements IQuote {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;
  public readonly defaultDeadlienBufferInSecs: number = DEFAULT_DEADLINE_BUFFER_SECS;

  public toJSON(): DutchQuoteDataJSON {
    return {
      orderInfo: this.toOrder().toJSON(),
      encodedOrder: this.toOrder().serialize(),
      quoteId: this.quoteId,
      requestId: this.requestId,
      orderHash: this.toOrder().hash(),
      startTimeBufferSecs: this.startTimeBufferSecs,
      auctionPeriodSecs: this.auctionPeriodSecs,
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

  public toOrder(): DutchOrder {
    const orderBuilder = new DutchOrderBuilder(this.chainId);
    const decayStartTime = Math.floor(Date.now() / 1000);
    const nonce = this.nonce ?? generateRandomNonce();

    const builder = orderBuilder
      .decayStartTime(decayStartTime)
      .decayEndTime(decayStartTime + this.auctionPeriodSecs)
      .deadline(decayStartTime + this.auctionPeriodSecs + this.deadlineBufferSecs)
      .swapper(ethers.utils.getAddress(this.request.config.swapper))
      .nonce(BigNumber.from(nonce))
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

    if (this.isExclusiveQuote() && this.filler) {
      builder.exclusiveFiller(this.filler, BigNumber.from(this.request.config.exclusivityOverrideBps));
    }

    return builder.build();
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

    const quoteConfig = ChainConfigManager.getQuoteConfig(this.chainId, this.request.routingType);
    if (
      quoteConfig.routingType == RoutingType.DUTCH_LIMIT &&
      quoteConfig.lrgAuctionPeriodSecs &&
      this.derived.largeTrade
    ) {
      return quoteConfig.lrgAuctionPeriodSecs;
    }
    return quoteConfig.stdAuctionPeriodSecs ?? DEFAULT_AUCTION_PERIOD_SECS;
  }
}
