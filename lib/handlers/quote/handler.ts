import Joi from 'joi';

import { TradeType } from '@uniswap/sdk-core';
import { Unit } from 'aws-embedded-metrics';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { APIGatewayProxyEventHeaders } from 'aws-lambda/trigger/api-gateway-proxy';
import { v4 as uuidv4 } from 'uuid';
import { frontendAndUraEnablePortion, NATIVE_ADDRESS, RoutingType } from '../../constants';
import {
  ClassicQuote,
  DutchQuote,
  DutchQuoteType,
  DutchV2Quote,
  parseQuoteContexts,
  parseQuoteRequests,
  Quote,
  QuoteContextManager,
  QuoteJSON,
  QuoteRequest,
  QuoteRequestBodyJSON,
  QuoteRequestInfo,
  RelayQuote,
  RequestSource,
} from '../../entities';
import { TokenFetcher } from '../../fetchers/TokenFetcher';
import { ErrorCode, NoQuotesAvailable, QuoteFetchError, ValidationError } from '../../util/errors';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import { emitUniswapXPairMetricIfTracking, QuoteType } from '../../util/metrics-pair';
import { timestampInMstoSeconds } from '../../util/time';
import { APIGLambdaHandler } from '../base';
import { APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/api-handler';
import { ContainerInjected, QuoterByRoutingType } from './injector';
import { PostQuoteRequestBodyJoi } from './schema';

const DISABLE_DUTCH_LIMIT_REQUESTS = false;

export interface SingleQuoteJSON {
  routing: string;
  quote: QuoteJSON;
}

export interface QuoteResponseJSON extends SingleQuoteJSON {
  requestId: string;
  allQuotes: (SingleQuoteJSON | null)[];
}

export class QuoteHandler extends APIGLambdaHandler<
  ContainerInjected,
  ApiRInj,
  QuoteRequestBodyJSON,
  void,
  QuoteResponseJSON
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>
  ): Promise<ErrorResponse | Response<QuoteResponseJSON>> {
    const {
      requestBody,
      containerInjected: {
        quoters,
        tokenFetcher,
        portionFetcher,
        permit2Fetcher,
        syntheticStatusProvider,
        chainIdRpcMap,
      },
    } = params;

    const startTime = Date.now();
    if (requestBody.tokenInChainId != requestBody.tokenOutChainId) {
      throw new ValidationError(`Cannot request quotes for tokens on different chains`);
    }

    const provider = chainIdRpcMap.get(requestBody.tokenInChainId);
    if (!provider) throw new Error(`No rpc provider found for chain: ${requestBody.tokenInChainId}`);

    const request = {
      ...requestBody,
      requestId: uuidv4(),
    };

    const requestSource = this.getQuoteRequestSource(params.event.headers);

    const beforeResolveTokens = Date.now();
    const tokenInAddress = await tokenFetcher.resolveTokenBySymbolOrAddress(request.tokenInChainId, request.tokenIn);
    const tokenOutAddress = await tokenFetcher.resolveTokenBySymbolOrAddress(request.tokenOutChainId, request.tokenOut);
    metrics.putMetric(
      `Latency-ResolveTokens-ChainId${requestBody.tokenInChainId}`,
      Date.now() - beforeResolveTokens,
      Unit.Milliseconds
    );

    const portion = frontendAndUraEnablePortion(request.sendPortionEnabled)
      ? (
          await portionFetcher.getPortion(
            request.tokenInChainId,
            tokenInAddress,
            request.tokenOutChainId,
            tokenOutAddress,
            requestSource
          )
        ).portion
      : undefined;

    const requestWithTokenAddresses = {
      ...request,
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      portion: portion,
    };

    log.info({ requestBody: request }, 'request');
    const parsedRequests = parseQuoteRequests(requestWithTokenAddresses);
    log.info({ parsedRequests }, 'parsedRequests');

    const { quoteInfo } = parsedRequests;
    let { quoteRequests } = parsedRequests;
    await this.emitQuoteRequestedMetrics(tokenFetcher, quoteInfo, quoteRequests, startTime);

    const isDutchEligible = await this.isDutchEligible(requestBody, tokenFetcher);
    if (!isDutchEligible) {
      quoteRequests = removeDutchRequests(quoteRequests);
    }

    const contextHandler = new QuoteContextManager(
      parseQuoteContexts(quoteRequests, {
        rpcProvider: provider,
        permit2Fetcher,
        syntheticStatusProvider,
      })
    );
    const requests = contextHandler.getRequests();
    log.info({ requests }, 'requests');

    for (const request of requests) {
      request.info.source = requestSource;
      request.headers = params.event.headers;
    }

    const beforeGetQuotes = Date.now();

    const quotes = await getQuotes(quoters, requests);
    metrics.putMetric(
      `Latency-GetQuotes-ChainId${requestBody.tokenInChainId}`,
      Date.now() - beforeGetQuotes,
      Unit.Milliseconds
    );

    log.info({ rawQuotes: quotes }, 'quotes');
    const beforeResolveQuotes = Date.now();
    const resolvedQuotes = await contextHandler.resolveQuotes(quotes);
    metrics.putMetric(
      `Latency-ResolveQuotes-ChainId${requestBody.tokenInChainId}`,
      Date.now() - beforeResolveQuotes,
      Unit.Milliseconds
    );
    log.info({ resolvedQuotes }, 'resolvedQuotes');

    const uniswapXRequested =
      requests.filter(
        (request) => request.routingType === RoutingType.DUTCH_LIMIT || request.routingType === RoutingType.DUTCH_V2
      ).length > 0;
    const resolvedValidQuotes = resolvedQuotes.filter((q) => q !== null) as Quote[];
    const bestQuote = await getBestQuote(resolvedValidQuotes, uniswapXRequested);
    if (!bestQuote) {
      throw new NoQuotesAvailable();
    }

    await this.emitQuoteResponseMetrics(tokenFetcher, quoteInfo, bestQuote, resolvedValidQuotes, uniswapXRequested);

    metrics.putMetric(
      `Latency-QuoteFull-ChainId${requestBody.tokenInChainId}`,
      Date.now() - startTime,
      Unit.Milliseconds
    );

    return {
      statusCode: 200,
      body: Object.assign(
        quoteToResponse(bestQuote),
        // additional info to return alongside the main quote
        {
          requestId: request.requestId,
          // note the best quote is duplicated, but this allows callers
          // to easily map their original request configs to quotes by index
          allQuotes: resolvedQuotes.map((q) => (q ? quoteToResponse(q) : null)),
        }
      ),
    };
  }

  public getQuoteRequestSource(event: APIGatewayProxyEventHeaders): RequestSource {
    const requestSource = event?.['x-request-source']?.toLowerCase();
    if (requestSource === undefined) {
      return RequestSource.UNKNOWN;
    }
    if (Object.values<string>(RequestSource).includes(requestSource)) {
      return requestSource as RequestSource;
    }
    log.info(`Unknown "x-request-source" header: ${requestSource}`);
    return RequestSource.UNKNOWN;
  }

  private async isDutchEligible(requestBody: QuoteRequestBodyJSON, tokenFetcher: TokenFetcher): Promise<boolean> {
    const [tokenIn, tokenOut] = await Promise.all([
      tokenFetcher.getTokenBySymbolOrAddress(requestBody.tokenInChainId, requestBody.tokenIn),
      tokenFetcher.getTokenBySymbolOrAddress(requestBody.tokenOutChainId, requestBody.tokenOut),
    ]);

    const tokenInNotValid = !tokenIn && requestBody.tokenIn !== NATIVE_ADDRESS;
    const tokenOutNotValid = !tokenOut && requestBody.tokenOut !== NATIVE_ADDRESS;
    if (tokenInNotValid || tokenOutNotValid) {
      log.info(
        {
          ...(tokenInNotValid && { tokenIn: requestBody.tokenIn }),
          ...(tokenOutNotValid && { tokenOut: requestBody.tokenOut }),
        },
        'Token/tokens not on token list, filtering out all Dutch Limit requests...'
      );
      return false;
    }

    if (DISABLE_DUTCH_LIMIT_REQUESTS && !requestBody.useUniswapX) {
      log.info('Dutch Limit requests disabled, filtering out all Dutch Limit requests...');
      return false;
    }

    return true;
  }

  private async emitQuoteRequestedMetrics(
    tokenFetcher: TokenFetcher,
    info: QuoteRequestInfo,
    requests: QuoteRequest[],
    startTime: number
  ): Promise<void> {
    const { tokenInChainId: chainId, tokenIn, tokenOut } = info;
    const tokenInAbbr = await this.getTokenSymbolOrAbbr(tokenFetcher, chainId, tokenIn);
    const tokenOutAbbr = await this.getTokenSymbolOrAbbr(tokenFetcher, chainId, tokenOut);
    const tokenPairSymbol = `${tokenInAbbr}/${tokenOutAbbr}`;
    const tokenPairSymbolChain = `${tokenInAbbr}/${tokenOutAbbr}/${chainId}`;

    // This log is used to generate the quotes by token dashboard.
    log.info({ tokenIn, tokenOut, chainId, tokenPairSymbol, tokenPairSymbolChain }, 'tokens and chains requests');

    // This log is used for ingesting into redshift for analytics purposes.
    log.info({
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
        createdAt: timestampInMstoSeconds(startTime),
        createdAtMs: startTime.toString(),
        // only log swapper if it's a dutch limit request
        ...(info.swapper && { swapper: info.swapper }),
      },
    });

    metrics.putMetric(`QuoteRequestedChainId${chainId.toString()}`, 1, Unit.Count);
  }

  private async getTokenSymbolOrAbbr(tokenFetcher: TokenFetcher, chainId: number, address: string): Promise<string> {
    let symbol = address.slice(0, 6);
    try {
      symbol = (await tokenFetcher.getTokenBySymbolOrAddress(chainId, symbol))?.symbol ?? symbol;
    } catch {
      /* empty */
    }
    return symbol;
  }

  private async emitQuoteResponseMetrics(
    tokenFetcher: TokenFetcher,
    info: QuoteRequestInfo,
    bestQuote: Quote,
    _allQuotes: Quote[],
    _uniswapXRequested: boolean
  ) {
    const { tokenInChainId: chainId, tokenIn, tokenOut, type } = info;

    const tokenInAbbr = await this.getTokenSymbolOrAbbr(tokenFetcher, chainId, tokenIn);
    const tokenOutAbbr = await this.getTokenSymbolOrAbbr(tokenFetcher, chainId, tokenOut);
    const tokenPairSymbol = `${tokenInAbbr}/${tokenOutAbbr}`;
    const tokenPairSymbolChain = `${tokenInAbbr}/${tokenOutAbbr}/${chainId}`;

    let bestQuoteType: QuoteType;
    if (bestQuote.routingType == RoutingType.DUTCH_LIMIT) {
      if (bestQuote.quoteType == DutchQuoteType.RFQ) {
        bestQuoteType = QuoteType.RFQ;
      } else {
        bestQuoteType = QuoteType.SYNTHETIC;
      }
    } else {
      bestQuoteType = QuoteType.CLASSIC;
    }

    const tokenPairSymbolBestQuote = `${tokenInAbbr}/${tokenOutAbbr}/${bestQuoteType.toString()}`;
    const tokenPairSymbolChainBestQuote = `${tokenInAbbr}/${tokenOutAbbr}/${chainId}/${bestQuoteType.toString()}`;

    // This log is used to generate the requests/responses by token dashboard.
    log.info(
      {
        tokenIn,
        tokenOut,
        tokenPairSymbolBestQuote,
        tokenPairSymbolChainBestQuote,
        routingType: bestQuote.routingType,
        tokenPairSymbol,
        tokenPairSymbolChain,
      },
      'tokens and chains response'
    );

    // UniswapX QuoteResponse metrics
    if (_uniswapXRequested) {
      await emitUniswapXPairMetricIfTracking(
        tokenIn,
        tokenOut,
        type == TradeType.EXACT_INPUT ? bestQuote.amountIn : bestQuote.amountOut,
        bestQuoteType,
        type
      );
      metrics.putMetric(`UniswapXQuoteResponseRoutingType-${bestQuote.routingType}`, 1, Unit.Count);
      metrics.putMetric(`UniswapXQuoteResponseQuoteType-${bestQuoteType}`, 1, Unit.Count);
      metrics.putMetric(
        `UniswapXQuoteResponseRoutingType-${bestQuote.routingType}ChainId${chainId.toString()}`,
        1,
        Unit.Count
      );
      metrics.putMetric(`UniswapXQuoteResponseQuoteType-${bestQuoteType}ChainId${chainId.toString()}`, 1, Unit.Count);
      metrics.putMetric(`UniswapXQuoteResponseChainId${chainId.toString()}`, 1, Unit.Count);
    }

    // Overall QuoteResponse metrics
    metrics.putMetric(`QuoteResponseRoutingType-${bestQuote.routingType}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseQuoteType-${bestQuoteType}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseRoutingType-${bestQuote.routingType}ChainId${chainId.toString()}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseQuoteType-${bestQuoteType}ChainId${chainId.toString()}`, 1, Unit.Count);
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response;
    const responseBody = JSON.parse(response.body!);
    const rawBody = JSON.parse(event.body!);

    if (statusCode != 200 && responseBody.errorCode == ErrorCode.ValidationError) {
      metrics.putMetric(`QuoteRequestValidationError`, 1);
      return;
    }

    // Try and extract the chain id from the raw json.
    let chainId = '0';
    try {
      chainId = rawBody.tokenInChainId ?? rawBody.chainId;
    } catch (err) {
      // no-op. If we can't get chainId still log the metric as chain 0
    }

    // log the response count
    metrics.putMetric(`QuoteResponseChainId${chainId.toString()}`, 1, Unit.Count);

    switch (statusCode) {
      case 200:
      case 202:
        metrics.putMetric(`QuoteResponseChainId${chainId.toString()}Status2XX`, 1, Unit.Count);
        break;
      case 400:
      case 403:
      case 404:
      case 408:
      case 409:
      case 429:
        metrics.putMetric(`QuoteResponseChainId${chainId.toString()}Status4XX`, 1, Unit.Count);
        break;
      case 500:
      case 502:
        metrics.putMetric(`QuoteResponseChainId${chainId.toString()}Status5XX`, 1, Unit.Count);
        break;
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return PostQuoteRequestBodyJoi;
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return null;
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return null;
  }
}

