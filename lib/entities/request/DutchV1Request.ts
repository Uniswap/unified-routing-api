import { defaultRequestKey, QuoteRequest, QuoteRequestHeaders, QuoteRequestInfo } from '.';
import {
  DEFAULT_EXCLUSIVITY_OVERRIDE_BPS,
  DEFAULT_SLIPPAGE_TOLERANCE,
  NATIVE_ADDRESS,
  RoutingType,
} from '../../constants';

export * from './ClassicRequest';
export * from './DutchV1Request';

export interface DutchConfig {
  swapper: string;
  exclusivityOverrideBps: number;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  useSyntheticQuotes: boolean;
  gasAdjustmentBps?: number;
}

export interface DutchQuoteRequestInfo extends QuoteRequestInfo {
  slippageTolerance: string;
}

export interface DutchConfigJSON {
  routingType: RoutingType.DUTCH_LIMIT | RoutingType.DUTCH_V2;
  swapper?: string;
  exclusivityOverrideBps?: number;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  useSyntheticQuotes?: boolean;
  gasAdjustmentBps?: number;
}

export class DutchV1Request implements QuoteRequest {
  public routingType: RoutingType.DUTCH_LIMIT = RoutingType.DUTCH_LIMIT;

  public static fromRequestBody(info: QuoteRequestInfo, body: DutchConfigJSON): DutchV1Request {
    const convertedSlippage = info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    return new DutchV1Request(
      {
        ...info,
        slippageTolerance: convertedSlippage,
      },
      {
        swapper: body.swapper ?? NATIVE_ADDRESS,
        exclusivityOverrideBps: body.exclusivityOverrideBps ?? DEFAULT_EXCLUSIVITY_OVERRIDE_BPS.toNumber(),
        startTimeBufferSecs: body.startTimeBufferSecs,
        auctionPeriodSecs: body.auctionPeriodSecs,
        deadlineBufferSecs: body.deadlineBufferSecs,
        useSyntheticQuotes: body.useSyntheticQuotes ?? false,
      }
    );
  }

  constructor(
    public readonly info: DutchQuoteRequestInfo,
    public readonly config: DutchConfig,
    public headers: QuoteRequestHeaders = {}
  ) {}

  public toJSON(): DutchConfigJSON {
    return Object.assign({}, this.config, {
      routingType: this.routingType as RoutingType.DUTCH_LIMIT | RoutingType.DUTCH_V2,
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
