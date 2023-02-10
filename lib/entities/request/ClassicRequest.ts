import { Protocol } from '@uniswap/router-sdk';
import { BigNumber } from 'ethers';

import { QuoteRequest, QuoteRequestInfo, RoutingType } from '.';
import { DUMMY_GAS_WEI } from '../../constants';
import { DutchLimitRequest } from './DutchLimitRequest';

export interface ClassicConfig {
  protocols: Protocol[];
  gasPriceWei?: string;
  simulateFromAddress?: string;
  permitSignature?: string;
  permitNonce?: string;
  permitExpiration?: string;
  permitAmount?: BigNumber;
  permitSigDeadline?: number;
  enableUniversalRouter?: boolean;
  slippageTolerance?: number;
  deadline?: number;
  minSplits?: number;
  forceCrossProtocol?: boolean;
  forceMixedRoutes?: boolean;
}

export interface ClassicConfigJSON extends Omit<ClassicConfig, 'protocols' | 'permitAmount'> {
  routingType: RoutingType;
  protocols: string[];
  permitAmount?: string;
}

export class ClassicRequest implements QuoteRequest {
  public routingType: RoutingType.CLASSIC = RoutingType.CLASSIC;

  public static fromRequestBody(info: QuoteRequestInfo, body: ClassicConfigJSON): ClassicRequest {
    return new ClassicRequest(
      info,
      Object.assign({}, body, {
        protocols: body.protocols.flatMap((p: string) => {
          if (p in Protocol) {
            return Protocol[p as keyof typeof Protocol];
          } else {
            return [];
          }
        }),
        slippageTolerance: body.slippageTolerance,
        gasPriceWei: body.gasPriceWei ?? DUMMY_GAS_WEI,
        permitAmount: body.permitAmount ? BigNumber.from(body.permitAmount) : undefined,
      })
    );
  }

  public static fromDutchLimitRequest(request: DutchLimitRequest): ClassicRequest {
    return new ClassicRequest(request.info, {
      protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
    });
  }

  constructor(public readonly info: QuoteRequestInfo, public readonly config: ClassicConfig) {}

  public toJSON(): ClassicConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.CLASSIC,
      protocols: this.config.protocols.map((p: Protocol) => p.toString()),
      permitAmount: this.config.permitAmount?.toString(),
    });
  }
}
