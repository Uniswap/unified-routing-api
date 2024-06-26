import { ethers } from 'ethers';
import { defaultRequestKey, QuoteRequest, QuoteRequestHeaders, QuoteRequestInfo } from '.';
import { DEFAULT_SLIPPAGE_TOLERANCE, RoutingType } from '../../constants';
import { DutchQuoteRequestInfo } from './DutchV1Request';

export interface DutchV2Config {
  swapper: string;
  deadlineBufferSecs?: number;
  // Setting true will include an Open Order in the quote comparison
  useSyntheticQuotes: boolean;
  gasAdjustmentBps?: number;
  // Setting true will force an Open Order and skip RFQ
  forceOpenOrders?: boolean;
  priceImprovementBps?: number;
}

export interface DutchV2ConfigJSON extends Omit<DutchV2Config, 'useSyntheticQuotes'> {
  routingType: RoutingType.DUTCH_V2;
  useSyntheticQuotes?: boolean;
}

export class DutchV2Request implements QuoteRequest {
  public routingType: RoutingType.DUTCH_V2 = RoutingType.DUTCH_V2;

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
        useSyntheticQuotes: body.useSyntheticQuotes ?? false,
        gasAdjustmentBps: body.gasAdjustmentBps,
        forceOpenOrders: body.forceOpenOrders,
        priceImprovementBps: body.priceImprovementBps,
      }
    );
  }

  constructor(
    public readonly info: DutchQuoteRequestInfo,
    public readonly config: DutchV2Config,
    public headers: QuoteRequestHeaders = {}
  ) {}

  public toJSON(): DutchV2ConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.DUTCH_V2 as RoutingType.DUTCH_V2,
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
