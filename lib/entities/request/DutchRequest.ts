import { defaultRequestKey, QuoteRequest, QuoteRequestHeaders, QuoteRequestInfo } from '.';
import {
  DEFAULT_EXCLUSIVITY_OVERRIDE_BPS,
  DEFAULT_SLIPPAGE_TOLERANCE,
  NATIVE_ADDRESS,
  RoutingType,
} from '../../constants';

export * from './ClassicRequest';
export * from './DutchRequest';

export interface DutchConfig {
  swapper: string;
  exclusivityOverrideBps: number;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  useSyntheticQuotes: boolean;
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
}

export class DutchRequest implements QuoteRequest {
  public static fromRequestBody(info: QuoteRequestInfo, body: DutchConfigJSON): DutchRequest {
    const convertedSlippage = info.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    return new DutchRequest(
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
    public readonly routingType: RoutingType.DUTCH_LIMIT | RoutingType.DUTCH_V2 = RoutingType.DUTCH_LIMIT,
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
