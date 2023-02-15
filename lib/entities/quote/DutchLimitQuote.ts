import { DutchLimitOrderBuilder, DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { BigNumber, ethers } from 'ethers';

import { Quote, QuoteJSON } from '.';
import { DutchLimitRequest, RoutingType } from '..';
import { HUNDRED_PERCENT } from '../../constants';
import { ClassicQuote } from './ClassicQuote';

export type DutchLimitQuoteJSON = {
  chainId: number;
  requestId: string;
  tokenIn: string;
  amountIn: string;
  tokenOut: string;
  amountOut: string;
  offerer: string;
  filler?: string;
};

export class DutchLimitQuote implements Quote {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;
  public static improvementExactIn = BigNumber.from(10100);
  public static improvementExactOut = BigNumber.from(9900);

  public static fromResponseBody(
    request: DutchLimitRequest,
    body: DutchLimitQuoteJSON,
    nonce?: string
  ): DutchLimitQuote {
    return new DutchLimitQuote(
      request,
      body.chainId,
      body.requestId,
      body.tokenIn,
      BigNumber.from(body.amountIn),
      body.tokenOut,
      BigNumber.from(body.amountOut),
      body.offerer,
      body.filler,
      nonce
    );
  }

  constructor(
    public readonly request: DutchLimitRequest,
    public readonly chainId: number,
    public readonly requestId: string,
    public readonly tokenIn: string,
    public readonly amountIn: BigNumber,
    public readonly tokenOut: string,
    public readonly amountOut: BigNumber,
    public readonly offerer: string,
    public readonly filler?: string,
    public readonly nonce?: string
  ) {}

  public static fromClassicQuote(request: DutchLimitRequest, quote: ClassicQuote): DutchLimitQuote {
    if (request.info.type === TradeType.EXACT_INPUT) {
      return new DutchLimitQuote(
        request,
        request.info.tokenInChainId,
        request.info.requestId,
        request.info.tokenIn,
        request.info.amount, // fixed amountIn
        quote.request.info.tokenOut,
        quote.amountOutGasAdjusted.mul(DutchLimitQuote.improvementExactIn).div(HUNDRED_PERCENT),
        request.config.offerer,
        ''
      );
    } else {
      return new DutchLimitQuote(
        request,
        request.info.tokenInChainId,
        request.info.requestId,
        request.info.tokenIn,
        quote.amountInGasAdjusted.mul(DutchLimitQuote.improvementExactOut).div(HUNDRED_PERCENT),
        quote.request.info.tokenOut,
        request.info.amount, // fixed amountOut
        request.config.offerer,
        ''
      );
    }
  }

  public toJSON(): QuoteJSON {
    return this.toOrder();
  }

  public toOrder(): DutchLimitOrderInfoJSON {
    const orderBuilder = new DutchLimitOrderBuilder(this.chainId);
    const startTime = Math.floor(Date.now() / 1000);
    const nonce = this.nonce ?? this.generateRandomNonce();

    const order = orderBuilder
      .startTime(startTime + this.request.config.exclusivePeriodSecs)
      .endTime(startTime + this.request.config.exclusivePeriodSecs + this.request.config.auctionPeriodSecs)
      .deadline(startTime + this.request.config.exclusivePeriodSecs + this.request.config.auctionPeriodSecs)
      .offerer(this.request.config.offerer)
      .nonce(BigNumber.from(nonce))
      .input({
        token: this.tokenIn,
        startAmount: this.amountIn,
        endAmount:
          this.request.info.type === TradeType.EXACT_INPUT ? this.amountIn : this.calculateEndAmountFromSlippage(),
      })
      .output({
        token: this.tokenOut,
        startAmount: this.amountOut,
        endAmount:
          this.request.info.type === TradeType.EXACT_INPUT ? this.calculateEndAmountFromSlippage() : this.amountOut,
        recipient: this.request.config.offerer,
        isFeeOutput: false,
      })
      .build();

    return order.toJSON();
  }

  private calculateEndAmountFromSlippage(): BigNumber {
    if (this.request.info.type === TradeType.EXACT_INPUT) {
      return this.amountOut
        .mul(HUNDRED_PERCENT.sub(BigNumber.from(this.request.info.slippageTolerance)))
        .div(HUNDRED_PERCENT);
    } else {
      return this.amountIn
        .mul(HUNDRED_PERCENT.add(BigNumber.from(this.request.info.slippageTolerance)))
        .div(HUNDRED_PERCENT);
    }
  }

  private generateRandomNonce(): string {
    return ethers.BigNumber.from(ethers.utils.randomBytes(31)).shl(8).toString();
  }
}
