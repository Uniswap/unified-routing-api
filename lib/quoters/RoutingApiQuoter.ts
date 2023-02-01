import { TradeType } from '@uniswap/sdk-core';
import axios from 'axios';
import Logger from 'bunyan';
import querystring from 'querystring';

import { QuoteRequest } from '../entities/QuoteRequest';
import { QuoteResponse } from '../entities/QuoteResponse';
import { ClassicQuote } from '../entities/quotes';
import { ClassicConfig, RoutingConfig, RoutingType } from '../entities/routing';
import { Quoter, QuoterType } from './index';

export class RoutingApiQuoter implements Quoter {
  static readonly type: QuoterType.ROUTING_API;
  private log: Logger;

  constructor(_log: Logger, private routingApiUrl: string) {
    this.log = _log.child({ quoter: 'RoutingApiQuoter' });
  }

  async quote(params: QuoteRequest, config: RoutingConfig): Promise<QuoteResponse> {
    this.log.info(params, 'quoteRequest');
    this.log.info(this.routingApiUrl, 'routingApiUrl');

    if (config.routingType !== RoutingType.CLASSIC) {
      throw new Error(`Invalid routing config type: ${config.routingType}`);
    }

    const response = await axios.get(this.buildRequest(params, config as ClassicConfig));

    return new QuoteResponse(RoutingType.CLASSIC, ClassicQuote.fromResponseBody(response.data, params.tradeType));
  }

  buildRequest(params: QuoteRequest, config: ClassicConfig): string {
    const tradeType = params.tradeType === TradeType.EXACT_INPUT ? 'exactIn' : 'exactOut';
    return (
      this.routingApiUrl +
      'quote' +
      querystring.stringify({
        tokenInAddress: params.tokenIn,
        tokenInChainId: params.tokenInChainId,
        tokenOutAddress: params.tokenOut,
        tokenOutChainId: params.tokenOutChainId,
        amount: params.amount.toString(),
        type: tradeType,
        slippageTolerance: config.slippageTolerance,
        deadline: config.deadline,
        gasPriceWei: config.gasPriceWei,
        minSplits: config.minSplits,
        forceCrossProtocol: config.forceCrossProtocol,
        forceMixedRoute: config.forceMixedRoutes,
        protocols: config.protocols.map((p) => p.toLowerCase()),
        simulateFromAddress: config.simulateFromAddress,
        permitSignature: config.permitSignature,
        permitNonce: config.permitNonce,
        permitExpiration: config.permitExpiration,
        permitAmount: config.permitAmount && config.permitAmount.toString(),
        permitSigDeadline: config.permitSigDeadline,
        enableUniversalRouter: config.enableUniversalRouter,
      })
    );
  }
}
