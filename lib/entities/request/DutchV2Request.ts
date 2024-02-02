import { ethers } from 'ethers';
import { defaultRequestKey, QuoteRequest, QuoteRequestInfo } from '.';
import {
  DEFAULT_SLIPPAGE_TOLERANCE,
  RoutingType,
} from '../../constants';
import { DutchQuoteRequestInfo } from './DutchRequest';

export * from './ClassicRequest';
export * from './DutchV2Request';

export interface DutchV2Config {
  swapper: string;
  deadlineBufferSecs?: number;
}

export interface DutchV2ConfigJSON extends DutchV2Config {
  routingType: RoutingType.DUTCH_V2;
}

export class DutchV2Request implements QuoteRequest {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;

  public static fromRequestBody(info: QuoteRequestInfo, body: DutchV2ConfigJSON): DutchV2Request {
    const convertedSlippage = info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    return new DutchV2Request(
      {
        ...info,
        slippageTolerance: convertedSlippage,
      },
      {
        swapper: body.swapper ?? ethers.constants.AddressZero,
        deadlineBufferSecs: body.deadlineBufferSecs,
      }
    );
  }

  constructor(public readonly info: DutchQuoteRequestInfo, public readonly config: DutchV2Config) {}

  public toJSON(): DutchV2ConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.DUTCH_V2 as RoutingType.DUTCH_V2,
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
