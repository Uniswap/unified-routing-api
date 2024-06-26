import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { ChainConfigManager } from '../../config/ChainConfigManager';
import { DEFAULT_SLIPPAGE_TOLERANCE, RoutingType } from '../../constants';
import { Portion } from '../../fetchers/PortionFetcher';
import { ValidationError } from '../../util/errors';
import { ClassicConfig, ClassicConfigJSON, ClassicRequest } from './ClassicRequest';
import { DutchConfig, DutchConfigJSON, DutchV1Request } from './DutchV1Request';
import { DutchV2Config, DutchV2ConfigJSON, DutchV2Request } from './DutchV2Request';
import { RelayConfig, RelayConfigJSON, RelayRequest } from './RelayRequest';

export * from './ClassicRequest';
export * from './DutchV1Request';
export * from './DutchV2Request';
export * from './RelayRequest';

export type RequestByRoutingType = { [routingType in RoutingType]?: QuoteRequest };

// config specific to the given routing type
export type RoutingConfig = DutchConfig | DutchV2Config | RelayConfig | ClassicConfig;
export type DutchRoutingConfig = DutchConfig | DutchV2Config;
export type RoutingConfigJSON = DutchConfigJSON | DutchV2ConfigJSON | RelayConfigJSON | ClassicConfigJSON;

export interface QuoteRequestHeaders {
  [name: string]: string | undefined;
}

// shared info for all quote requests
export interface QuoteRequestInfo {
  requestId: string;
  tokenInChainId: number;
  tokenOutChainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: BigNumber;
  type: TradeType;
  slippageTolerance?: string;
  swapper?: string;
  useUniswapX?: boolean;
  sendPortionEnabled?: boolean;
  portion?: Portion;
  intent?: string;
  source?: RequestSource;
}

export interface DutchQuoteRequestInfo extends QuoteRequestInfo {
  slippageTolerance: string;
}

export interface QuoteRequestBodyJSON extends Omit<QuoteRequestInfo, 'type' | 'amount'> {
  type: string;
  amount: string;
  configs: RoutingConfigJSON[];
}

export enum RequestSource {
  UNKNOWN = 'unknown',
  UNISWAP_IOS = 'uniswap-ios',
  UNISWAP_ANDROID = 'uniswap-android',
  UNISWAP_WEB = 'uniswap-web',
  EXTERNAL_API = 'external-api',
  EXTERNAL_API_MOBILE = 'external-api:mobile',
  UNISWAP_EXTENSION = 'uniswap-extension',
}

export interface QuoteRequest {
  routingType: RoutingType;
  info: QuoteRequestInfo;
  config: RoutingConfig;
  headers: QuoteRequestHeaders;

  toJSON(): RoutingConfigJSON;
  // return a key that uniquely identifies this request
  key(): string;
}

export interface DutchQuoteRequest {
  routingType: RoutingType.DUTCH_LIMIT | RoutingType.DUTCH_V2;
  info: DutchQuoteRequestInfo;
  config: DutchRoutingConfig;
  headers: QuoteRequestHeaders;

  toJSON(): RoutingConfigJSON;
  // return a key that uniquely identifies this request
  key(): string;
}

export function parseQuoteRequests(body: QuoteRequestBodyJSON): {
  quoteRequests: QuoteRequest[];
  quoteInfo: QuoteRequestInfo;
} {
  const info: QuoteRequestInfo = {
    requestId: body.requestId,
    tokenInChainId: body.tokenInChainId,
    tokenOutChainId: body.tokenOutChainId,
    tokenIn: body.tokenIn,
    tokenOut: body.tokenOut,
    amount: BigNumber.from(body.amount),
    type: parseTradeType(body.type),
    slippageTolerance: body.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
    swapper: body.swapper,
    sendPortionEnabled: body.sendPortionEnabled,
    portion: body.portion,
    intent: body.intent,
  };

  const requests = body.configs.flatMap((config) => {
    if (
      config.routingType == RoutingType.CLASSIC &&
      ChainConfigManager.chainSupportsRoutingType(info.tokenInChainId, RoutingType.CLASSIC)
    ) {
      return ClassicRequest.fromRequestBody(info, config as ClassicConfigJSON);
    } else if (
      config.routingType == RoutingType.DUTCH_LIMIT &&
      ChainConfigManager.chainSupportsRoutingType(info.tokenInChainId, RoutingType.DUTCH_LIMIT) &&
      info.tokenInChainId === info.tokenOutChainId
    ) {
      return DutchV1Request.fromRequestBody(info, config as DutchConfigJSON);
    } else if (
      config.routingType == RoutingType.RELAY &&
      ChainConfigManager.chainSupportsRoutingType(info.tokenInChainId, RoutingType.RELAY) &&
      info.tokenInChainId === info.tokenOutChainId
    ) {
      return RelayRequest.fromRequestBody(info, config as RelayConfigJSON);
    } else if (
      config.routingType == RoutingType.DUTCH_V2 &&
      ChainConfigManager.chainSupportsRoutingType(info.tokenInChainId, RoutingType.DUTCH_V2) &&
      info.tokenInChainId === info.tokenOutChainId
    ) {
      return DutchV2Request.fromRequestBody(info, config as DutchV2ConfigJSON);
    }
    return [];
  });

  const result: Set<RoutingType> = new Set();
  requests.forEach((request) => {
    if (result.has(request.routingType)) {
      throw new ValidationError(`Duplicate routing type: ${request.routingType}`);
    }
    result.add(request.routingType);
  });

  return { quoteInfo: info, quoteRequests: requests };
}

export function parseTradeType(tradeType: string): TradeType {
  if (tradeType === 'exactIn' || tradeType === 'EXACT_INPUT') {
    return TradeType.EXACT_INPUT;
  } else if (tradeType === 'exactOut' || tradeType === 'EXACT_OUTPUT') {
    return TradeType.EXACT_OUTPUT;
  } else {
    throw new Error(`Invalid trade type: ${tradeType}`);
  }
}

// uniquely identifying key for a request
export function defaultRequestKey(request: QuoteRequest): string {
  // specify request key as the shared info and routing type
  // so we make have multiple requests with different configs
  const info = request.info;
  return JSON.stringify({
    routingType: request.routingType,
    tokenInChainId: info.tokenInChainId,
    tokenOutChainId: info.tokenOutChainId,
    tokenIn: info.tokenIn,
    tokenOut: info.tokenOut,
    amount: info.amount.toString(),
    type: info.type,
  });
}

export function parseProtocol(protocol: string): Protocol {
  const protocolUpper = protocol.toUpperCase();

  if (protocolUpper in Protocol) {
    return Protocol[protocolUpper as keyof typeof Protocol];
  }

  throw new Error(`Invalid protocol: ${protocol}`);
}
