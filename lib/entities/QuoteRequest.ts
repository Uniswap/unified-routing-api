import { BigNumber } from 'ethers';

import { TradeType } from './quotes';
import {
  ClassicConfig,
  ClassicConfigJSON,
  DutchLimitConfig,
  DutchLimitConfigJSON,
  RoutingConfig,
  RoutingConfigJSON,
  RoutingType,
} from './routing';

export interface QuoteRequestData {
  tokenInChainId: number;
  tokenOutChainId: number;
  requestId: string;
  tokenIn: string;
  tokenOut: string;
  amount: BigNumber;
  tradeType: TradeType;
  routing: RoutingType[];
  configs: RoutingConfig[];
}

export interface QuoteRequestDataJSON extends Omit<QuoteRequestData, 'tradeType' | 'amount' | 'routing' | 'configs'> {
  tradeType: string;
  amount: string;
  routing: string[];
  configs: RoutingConfigJSON[];
}

export class QuoteRequest implements QuoteRequestData {
  public static fromRequestBody(body: QuoteRequestDataJSON): QuoteRequest {
    return new QuoteRequest({
      tokenInChainId: body.tokenInChainId,
      tokenOutChainId: body.tokenOutChainId,
      requestId: body.requestId,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: BigNumber.from(body.amount),
      tradeType: TradeType[body.tradeType as keyof typeof TradeType],
      routing: body.routing as RoutingType[],
      configs: this.parseConfig(body.configs),
    });
  }

  constructor(private data: QuoteRequestData) {}

  // ignores routing types that are not supported
  private static parseConfig(configs: RoutingConfigJSON[]): RoutingConfig[] {
    return configs.flatMap((config) => {
      if (config.routingType === RoutingType.CLASSIC) {
        return ClassicConfig.fromRequestBody(config as ClassicConfigJSON);
      } else if (config.routingType === RoutingType.DUTCH_LIMIT) {
        return DutchLimitConfig.fromRequestBody(config as DutchLimitConfigJSON);
      }
      return [];
    });
  }

  public toJSON(): QuoteRequestDataJSON {
    return {
      ...this.data,
      tradeType: TradeType[this.data.tradeType],
      amount: this.amount.toString(),
      configs: this.configs.map((config) => config.toJSON()),
    };
  }

  public get tokenInChainId(): number {
    return this.data.tokenInChainId;
  }

  public get tokenOutChainId(): number {
    return this.data.tokenOutChainId;
  }

  public get requestId(): string {
    return this.data.requestId;
  }

  public get tokenIn(): string {
    return this.data.tokenIn;
  }

  public get tokenOut(): string {
    return this.data.tokenOut;
  }

  public get amount(): BigNumber {
    return this.data.amount;
  }

  public get tradeType(): TradeType {
    return this.data.tradeType;
  }

  public get routing(): RoutingType[] {
    return this.data.routing;
  }

  public get configs(): RoutingConfig[] {
    return this.data.configs;
  }
}
