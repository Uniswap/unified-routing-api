import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { DEFAULT_SLIPPAGE_TOLERANCE } from '../../constants';
import { ClassicConfig, ClassicConfigJSON, ClassicRequest } from './ClassicRequest';
import { DutchLimitConfig, DutchLimitConfigJSON, DutchLimitRequest } from './DutchLimitRequest';

export * from './ClassicRequest';
export * from './DutchLimitRequest';

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
}

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

export function parseQuoteRequests(body: QuoteRequestBodyJSON, gasPrice: string): QuoteRequest[] {
  const info: QuoteRequestInfo = {
    requestId: body.requestId,
    tokenInChainId: body.tokenInChainId,
    tokenOutChainId: body.tokenOutChainId,
    tokenIn: body.tokenIn,
    tokenOut: body.tokenOut,
    amount: BigNumber.from(body.amount),
    type: TradeType[body.type as keyof typeof TradeType],
    slippageTolerance: body.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
  };

  let hasClassic = false;
  const requests = body.configs.flatMap((config) => {
    if (config.routingType == RoutingType.CLASSIC) {
      hasClassic = true;
      if (!(config as ClassicConfig).gasPriceWei) {
        (config as ClassicConfig).gasPriceWei = gasPrice;
      }
      return ClassicRequest.fromRequestBody(info, config as ClassicConfigJSON);
    } else if (config.routingType == RoutingType.DUTCH_LIMIT) {
      return DutchLimitRequest.fromRequestBody(info, config as DutchLimitConfigJSON);
    }
    return [];
  });

  if (!hasClassic) {
    requests.push(
      ClassicRequest.fromRequestBody(info, {
        routingType: RoutingType.CLASSIC,
        protocols: ['V2', 'V3', 'MIXED'],
        gasPriceWei: gasPrice,
      })
    );
  }
  return requests;
}
