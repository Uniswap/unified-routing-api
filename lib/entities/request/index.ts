import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import { DEFAULT_SLIPPAGE_TOLERANCE } from '../../constants';
import { currentTimestampInSeconds } from '../../util/time';
import { ClassicConfig, ClassicConfigJSON, ClassicRequest } from './ClassicRequest';
import { DutchLimitConfig, DutchLimitConfigJSON, DutchLimitRequest } from './DutchLimitRequest';

export * from './ClassicRequest';
export * from './DutchLimitRequest';

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
}

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
      // can be a request filter instead but we know have second thoughts on that design so not worth adding
      config.routingType == RoutingType.DUTCH_LIMIT &&
      info.tokenInChainId === 1 &&
      info.tokenInChainId === info.tokenOutChainId
    ) {
      return DutchLimitRequest.fromRequestBody(info, config as DutchLimitConfigJSON);
    }
    return [];
  });

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
    },
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
