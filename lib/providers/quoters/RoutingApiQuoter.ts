import { Currency, TradeType } from '@uniswap/sdk-core';
import { NATIVE_NAMES_BY_ID } from '@uniswap/smart-order-router';
import { AxiosError, AxiosResponse } from 'axios';
import querystring from 'querystring';

import { ENABLE_PORTION, NATIVE_ADDRESS, RoutingType } from '../../constants';
import { ClassicQuote, ClassicQuoteDataJSON, ClassicRequest, Quote } from '../../entities';
import { Portion } from '../../fetchers/PortionFetcher';
import { TokenFetcher } from '../../fetchers/TokenFetcher';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import { IPortionProvider } from '../portion/PortionProvider';
import axios from './helpers';
import { Quoter, QuoterType } from './index';

export class RoutingApiQuoter implements Quoter {
  static readonly type: QuoterType.ROUTING_API;

  constructor(
    private routingApiUrl: string,
    private routingApiKey: string,
    private portionProvider: IPortionProvider,
    private tokenFetcher: TokenFetcher
  ) {}

  async quote(request: ClassicRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.CLASSIC) {
      throw new Error(`Invalid routing config type: ${request.routingType}`);
    }

    metrics.putMetric(`RoutingApiQuoterRequest`, 1);
    try {
      let [resolvedTokenIn, resolveTokenOut]: [Currency | undefined, Currency | undefined] = [undefined, undefined];

      try {
        // we will need to call token fetcher to resolve the tokenIn and tokenOut
        // there's no guarantee that the tokenIn and tokenOut are in the token address
        // also the tokenIn and tokenOut can be native token
        // portion service only accepts wrapped token address
        [resolvedTokenIn, resolveTokenOut] = await Promise.all([
          this.tokenFetcher.resolveTokenBySymbolOrAddress(request.info.tokenInChainId, request.info.tokenIn),
          this.tokenFetcher.resolveTokenBySymbolOrAddress(request.info.tokenOutChainId, request.info.tokenOut),
        ]);
      } catch (e) {
        // token fetcher can throw ValidationError,
        // we must swallow the error and continue, meanwhile logging them,
        // not being able to resolve the tokens here means we don't have portion amount
        // throughout the lifecycle of this quote request processing,
        // and we simply don't account for portion and let quote request processing continue
        log.error({ e }, 'Failed to resolve tokenIn & tokenOut');
        metrics.putMetric(`PortionProvider.resolveTokenErr`, 1);
      }

      const portion = (
        await this.portionProvider.getPortion(
          request.info,
          resolvedTokenIn?.wrapped.address,
          resolveTokenOut?.wrapped.address
        )
      ).portion;

      const req = this.buildRequest(request, portion, resolveTokenOut);
      const now = Date.now();
      const response = await axios.get<ClassicQuoteDataJSON>(req, { headers: { 'x-api-key': this.routingApiKey } });

      // we need to use raw quote amount for exact in, not quote adjusted gas amount, because raw quote amount is more accurate to estimate
      // the portion amount
      // although clients are expected to use the portionBips for exact in swaps for the best accurate, i.e. tokenOutAmount not important for exact in
      // tokenOutAmount only important for exact out, which is requested amount
      const tokenOutAmount =
        request.info.type === TradeType.EXACT_OUTPUT ? request.info.amount.toString() : response.data.quote;
      const portionAmount = this.portionProvider.getPortionAmount(tokenOutAmount, portion, resolveTokenOut);
      const portionAdjustedQuote = this.portionProvider.getPortionAdjustedQuote(
        request.info,
        response.data.quote,
        response.data.quoteGasAdjusted,
        portionAmount,
        resolvedTokenIn,
        resolveTokenOut
      );
      const quoteGasAndPortionAdjusted = portionAdjustedQuote?.quotient.toString() ?? response.data.quoteGasAdjusted;
      const quoteGasAndPortionAdjustedDecimals =
        portionAdjustedQuote?.toExact() ?? response.data.quoteGasAdjustedDecimals;

      const portionAdjustedResponse: AxiosResponse<ClassicQuoteDataJSON> = {
        ...response,
        data: ENABLE_PORTION(process.env.ENABLE_PORTION)
          ? {
              ...response.data,
              portionBips: portion?.bips, // important for exact in, clients are expected to use this for exact in swaps
              portionRecipient: portion?.recipient, // important, clients are expected to use this for exact in and exact out swaps
              portionAmount: portionAmount?.quotient.toString(), // important for exact out, clients are expected to use this for exact out swaps
              portionAmountDecimals: portionAmount?.toExact(), // important for exact out, clients are expected to use this for exact out swaps
              quoteGasAndPortionAdjusted: quoteGasAndPortionAdjusted, // not important, clients disregard this
              quoteGasAndPortionAdjustedDecimals: quoteGasAndPortionAdjustedDecimals, // not important, clients disregard this
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

  buildRequest(request: ClassicRequest, portion?: Portion, resolvedTokenOut?: Currency): string {
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
        ...(request.info.type === TradeType.EXACT_OUTPUT &&
          portion &&
          ENABLE_PORTION(process.env.ENABLE_PORTION) && {
            portionAmount: this.portionProvider
              .getPortionAmount(amount, portion, resolvedTokenOut)
              ?.quotient.toString(),
            portionRecipient: portion.recipient,
          }),
        ...(request.info.type === TradeType.EXACT_INPUT &&
          portion &&
          ENABLE_PORTION(process.env.ENABLE_PORTION) && {
            portionBips: portion.bips,
            portionRecipient: portion.recipient,
          }),
      })
    );
  }
}

function mapNative(token: string, chainId: number): string {
  if (token === NATIVE_ADDRESS) return NATIVE_NAMES_BY_ID[chainId][0];
  return token;
}
