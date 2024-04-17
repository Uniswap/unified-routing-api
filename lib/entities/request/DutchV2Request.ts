import { ethers } from 'ethers';
import { defaultRequestKey, QuoteRequest, QuoteRequestHeaders, QuoteRequestInfo } from '.';
import { DEFAULT_SLIPPAGE_TOLERANCE, RoutingType } from '../../constants';
import { DutchQuoteRequestInfo, DutchRequest as DutchV1Request } from './DutchRequest';

export interface DutchV2Config {
  swapper: string;
  deadlineBufferSecs?: number;
  useSyntheticQuotes: boolean;
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
      }
    );
  }

  constructor(
    public readonly info: DutchQuoteRequestInfo,
    public readonly config: DutchV2Config,
    public headers: QuoteRequestHeaders = {}
  ) {}

  public toDutchV1Request(): DutchV1Request {
    return new DutchV1Request(this.info, {
      ...this.config,
      exclusivityOverrideBps: 0,
    });
  }

  public toJSON(): DutchV2ConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.DUTCH_V2 as RoutingType.DUTCH_V2,
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
