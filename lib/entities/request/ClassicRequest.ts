import { Protocol } from '@uniswap/router-sdk';
import { BigNumber } from 'ethers';

import { defaultRequestKey, QuoteRequest, QuoteRequestInfo } from '.';
import { RoutingType } from '../../constants';
import { DutchRequest } from './DutchRequest';

export interface ClassicConfig {
  protocols?: Protocol[];
  gasPriceWei?: string;
  simulateFromAddress?: string;
  permitSignature?: string;
  permitNonce?: string;
  permitExpiration?: string;
  permitAmount?: BigNumber;
  permitSigDeadline?: string;
  enableUniversalRouter?: boolean;
  recipient?: string;
  algorithm?: string;
  deadline?: number;
  minSplits?: number;
  forceCrossProtocol?: boolean;
  forceMixedRoutes?: boolean;
  debugRoutingConfig?: string;
  unicornSecret?: string;
}

export interface ClassicConfigJSON extends Omit<ClassicConfig, 'protocols' | 'permitAmount'> {
  routingType: RoutingType.CLASSIC;
  protocols?: string[];
  permitAmount?: string;
}

export class ClassicRequest implements QuoteRequest {
  public routingType: RoutingType.CLASSIC = RoutingType.CLASSIC;

  public static fromRequestBody(info: QuoteRequestInfo, body: ClassicConfigJSON): ClassicRequest {
    return new ClassicRequest(
      info,
      Object.assign({}, body, {
        protocols: body.protocols?.flatMap((p: string) => parseProtocol(p)),
        gasPriceWei: body.gasPriceWei,
        permitAmount: body.permitAmount ? BigNumber.from(body.permitAmount) : undefined,
      })
    );
  }

  public static fromDutchRequest(request: DutchRequest): ClassicRequest {
    return new ClassicRequest(request.info, {
      protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
    });
  }

  constructor(public readonly info: QuoteRequestInfo, public readonly config: ClassicConfig) {}

  public toJSON(): ClassicConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.CLASSIC as RoutingType.CLASSIC,
      protocols: this.config.protocols?.map((p: Protocol) => p.toString()),
      ...(this.config.permitAmount !== undefined && { permitAmount: this.config.permitAmount.toString() }),
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}

function parseProtocol(protocol: string): Protocol {
  switch (protocol.toLowerCase()) {
    case 'v2':
      return Protocol.V2;
    case 'v3':
      return Protocol.V3;
    case 'mixed':
      return Protocol.MIXED;
    default:
      throw new Error(`Invalid protocol: ${protocol}`);
  }
}
