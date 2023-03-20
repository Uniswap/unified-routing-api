import { QuoteRequest, QuoteRequestInfo } from '.';
import {
  DEFAULT_AUCTION_PERIOD_SECS,
  DEFAULT_EXCLUSIVE_PERIOD_SECS,
  DEFAULT_SLIPPAGE_TOLERANCE,
  ZERO_ADDRESS,
} from '../../constants';
import { RoutingType } from '../../util/types';

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
    const convertedSlippage = (parseFloat(info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE) * 100).toString();
    return new DutchLimitRequest(
      {
        ...info,
        slippageTolerance: convertedSlippage,
      },
      {
        offerer: body.offerer ?? ZERO_ADDRESS,
        exclusivePeriodSecs: body.exclusivePeriodSecs ?? DEFAULT_EXCLUSIVE_PERIOD_SECS,
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
