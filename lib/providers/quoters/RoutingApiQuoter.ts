import { TradeType } from '@uniswap/sdk-core';
import querystring from 'querystring';
import axios from './helpers';

import { NATIVE_ADDRESS, RoutingType } from '../../constants';
import { ClassicQuote, ClassicRequest, Quote } from '../../entities';
import { log as globalLog } from '../../util/log';
import { metrics } from '../../util/metrics';
import { Quoter, QuoterType } from './index';

const log = globalLog.child({ quoter: 'RoutingApiQuoter' });

export class RoutingApiQuoter implements Quoter {
  static readonly type: QuoterType.ROUTING_API;

  constructor(private routingApiUrl: string) {}

  async quote(request: ClassicRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.CLASSIC) {
      throw new Error(`Invalid routing config type: ${request.routingType}`);
    }
    
    metrics.putMetric(`RoutingApiQuoterRequest`, 1);
    try {
      const req = this.buildRequest(request);
      const response = await axios.get(req);
      metrics.putMetric(`RoutingApiQuoterSuccess`, 1);
      return ClassicQuote.fromResponseBody(request, response.data);
    } catch (e) {
      log.error(e, 'RoutingApiQuoterErr');
      metrics.putMetric(`RoutingApiQuoterErr`, 1);
      return null;
    }
  }

  buildRequest(request: ClassicRequest): string {
    const tradeType = request.info.type === TradeType.EXACT_INPUT ? 'exactIn' : 'exactOut';
    const config = request.config;
    return (
      this.routingApiUrl +
      'quote?' +
      querystring.stringify({
        tokenInAddress: mapNative(request.info.tokenIn),
        tokenInChainId: request.info.tokenInChainId,
        tokenOutAddress: mapNative(request.info.tokenOut),
        tokenOutChainId: request.info.tokenOutChainId,
        amount: request.info.amount.toString(),
        type: tradeType,
        ...(config.protocols &&
          config.protocols.length && { protocols: config.protocols.map((p) => p.toLowerCase()).join(',') }),
        ...(config.gasPriceWei !== undefined && { gasPriceWei: config.gasPriceWei }),
        // routing-api only accepts slippage tolerance if deadline and recipient are provided
        // we have default slippage tolerances in URA so need these extra checks
        ...(request.info.slippageTolerance !== undefined &&
          config.recipient &&
          config.deadline && { slippageTolerance: request.info.slippageTolerance }),
        ...(config.minSplits !== undefined && { minSplits: config.minSplits }),
        ...(config.forceCrossProtocol !== undefined && { forceCrossProtocol: config.forceCrossProtocol }),
        ...(config.forceMixedRoutes !== undefined && { forceMixedRoutes: config.forceMixedRoutes }),
        ...(config.deadline !== undefined && { deadline: config.deadline }),
        ...(config.algorithm !== undefined && { algorithm: config.algorithm }),
        ...(config.simulateFromAddress !== undefined && { simulateFromAddress: config.simulateFromAddress }),
        ...(config.permitSignature !== undefined && { permitSignature: config.permitSignature }),
        ...(config.permitNonce !== undefined && { permitNonce: config.permitNonce }),
        ...(config.permitExpiration !== undefined && { permitExpiration: config.permitExpiration }),
        ...(config.permitAmount !== undefined && { permitAmount: config.permitAmount.toString() }),
        ...(config.permitSigDeadline !== undefined && { permitSigDeadline: config.permitSigDeadline }),
        ...(config.enableUniversalRouter !== undefined && { enableUniversalRouter: config.enableUniversalRouter }),
        ...(config.recipient !== undefined && { recipient: config.recipient }),
      })
    );
  }
}

function mapNative(token: string): string {
  if (token === NATIVE_ADDRESS) return 'ETH';
  return token;
}
