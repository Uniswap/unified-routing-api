import { QuoteRequest, QuoteRequestInfo, RoutingType } from '.';
import {
  DEFAULT_AUCTION_PERIOD_SECS,
  DEFAULT_EXCLUSIVITY_OVERRIDE_BPS,
  DEFAULT_SLIPPAGE_TOLERANCE,
  NATIVE_ADDRESS,
} from '../../constants';

export * from './ClassicRequest';
export * from './DutchLimitRequest';

export interface DutchLimitConfig {
  offerer: string;
  exclusivityOverrideBps: number;
  auctionPeriodSecs: number;
}

export interface DutchLimitConfigJSON extends DutchLimitConfig {
  routingType: RoutingType;
}

export class DutchLimitRequest implements QuoteRequest {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;

  public static fromRequestBody(info: QuoteRequestInfo, body: DutchLimitConfigJSON): DutchLimitRequest {
    const convertedSlippage = (parseFloat(info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE) * 100).toString();
    return new DutchLimitRequest(
      {
        ...info,
        slippageTolerance: convertedSlippage,
      },
      {
        offerer: body.offerer ?? NATIVE_ADDRESS,
        exclusivityOverrideBps: body.exclusivityOverrideBps ?? DEFAULT_EXCLUSIVITY_OVERRIDE_BPS,
        auctionPeriodSecs: body.auctionPeriodSecs ?? DEFAULT_AUCTION_PERIOD_SECS,
      }
    );
  }

  constructor(public readonly info: QuoteRequestInfo, public readonly config: DutchLimitConfig) {}

  public toJSON(): DutchLimitConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.DUTCH_LIMIT,
    });
  }
}
