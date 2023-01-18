import { BigNumber } from 'ethers';

import { QuoteType } from './quotes';
import {
  ClassicConfig,
  ClassicConfigJSON,
  DutchLimitConfig,
  RoutingConfig,
  RoutingConfigJSON,
  RoutingType,
} from './routing';

export interface QuoteRequestData {
  chainInId: number;
  chainOutId: number;
  requestId: string;
  tokenIn: string;
  tokenOut: string;
  amount: BigNumber;
  quoteType: QuoteType;
  routing: RoutingType[];
  configs: RoutingConfig[];
}

export interface QuoteRequestDataJSON extends Omit<QuoteRequestData, 'quoteType' | 'amount' | 'routing' | 'configs'> {
  quoteType: string;
  amount: string;
  routing: string[];
  configs: RoutingConfigJSON[];
}

export class QuoteRequest implements QuoteRequestData {
  public static fromRequestBody(body: QuoteRequestDataJSON): QuoteRequest {
    return new QuoteRequest({
      chainInId: body.chainInId,
      chainOutId: body.chainOutId,
      requestId: body.requestId,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: BigNumber.from(body.amount),
      quoteType: QuoteType[body.quoteType as keyof typeof QuoteType],
      routing: body.routing as RoutingType[],
      configs: this.parseConfig(body.configs),
    });
  }

  constructor(private data: QuoteRequestData) {}

  // ignores routing types that are not supported
  private static parseConfig(configs: RoutingConfigJSON[]): RoutingConfig[] {
    return configs.reduce((acc, config) => {
      if (config.routingType === RoutingType.CLASSIC) {
        acc.push(ClassicConfig.fromRequestBody(config as ClassicConfigJSON));
      } else if (config.routingType === RoutingType.DUTCH_LIMIT) {
        acc.push(DutchLimitConfig.fromRequestBody(config as DutchLimitConfig));
      }
      return acc;
    }, [] as RoutingConfig[]);
  }

  public toJSON(): QuoteRequestDataJSON {
    return {
      ...this.data,
      amount: this.amount.toString(),
      configs: this.configs.map((config) => config.toJSON()),
    };
  }

  public get chainInId(): number {
    return this.data.chainInId;
  }

  public get chainOutId(): number {
    return this.data.chainOutId;
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

  public get quoteType(): QuoteType {
    return this.data.quoteType;
  }

  public get routing(): RoutingType[] {
    return this.data.routing;
  }

  public get configs(): RoutingConfig[] {
    return this.data.configs;
  }
}
