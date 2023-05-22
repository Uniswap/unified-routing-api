import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { SUPPORTED_CHAINS } from '../../config/chains';
import { DEFAULT_SLIPPAGE_TOLERANCE, RoutingType } from '../../constants';
import { ValidationError } from '../../util/errors';
import { ClassicConfig, ClassicConfigJSON, ClassicRequest } from './ClassicRequest';
import { DutchLimitConfig, DutchLimitConfigJSON, DutchLimitRequest } from './DutchLimitRequest';

export * from './ClassicRequest';
export * from './DutchLimitRequest';

export type RequestByRoutingType = { [routingType in RoutingType]?: QuoteRequest };

// config specific to the given routing type
export type RoutingConfig = DutchLimitConfig | ClassicConfig;
export type RoutingConfigJSON = DutchLimitConfigJSON | ClassicConfigJSON;

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
  offerer?: string;
}

export interface QuoteRequestBodyJSON extends Omit<QuoteRequestInfo, 'type' | 'amount'> {
  type: string;
  amount: string;
  configs: RoutingConfigJSON[];
}

export interface QuoteRequest {
  routingType: RoutingType;
  info: QuoteRequestInfo;
  config: RoutingConfig;
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
  };

  const requests = body.configs.flatMap((config) => {
    if (config.routingType == RoutingType.CLASSIC) {
      return ClassicRequest.fromRequestBody(info, config as ClassicConfigJSON);
    } else if (
      config.routingType == RoutingType.DUTCH_LIMIT &&
      SUPPORTED_CHAINS[RoutingType.DUTCH_LIMIT].includes(info.tokenInChainId) &&
      info.tokenInChainId === info.tokenOutChainId
    ) {
      return DutchLimitRequest.fromRequestBody(info, config as DutchLimitConfigJSON);
    }
    return [];
  });

  info.offerer = (requests.find((r) => r.routingType === RoutingType.DUTCH_LIMIT)?.config as DutchLimitConfig)?.offerer;

  const result: Set<RoutingType> = new Set();
  requests.forEach((request) => {
    if (result.has(request.routingType)) {
      throw new ValidationError(`Duplicate routing type: ${request.routingType}`);
    }
    result.add(request.routingType);
  });

  return { quoteInfo: info, quoteRequests: requests };
}

function parseTradeType(tradeType: string): TradeType {
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
