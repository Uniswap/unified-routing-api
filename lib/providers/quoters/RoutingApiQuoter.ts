import { TradeType } from '@uniswap/sdk-core';
import { NATIVE_NAMES_BY_ID } from '@uniswap/smart-order-router';
import { AxiosError } from 'axios';
import querystring from 'querystring';

import { NATIVE_ADDRESS, RoutingType } from '../../constants';
import { ClassicQuote, ClassicRequest, Quote } from '../../entities';
import { PortionFetcher } from '../../fetchers/PortionFetcher';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import axios from './helpers';
import { Quoter, QuoterType } from './index';

export class RoutingApiQuoter implements Quoter {
  static readonly type: QuoterType.ROUTING_API;

  constructor(private routingApiUrl: string, private routingApiKey: string, private portionFetcher: PortionFetcher) {}

  async quote(request: ClassicRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.CLASSIC) {
      throw new Error(`Invalid routing config type: ${request.routingType}`);
    }

    metrics.putMetric(`RoutingApiQuoterRequest`, 1);
    try {
      const req = await this.buildRequest(request);
      const now = Date.now();
      const response = await axios.get(req, { headers: { 'x-api-key': this.routingApiKey } });
      metrics.putMetric(`RoutingApiQuoterSuccess`, 1);
      metrics.putMetric(`RoutingApiQuoterLatency`, Date.now() - now);
      return ClassicQuote.fromResponseBody(request, response.data);
    } catch (e) {
      if (e instanceof AxiosError) {
        if (e.response?.status?.toString().startsWith('4')) {
          metrics.putMetric(`RoutingApiQuote4xxErr`, 1);
        } else {
          metrics.putMetric(`RoutingApiQuote5xxErr`, 1);
        }
      } else {
        metrics.putMetric(`RoutingApiQuote5xxErr`, 1);
      }
      log.error(e, 'RoutingApiQuoterErr');
      metrics.putMetric(`RoutingApiQuoterErr`, 1);

      // We want to ensure that we throw all non-404 errors
      // to ensure that the client will know the request is retryable.
      // We include 429's in the retryable errors because a 429 would
      // indicate that the Routing API was being rate-limited and a subsequent
      // retry may succeed.

      // We also want to retry the request if there is a non-"AxiosError".
      // This may be caused by a network interruption or some other infra related issues.
      if (!axios.isAxiosError(e)) {
        throw e;
      }

      const status = e.response?.status;
      if (status && (status === 429 || status >= 500)) {
        throw e;
      }

      return null;
    }
  }

  async buildRequest(request: ClassicRequest): Promise<string> {
    const getPortionResponse = await this.portionFetcher.getPortion(
      request.info.tokenInChainId,
      request.info.tokenOutChainId,
      request.info.tokenIn,
      request.info.tokenOut
    );

    // TODO: scale out portionAmount based on the token decimals
    const portionAmount = getPortionResponse.hasPortion ? request.info.amount.mul(getPortionResponse.portion.bips).div(10000).toString() : undefined;
    const tradeType = request.info.type === TradeType.EXACT_INPUT ? 'exactIn' : 'exactOut';
    const config = request.config;

    return (
      this.routingApiUrl +
      'quote?' +
      querystring.stringify({
        tokenInAddress: mapNative(request.info.tokenIn, request.info.tokenInChainId),
        tokenInChainId: request.info.tokenInChainId,
        tokenOutAddress: mapNative(request.info.tokenOut, request.info.tokenInChainId),
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
        // unicorn secret is only used for debug routing config
        // routing-api will only send the debug routing config that overrides the default routing config
        // (a.k.a. alpha router config within smart-order-router) if unified-routing-api
        // sends the correct unicorn secret
        ...(config.debugRoutingConfig !== undefined && { debugRoutingConfig: config.debugRoutingConfig }),
        ...(config.unicornSecret !== undefined && { unicornSecret: config.unicornSecret }),
        // quote speed can be sent in standalone query string param
        // expect web/mobile to send it for the 1st fast quote,
        // otherwise default not to send it
        ...(config.quoteSpeed !== undefined && { quoteSpeed: config.quoteSpeed }),
        ...(config.enableFeeOnTransferFeeFetching !== undefined && {
          enableFeeOnTransferFeeFetching: config.enableFeeOnTransferFeeFetching,
        }),
        ...(getPortionResponse.hasPortion && {
            portionBips: getPortionResponse.portion.bips,
            portionAmount: portionAmount,
            portionRecipient: getPortionResponse.portion.receiver,
          }),
      })
    );
  }
}

function mapNative(token: string, chainId: number): string {
  if (token === NATIVE_ADDRESS) return NATIVE_NAMES_BY_ID[chainId][0];
  return token;
}
