import { DEFAULT_AUCTION_PERIOD_SECS, DEFAULT_EXCLUSIVE_PERIOD_SECS, ZERO_ADDRESS } from '../../constants';
import { QuoteRequest, QuoteRequestInfo, RoutingType } from '.';

export * from './ClassicRequest';
export * from './DutchLimitRequest';

export interface DutchLimitConfig {
  offerer: string;
  exclusivePeriodSecs: number;
  auctionPeriodSecs: number;
}

export interface DutchLimitConfigJSON extends DutchLimitConfig {
  routingType: RoutingType;
}

export class DutchLimitRequest implements QuoteRequest {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;

  public static fromRequestBody(info: QuoteRequestInfo, body: DutchLimitConfigJSON): DutchLimitRequest {
    return new DutchLimitRequest(info, {
      offerer: body.offerer ?? ZERO_ADDRESS,
      exclusivePeriodSecs: body.exclusivePeriodSecs ?? DEFAULT_EXCLUSIVE_PERIOD_SECS,
      auctionPeriodSecs: body.auctionPeriodSecs ?? DEFAULT_AUCTION_PERIOD_SECS,
    });
  }

  constructor(public readonly info: QuoteRequestInfo, public readonly config: DutchLimitConfig) {}

  public toJSON(): DutchLimitConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.DUTCH_LIMIT,
    });
  }
}