// fetch quotes for all quote requests using the configured quoters
export async function getQuotes(quoterByRoutingType: QuoterByRoutingType, requests: QuoteRequest[]): Promise<Quote[]> {
  const results = await Promise.allSettled(
    requests.flatMap(async (request) => {
      const quoter = quoterByRoutingType[request.routingType];
      if (!quoter) {
        return null;
      }
      const beforeQuote = Date.now();
      log.error({ request }, "Requesting quote...");
      const res = await quoter.quote(request);
      log.error({ request, res, quoter }, "Quote response...");
      metrics.putMetric(
        `Latency-Quote-${request.routingType}-ChainId${request.info.tokenInChainId}`,
        Date.now() - beforeQuote,
        Unit.Milliseconds
      );
      return res;
    })
  );

  const quotes: Quote[] = (
    results.filter(
      (result) => result.status === 'fulfilled' && result?.value !== null
    ) as PromiseFulfilledResult<Quote | null>[]
  ).map((result) => result.value as Quote);

  const errors = results.filter(
    (result) =>
      result.status === 'rejected' &&
      (parseInt(result?.reason?.response.status) >= 500 || parseInt(result?.reason?.response.status) === 429)
  ) as PromiseRejectedResult[];

  // throw QuoteFetchError if there are no available quotes and at least one 5xx error
  if (quotes.length === 0 && errors.length > 0) {
    log.error({ errors }, 'No available quotes and at least one 5xx or 429 error, throwing QuoteFetchError.');
    throw new QuoteFetchError(errors.map((error) => error.reason.message).join(', '));
  }

  return quotes;
}

