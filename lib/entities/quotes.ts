import { BigNumber } from 'ethers';

export { TradeType } from '@uniswap/sdk-core';

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

export type QuoteData = DutchLimitQuoteData;

export type QuoteJSON = DutchLimitQuoteJSON;

export class DutchLimitQuote implements DutchLimitQuoteData {
  public static fromResponseBody(body: DutchLimitQuoteJSON): DutchLimitQuote {
    return new DutchLimitQuote(
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
    public readonly chainId: number,
    public readonly requestId: string,
    public readonly tokenIn: string,
    public readonly amountIn: BigNumber,
    public readonly tokenOut: string,
    public readonly amountOut: BigNumber,
    public readonly offerer: string,
    public readonly filler?: string
  ) {}

  public toJSON(): DutchLimitQuoteJSON {
    return {
      chainId: this.chainId,
      requestId: this.requestId,
      tokenIn: this.tokenIn,
      amountIn: this.amountIn.toString(),
      tokenOut: this.tokenOut,
      amountOut: this.amountOut.toString(),
      offerer: this.offerer,
      filler: this.filler,
    };
  }
}

export type Quote = DutchLimitQuote;
