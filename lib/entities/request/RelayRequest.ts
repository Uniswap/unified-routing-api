import { Protocol } from '@uniswap/router-sdk';
import { BigNumber } from 'ethers';

import { defaultRequestKey, parseProtocol, QuoteRequest, QuoteRequestInfo } from '.';
import { RoutingType } from '../../constants';
import { DutchRequest } from './DutchRequest';
import { ClassicConfig } from './ClassicRequest';

export interface RelayConfig extends ClassicConfig {
  gasToken?: string;
}

export interface RelayConfigJSON extends Omit<RelayConfig, 'protocols' | 'permitAmount'> {
  routingType: RoutingType.RELAY;
  protocols?: string[];
  permitAmount?: string;
}

export class RelayRequest implements QuoteRequest {
  public routingType: RoutingType.RELAY = RoutingType.RELAY;

  public static fromRequest(info: QuoteRequestInfo, config: RelayConfig): RelayRequest {
    return new RelayRequest(info, config);
  }

  public static fromRequestBody(info: QuoteRequestInfo, body: RelayConfigJSON): RelayRequest {
    return new RelayRequest(
      info,
      Object.assign({}, body, {
        protocols: body.protocols?.flatMap((p: string) => parseProtocol(p)),
        gasPriceWei: body.gasPriceWei,
        permitAmount: body.permitAmount ? BigNumber.from(body.permitAmount) : undefined,
      })
    );
  }

  public static fromDutchRequest(request: DutchRequest): RelayRequest {
    return new RelayRequest(request.info, {
      protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
    });
  }

  constructor(public readonly info: QuoteRequestInfo, public readonly config: RelayConfig) {}

  public toJSON(): RelayConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.RELAY as RoutingType.RELAY,
      protocols: this.config.protocols?.map((p: Protocol) => p.toString()),
      ...(this.config.permitAmount !== undefined && { permitAmount: this.config.permitAmount.toString() }),
      ...(this.info.source !== undefined && { source: this.info.source.toString() }),
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
