import { defaultRequestKey, QuoteRequest, QuoteRequestInfo } from '.';
import {
  DEFAULT_EXCLUSIVITY_OVERRIDE_BPS,
  DEFAULT_SLIPPAGE_TOLERANCE,
  NATIVE_ADDRESS,
  RoutingType,
} from '../../constants';

export * from './ClassicRequest';
export * from './DutchLimitRequest';

export interface DutchLimitConfig {
  offerer: string;
  exclusivityOverrideBps: number;
  auctionPeriodSecs: number;
}

export interface DutchQuoteRequestInfo extends QuoteRequestInfo {
  slippageTolerance: string;
}

export interface DutchLimitConfigJSON extends DutchLimitConfig {
  routingType: RoutingType.DUTCH_LIMIT;
}

export class DutchLimitRequest implements QuoteRequest {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;

  public static fromRequestBody(info: QuoteRequestInfo, body: DutchLimitConfigJSON): DutchLimitRequest {
    const convertedSlippage = info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    return new DutchLimitRequest(
      {
        ...info,
        slippageTolerance: convertedSlippage,
      },
      {
        offerer: body.offerer ?? NATIVE_ADDRESS,
        exclusivityOverrideBps: body.exclusivityOverrideBps ?? DEFAULT_EXCLUSIVITY_OVERRIDE_BPS,
        auctionPeriodSecs: body.auctionPeriodSecs ?? DutchLimitRequest.defaultAuctionPeriodSecs(info.tokenInChainId),
      }
    );
  }

  constructor(public readonly info: DutchQuoteRequestInfo, public readonly config: DutchLimitConfig) {}

  // TODO: parameterize this based on other factors
  public static defaultAuctionPeriodSecs(chainId: number): number {
    switch (chainId) {
      case 1:
        return 60;
      case 137:
        return 60;
      default:
        return 60;
    }
  }

  public toJSON(): DutchLimitConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.DUTCH_LIMIT as RoutingType.DUTCH_LIMIT,
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
