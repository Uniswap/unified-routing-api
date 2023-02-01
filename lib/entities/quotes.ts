import { TradeType } from '@uniswap/sdk-core';
import { MethodParameters } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';

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

export type V2ReserveJSON = {
  token: TokenInRouteJSON;
  quotient: string;
};

export type V2PoolInRouteJSON = {
  type: 'v2-pool';
  address: string;
  tokenIn: TokenInRouteJSON;
  tokenOut: TokenInRouteJSON;
  reserve0: V2ReserveJSON;
  reserve1: V2ReserveJSON;
  amountIn?: string;
  amountOut?: string;
};

export type TokenInRouteJSON = {
  address: string;
  chainId: number;
  symbol: string;
  decimals: string;
};

export type V3PoolInRouteJSON = {
  type: 'v3-pool';
  address: string;
  tokenIn: TokenInRouteJSON;
  tokenOut: TokenInRouteJSON;
  sqrtRatioX96: string;
  liquidity: string;
  tickCurrent: string;
  fee: string;
  amountIn?: string;
  amountOut?: string;
};

export type ClassicQuoteDataJSON = {
  quoteId: string;
  amount: string;
  amountDecimals: string;
  quote: string;
  quoteDecimals: string;
  quoteGasAdjusted: string;
  quoteGasAdjustedDecimals: string;
  gasUseEstimate: string;
  gasUseEstimateQuote: string;
  gasUseEstimateQuoteDecimals: string;
  gasUseEstimateUSD: string;
  simulationError?: boolean;
  simulationStatus: string;
  gasPriceWei: string;
  blockNumber: string;
  route: Array<(V3PoolInRouteJSON | V2PoolInRouteJSON)[]>;
  routeString: string;
  methodParameters?: MethodParameters;
};

export type QuoteData = DutchLimitQuoteData;
export type QuoteJSON = DutchLimitQuoteJSON | ClassicQuoteDataJSON;

export interface Quote {
  toJSON(): QuoteJSON;
  amountOut: BigNumber;
  amountIn: BigNumber;
}

export class DutchLimitQuote implements DutchLimitQuoteData, Quote {
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

export class ClassicQuote implements Quote {
  public static fromResponseBody(body: ClassicQuoteDataJSON, tradeType: TradeType): ClassicQuote {
    return new ClassicQuote(body, tradeType);
  }

  constructor(private quoteData: ClassicQuoteDataJSON, private tradeType: TradeType) {}

  public toJSON(): ClassicQuoteDataJSON {
    return this.quoteData;
  }

  public get amountOut(): BigNumber {
    return this.tradeType === TradeType.EXACT_INPUT
      ? BigNumber.from(this.quoteData.quote)
      : BigNumber.from(this.quoteData.amount);
  }

  public get amountIn(): BigNumber {
    return this.tradeType === TradeType.EXACT_OUTPUT
      ? BigNumber.from(this.quoteData.quote)
      : BigNumber.from(this.quoteData.amount);
  }
}
