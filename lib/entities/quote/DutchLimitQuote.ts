import { DutchLimitOrderBuilder, DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { Quote, QuoteJSON } from '.';
import { DutchLimitRequest, RoutingType } from '..';
import { THOUSAND_FIXED_POINT } from '../../constants';
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
  public static improvementExactIn = BigNumber.from(1010);
  public static improvementExactOut = BigNumber.from(990);

  public static fromResponseBody(request: DutchLimitRequest, body: DutchLimitQuoteJSON): DutchLimitQuote {
    return new DutchLimitQuote(
      request,
      body.chainId,
      body.requestId,
      body.tokenIn,
      BigNumber.from(body.amountIn),
      body.tokenOut,
      BigNumber.from(body.amountOut),
      body.offerer,
      body.filler
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
    public readonly filler?: string
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
        quote.amountOut.mul(DutchLimitQuote.improvementExactIn).div(THOUSAND_FIXED_POINT),
        request.config.offerer,
        ''
      );
    } else {
      return new DutchLimitQuote(
        request,
        request.info.tokenInChainId,
        request.info.requestId,
        request.info.tokenIn,
        quote.amountIn.mul(DutchLimitQuote.improvementExactOut).div(THOUSAND_FIXED_POINT),
        quote.request.info.tokenOut,
        request.info.amount, // fixed amountOut
        request.config.offerer,
        ''
      );
    }
  }

  public transformWithClassicQuote(quote: ClassicQuote): DutchLimitQuote {
    if (this.request.info.type === TradeType.EXACT_INPUT) {
      return new DutchLimitQuote(
        this.request,
        this.chainId,
        this.requestId,
        this.tokenIn,
        this.amountIn,
        quote.request.info.tokenOut,
        quote.amountOut.mul(DutchLimitQuote.improvementExactIn).div(THOUSAND_FIXED_POINT),
        this.offerer,
        ''
      );
    } else {
      return new DutchLimitQuote(
        this.request,
        this.chainId,
        this.requestId,
        this.tokenIn,
        quote.amountIn.mul(DutchLimitQuote.improvementExactOut).div(THOUSAND_FIXED_POINT),
        quote.request.info.tokenOut,
        this.amountOut,
        this.offerer,
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
    // TODO: get nonce from gouda-service to get gas benefit of same-word nonces
    const nonce = BigNumber.from(Math.floor(Math.random() * 100000000000000));

    const order = orderBuilder
      .startTime(startTime + this.request.config.exclusivePeriodSecs)
      .endTime(startTime + this.request.config.exclusivePeriodSecs + this.request.config.auctionPeriodSecs)
      .deadline(startTime + this.request.config.exclusivePeriodSecs + this.request.config.auctionPeriodSecs)
      .offerer(this.request.config.offerer)
      .nonce(nonce)
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
        .mul(THOUSAND_FIXED_POINT.sub(BigNumber.from(this.request.info.slippageTolerance)))
        .div(THOUSAND_FIXED_POINT);
    } else {
      return this.amountIn
        .mul(THOUSAND_FIXED_POINT.add(BigNumber.from(this.request.info.slippageTolerance)))
        .div(THOUSAND_FIXED_POINT);
    }
  }
}
