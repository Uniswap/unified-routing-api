import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import { SUPPORTED_CHAINS } from '../../config/chains';
import { DEFAULT_SLIPPAGE_TOLERANCE, RoutingType } from '../../constants';
import { ValidationError } from '../../util/errors';
import { currentTimestampInSeconds } from '../../util/time';
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
  tokenInDecimals: number;
  tokenOut: string;
  tokenOutDecimals: number;
  amount: BigNumber;
  type: TradeType;
  slippageTolerance?: string;
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

export function parseQuoteRequests(body: QuoteRequestBodyJSON, log?: Logger): QuoteRequest[] {
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

  const offerer = (requests.find((r) => r.routingType === RoutingType.DUTCH_LIMIT)?.config as DutchLimitConfig)
    ?.offerer;
  log?.info({
    eventType: 'UnifiedRoutingQuoteRequest',
    body: {
      requestId: info.requestId,
      tokenInChainId: info.tokenInChainId,
      tokenOutChainId: info.tokenOutChainId,
      tokenIn: info.tokenIn,
      tokenOut: info.tokenOut,
      amount: info.amount.toString(),
      type: TradeType[info.type],
      configs: requests.map((r) => r.routingType).join(','),
      createdAt: currentTimestampInSeconds(),
      // only log offerer if it's a dutch limit request
      ...(offerer && { offerer: offerer }),
    },
  });

  const result: Set<RoutingType> = new Set();
  requests.forEach((request) => {
    if (result.has(request.routingType)) {
      throw new ValidationError(`Duplicate routing type: ${request.routingType}`);
    }
    result.add(request.routingType);
  });

  return requests;
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

// compares two request infos, returning true if they are quoting the same thing
// note requests of different types but over the same data would return true here
export function requestInfoEquals(a: QuoteRequestInfo, b: QuoteRequestInfo): boolean {
  return (
    a.requestId === b.requestId &&
    a.tokenInChainId === b.tokenInChainId &&
    a.tokenOutChainId === b.tokenOutChainId &&
    a.tokenIn === b.tokenIn &&
    a.tokenOut === b.tokenOut &&
    a.amount.eq(b.amount) &&
    a.type === b.type
  );

  // TODO: slippage tolerance is currently formatted differently by type
  // unify so we can add that check here as well
}

// TODO: maybe have key as getter on request
// so diff request types can specify their own key
export function defaultRequestKey(request: QuoteRequest): string {
  // specify request key as the shared info and routing type
  // so we make have multiple requests with different configs
  return JSON.stringify({
    ...request.info,
    routingType: request.routingType,
    // overwrite request id which is irrelevant to deduplication
    requestId: '',
    slippageTolerance: '',
  });
}