// determine and return the "best" quote of the given list
export async function getBestQuote(quotes: Quote[], uniswapXRequested?: boolean): Promise<Quote | null> {
  return quotes.reduce((bestQuote: Quote | null, quote: Quote) => {
    // log all valid quotes, so that we capture auto router prices at request time
    // skip logging in only classic requested
    if (uniswapXRequested) {
      log.info({
        eventType: 'UnifiedRoutingQuoteResponse',
        body: {
          ...quote.toLog(),
        },
      });
    }
    if (!bestQuote || compareQuotes(quote, bestQuote, quote.request.info.type)) {
      return quote;
    }
    return bestQuote;
  }, null);
}

export const QuoteComparisonOverrides = {
  relayAndClassic(lhs: Quote, rhs: Quote): boolean {
    return (
      (lhs.routingType === RoutingType.CLASSIC && rhs.routingType === RoutingType.RELAY) ||
      (rhs.routingType === RoutingType.CLASSIC && lhs.routingType === RoutingType.RELAY)
    );
  },

  breakTie(lhs: Quote, rhs: Quote): boolean {
    // Prefer relay over classic if requested together
    if (QuoteComparisonOverrides.relayAndClassic(lhs, rhs)) return lhs.routingType === RoutingType.RELAY;
    // Otherwise, we default to keeping rhs in the case of a tie
    return false;
  },
};

