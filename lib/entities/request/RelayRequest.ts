import { Protocol } from '@uniswap/router-sdk';
import { APIGatewayProxyEventHeaders } from 'aws-lambda/trigger/api-gateway-proxy';

import { BigNumber } from 'ethers';
import { ClassicConfig, ClassicConfigJSON, defaultRequestKey, parseProtocol, QuoteRequest, QuoteRequestInfo } from '.';
import { DEFAULT_SLIPPAGE_TOLERANCE, NATIVE_ADDRESS, RoutingType } from '../../constants';

export * from './ClassicRequest';
export * from './RelayRequest';

// Relay conrigs are extended classic configs with a required gasToken
// and optional UniswapX-like parameters to customize the parametization of the fee escalation
export interface RelayConfig extends ClassicConfig {
  swapper: string;
  gasToken: string;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  // Passed in by cients
  feeAmountStartOverride?: string;
}

export interface RelayQuoteRequestInfo extends QuoteRequestInfo {
  slippageTolerance: string;
}

export interface RelayConfigJSON extends Omit<ClassicConfigJSON, 'routingType'> {
  routingType: RoutingType.RELAY;
  gasToken: string;
  swapper?: string;
  startTimeBufferSecs?: number;
  auctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
  feeAmountStartOverride?: string;
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
      Object.assign({}, body, {
        // Classic quote specific formatting
        protocols: body.protocols?.flatMap((p: string) => parseProtocol(p)),
        permitAmount: body.permitAmount ? BigNumber.from(body.permitAmount) : undefined,
        // Relay quote specific formatting
        swapper: body.swapper ?? NATIVE_ADDRESS,
      })
    );
  }

  constructor(
    public readonly info: RelayQuoteRequestInfo,
    public readonly config: RelayConfig,
    public headers: APIGatewayProxyEventHeaders = {}
  ) {}

  public toJSON(): RelayConfigJSON {
    return Object.assign({}, this.config, {
      routingType: RoutingType.RELAY as RoutingType.RELAY,
      // Classic quote specific formatting
      protocols: this.config.protocols?.map((p: Protocol) => p.toString()),
      ...(this.config.permitAmount !== undefined && { permitAmount: this.config.permitAmount.toString() }),
      ...(this.info.source !== undefined && { source: this.info.source.toString() }),
    });
  }

  public key(): string {
    return defaultRequestKey(this);
  }
}
