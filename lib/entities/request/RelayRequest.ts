import { defaultRequestKey, QuoteRequest, QuoteRequestInfo } from '.';
import {
  DEFAULT_SLIPPAGE_TOLERANCE,
  NATIVE_ADDRESS,
  RoutingType,
} from '../../constants';

export * from './ClassicRequest';
export * from './RelayRequest';

export interface RelayConfig {
  swapper: string;
  gasToken: string;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  // Passed in by cients
  amountInGasTokenStartOverride?: string;
}

export interface RelayQuoteRequestInfo extends QuoteRequestInfo {
  slippageTolerance: string;
}

export interface RelayConfigJSON {
  routingType: RoutingType.RELAY;
  gasToken: string;
  swapper?: string;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  amountInGasTokenStartOverride? : string;
}

export class RelayRequest implements QuoteRequest {
  public routingType: RoutingType.RELAY = RoutingType.RELAY;

  public static fromRequestBody(info: QuoteRequestInfo, body: RelayConfigJSON): RelayRequest {
    const convertedSlippage = info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    return new RelayRequest(
      {
        ...info,
        slippageTolerance: convertedSlippage,
      },
      {
        swapper: body.swapper ?? NATIVE_ADDRESS,
        gasToken: body.gasToken,
        startTimeBufferSecs: body.startTimeBufferSecs,
        auctionPeriodSecs: body.auctionPeriodSecs,
        deadlineBufferSecs: body.deadlineBufferSecs,
        amountInGasTokenStartOverride: body.amountInGasTokenStartOverride,
      }
    );
  }

  constructor(public readonly info: RelayQuoteRequestInfo, public readonly config: RelayConfig) {}

  public toJSON(): RelayConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.RELAY as RoutingType.RELAY,
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
