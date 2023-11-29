import { TradeType } from '@uniswap/sdk-core';
import { NATIVE_NAMES_BY_ID } from '@uniswap/smart-order-router';
import { AxiosError, AxiosResponse } from 'axios';
import querystring from 'querystring';

import { frontendAndUraEnablePortion, NATIVE_ADDRESS, RoutingType } from '../../constants';
import { ClassicQuote, ClassicQuoteDataJSON, ClassicRequest, Quote } from '../../entities';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import axios from './helpers';
import { Quoter, QuoterType } from './index';

export class RoutingApiQuoter implements Quoter {
  static readonly type: QuoterType.ROUTING_API;

  constructor(private routingApiUrl: string, private routingApiKey: string) {}

  async quote(request: ClassicRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.CLASSIC) {
      throw new Error(`Invalid routing config type: ${request.routingType}`);
    }

    metrics.putMetric(`RoutingApiQuoterRequest`, 1);
    try {
      const req = this.buildRequest(request);
      const now = Date.now();
      const response = await axios.get<ClassicQuoteDataJSON>(req, { headers: { 'x-api-key': this.routingApiKey } });
      const portionAdjustedResponse: AxiosResponse<ClassicQuoteDataJSON> = {
        ...response,
        // NOTE: important to show portion-related fields under flag on only
        // this is FE requirement
        data: frontendAndUraEnablePortion(request.info.sendPortionEnabled)
          ? {
              ...response.data,
              // NOTE: important for URA to return 0 bps and amount, in case of no portion.
              // this is FE requirement
              portionBips: response.data.portionBips ?? 0,
              portionAmount: response.data.portionAmount ?? '0',
              portionAmountDecimals: response.data.portionAmountDecimals ?? '0',
              quoteGasAndPortionAdjusted: response.data.quoteGasAndPortionAdjusted ?? response.data.quoteGasAdjusted,
              quoteGasAndPortionAdjustedDecimals:
                response.data.quoteGasAndPortionAdjustedDecimals ?? response.data.quoteGasAdjustedDecimals,
            }
          : response.data,
      };

      metrics.putMetric(`RoutingApiQuoterSuccess`, 1);
      metrics.putMetric(`RoutingApiQuoterLatency`, Date.now() - now);
      return ClassicQuote.fromResponseBody(request, portionAdjustedResponse.data);
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

  buildRequest(request: ClassicRequest): string {
    const tradeType = request.info.type === TradeType.EXACT_INPUT ? 'exactIn' : 'exactOut';
    const config = request.config;
    const amount = request.info.amount.toString();

    return (
      this.routingApiUrl +
      'quote?' +
      querystring.stringify({
        tokenInAddress: mapNative(request.info.tokenIn, request.info.tokenInChainId),
        tokenInChainId: request.info.tokenInChainId,
        tokenOutAddress: mapNative(request.info.tokenOut, request.info.tokenInChainId),
        tokenOutChainId: request.info.tokenOutChainId,
        amount: amount,
        type: tradeType,
        ...(config.protocols &&
          config.protocols.length && { protocols: config.protocols.map((p) => p.toLowerCase()).join(',') }),
        ...(config.gasPriceWei !== undefined && { gasPriceWei: config.gasPriceWei }),
        ...(request.info.slippageTolerance !== undefined && { slippageTolerance: request.info.slippageTolerance }),
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
        ...(request.info.portion &&
          frontendAndUraEnablePortion(request.info.sendPortionEnabled) && {
            portionBips: request.info.portion.bips,
            portionRecipient: request.info.portion.recipient,
          }),
        ...(request.info.intent && { intent: request.info.intent }),
        ...(request.info.source && { source: request.info.source }),
      })
    );
  }
}

function mapNative(token: string, chainId: number): string {
  if (token === NATIVE_ADDRESS) return NATIVE_NAMES_BY_ID[chainId][0];
  return token;
}