// Compare quotes, returning true if lhs is better than rhs
// Applies any overrides before the default comparision logic using quoted amount
export const compareQuotes = (lhs: Quote, rhs: Quote, tradeType: TradeType): boolean => {
  if (getQuotedAmount(lhs, tradeType).eq(getQuotedAmount(rhs, tradeType))) {
    return QuoteComparisonOverrides.breakTie(lhs, rhs);
  }

  // Default comparison if no overrides apply
  if (tradeType === TradeType.EXACT_INPUT) {
    return getQuotedAmount(lhs, tradeType).gt(getQuotedAmount(rhs, tradeType));
  } else {
    // EXACT_OUTPUT
    return getQuotedAmount(lhs, tradeType).lt(getQuotedAmount(rhs, tradeType));
  }
};

const getQuotedAmount = (quote: Quote, tradeType: TradeType) => {
  if (tradeType === TradeType.EXACT_INPUT) {
    if (quote.routingType === RoutingType.CLASSIC) {
      return (quote as ClassicQuote).amountOutGasAndPortionAdjusted;
    } else if (quote.routingType === RoutingType.DUTCH_LIMIT) {
      return (quote as DutchQuote).amountOutGasAndPortionAdjusted;
    } else if (quote.routingType === RoutingType.DUTCH_V2) {
      return (quote as DutchV2Quote).amountOutGasAndPortionAdjusted;
    } else if (quote.routingType === RoutingType.RELAY) {
      return (quote as RelayQuote).classicQuote.amountOutGasAndPortionAdjusted;
    }
    throw new Error(`Invalid routing type: ${quote}`);
  } else {
    if (quote.routingType === RoutingType.CLASSIC) {
      return (quote as ClassicQuote).amountInGasAndPortionAdjusted;
    } else if (quote.routingType === RoutingType.DUTCH_LIMIT) {
      return (quote as DutchQuote).amountInGasAndPortionAdjusted;
    } else if (quote.routingType === RoutingType.DUTCH_V2) {
      return (quote as DutchV2Quote).amountInGasAndPortionAdjusted;
    } else if (quote.routingType === RoutingType.RELAY) {
      return (quote as RelayQuote).classicQuote.amountInGasAndPortionAdjusted;
    }
    throw new Error(`Invalid routing type: ${quote}`);
  }
};

export function quoteToResponse(quote: Quote): SingleQuoteJSON {
  return {
    routing: quote.routingType,
    quote: quote.toJSON(),
  };
}

export function removeDutchRequests(requests: QuoteRequest[]): QuoteRequest[] {
  return requests.filter((request) => request.routingType !== RoutingType.DUTCH_LIMIT);
}
