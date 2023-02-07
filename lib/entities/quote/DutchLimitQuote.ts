import { DutchLimitOrderBuilder, DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import { DutchLimitRequest, RoutingType } from '..';
import { Quote, QuoteJSON } from '.';

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

  public toJSON(): QuoteJSON {
    return this.toOrder();
  }

  public toOrder(): DutchLimitOrderInfoJSON {
    const orderBuilder = new DutchLimitOrderBuilder(this.chainId);
    const startTime = Math.floor(Date.now() / 1000);

    // TODO: properly handle timestamp related fields
    const order = orderBuilder
      .startTime(startTime + this.request.config.exclusivePeriodSecs)
      .endTime(startTime + this.request.config.exclusivePeriodSecs + this.request.config.auctionPeriodSecs)
      .deadline(startTime + this.request.config.exclusivePeriodSecs + this.request.config.auctionPeriodSecs)
      .offerer(this.request.config.offerer)
      .nonce(BigNumber.from(100)) // TODO: get nonce from gouda-service
      .input({
        token: this.tokenIn,
        startAmount: this.amountIn,
        endAmount: this.amountIn,
      })
      .output({
        token: this.tokenOut,
        startAmount: this.amountOut,
        endAmount: this.amountOut, // TODO: integrate slippageTolerance and do dutch decay
        recipient: this.request.config.offerer,
        isFeeOutput: false,
      })
      .build();

    return order.toJSON();
  }
}
