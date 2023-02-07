import { TradeType } from '@uniswap/sdk-core';
import axios from 'axios';
import Logger from 'bunyan';
import querystring from 'querystring';

import { QuoteRequest } from '../../entities/QuoteRequest';
import { QuoteResponse } from '../../entities/QuoteResponse';
import { ClassicQuote } from '../../entities/quotes';
import { ClassicConfig, RoutingConfig, RoutingType } from '../../entities/routing';
import { Quoter, QuoterType } from './index';

export class RoutingApiQuoter implements Quoter {
  static readonly type: QuoterType.ROUTING_API;
  private log: Logger;

  constructor(_log: Logger, private routingApiUrl: string) {
    this.log = _log.child({ quoter: 'RoutingApiQuoter' });
  }

  async quote(params: QuoteRequest, config: RoutingConfig): Promise<QuoteResponse | null> {
    this.log.info(params, 'quoteRequest');
    this.log.info(this.routingApiUrl, 'routingApiUrl');

    if (config.routingType !== RoutingType.CLASSIC) {
      throw new Error(`Invalid routing config type: ${config.routingType}`);
    }
    try {
      const req = this.buildRequest(params, config as ClassicConfig);
      this.log.info(req, 'routingApiReq');
      const response = await axios.get(this.buildRequest(params, config as ClassicConfig));
      return new QuoteResponse(RoutingType.CLASSIC, ClassicQuote.fromResponseBody(response.data, params.type));
    } catch (e) {
      this.log.error(e, 'RoutingApiQuoterErr');
      return null;
    }
  }

  buildRequest(params: QuoteRequest, config: ClassicConfig): string {
    const tradeType = params.type === TradeType.EXACT_INPUT ? 'exactIn' : 'exactOut';
    return (
      this.routingApiUrl +
      'quote?' +
      querystring.stringify({
        tokenInAddress: params.tokenIn,
        tokenInChainId: params.tokenInChainId,
        tokenOutAddress: params.tokenOut,
        tokenOutChainId: params.tokenOutChainId,
        amount: params.amount.toString(),
        type: tradeType,
        gasPriceWei: config.gasPriceWei,
        ...(config.protocols.length && { protocols: config.protocols.map((p) => p.toLowerCase()).join(',') }),
        ...(config.slippageTolerance !== undefined && { slippageTolerance: config.slippageTolerance }),
        ...(config.minSplits !== undefined && { minSplits: config.minSplits }),
        ...(config.forceCrossProtocol !== undefined && { forceCrossProtocol: config.forceCrossProtocol }),
        ...(config.forceMixedRoutes !== undefined && { forceMixedRoutes: config.forceMixedRoutes }),
        ...(config.deadline !== undefined && { deadline: config.deadline }),
        ...(config.simulateFromAddress !== undefined && { simulateFromAddress: config.simulateFromAddress }),
        ...(config.permitSignature !== undefined && { permitSignature: config.permitSignature }),
        ...(config.permitNonce !== undefined && { permitNonce: config.permitNonce }),
        ...(config.permitExpiration !== undefined && { permitExpiration: config.permitExpiration }),
        ...(config.permitAmount !== undefined && { permitAmount: config.permitAmount.toString() }),
        ...(config.permitSigDeadline !== undefined && { permitSigDeadline: config.permitSigDeadline }),
        ...(config.enableUniversalRouter !== undefined && { enableUniversalRouter: config.enableUniversalRouter }),
      })
    );
  }
}
