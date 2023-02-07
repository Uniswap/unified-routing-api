import { DutchLimitOrderBuilder, DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { BigNumber } from 'ethers';

import { DutchLimitConfig, RoutingType } from '..';
import { Quote, QuoteJSON } from '.';

export type DutchLimitQuoteData = {
  chainId: number;
  requestId: string;
  tokenIn: string;
  amountIn: BigNumber;
  tokenOut: string;
  amountOut: BigNumber;
  offerer: string;
  filler?: string;
};

export type DutchLimitQuoteJSON = Omit<DutchLimitQuoteData, 'amountIn' | 'amountOut'> & {
  amountIn: string;
  amountOut: string;
};

export class DutchLimitQuote implements Quote {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;

  public static fromResponseBodyAndConfig(config: DutchLimitConfig, body: DutchLimitQuoteJSON): DutchLimitQuote {
    return new DutchLimitQuote(
      config,
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
    public readonly config: DutchLimitConfig,
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
      .startTime(startTime + this.config.exclusivePeriodSecs)
      .endTime(startTime + this.config.exclusivePeriodSecs + this.config.auctionPeriodSecs)
      .deadline(startTime + this.config.exclusivePeriodSecs + this.config.auctionPeriodSecs)
      .offerer(this.config.offerer)
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
        recipient: this.config.offerer,
        isFeeOutput: false,
      })
      .build();

    return order.toJSON();
  }
}
