import Joi from 'joi';

import { TradeType } from '@uniswap/sdk-core';
import { Unit } from 'aws-embedded-metrics';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ethers } from 'ethers';

import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { RoutingType } from '../../constants';
import {
  ClassicQuote,
  DutchQuoteType,
  parseQuoteContexts,
  parseQuoteRequests,
  Quote,
  QuoteContextManager,
  QuoteJSON,
  QuoteRequest,
  QuoteRequestBodyJSON,
  QuoteRequestInfo,
} from '../../entities';
import { ErrorCode, NoQuotesAvailable, ValidationError } from '../../util/errors';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import { currentTimestampInSeconds } from '../../util/time';
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
      containerInjected: { quoters, tokenFetcher, permit2Fetcher, rpcUrlMap },
    } = params;

    if (requestBody.tokenInChainId != requestBody.tokenOutChainId) {
      throw new ValidationError(`Cannot request quotes for tokens on different chains`);
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrlMap.get(requestBody.tokenInChainId));

    const request = {
      ...requestBody,
      requestId: uuidv4(),
    };

    const tokenInAddress = await tokenFetcher.resolveTokenAddress(request.tokenInChainId, request.tokenIn);
    const tokenOutAddress = await tokenFetcher.resolveTokenAddress(request.tokenOutChainId, request.tokenOut);
    const requestWithTokenAddresses = {
      ...request,
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
    };

    log.info({ requestBody: request }, 'request');
    const parsedRequests = parseQuoteRequests(requestWithTokenAddresses);
    const { quoteInfo } = parsedRequests;
    let { quoteRequests } = parsedRequests;

    if (DISABLE_DUTCH_LIMIT_REQUESTS && !requestBody.useUniswapX) {
      log.info('Dutch Limit requests disabled, filtering out all Dutch Limit requests...');
      quoteRequests = removeDutchRequests(quoteRequests);
    }

    const contextHandler = new QuoteContextManager(parseQuoteContexts(quoteRequests, permit2Fetcher, provider));
    const requests = contextHandler.getRequests();
    log.info({ requests }, 'requests');
    const quotes = await getQuotes(quoters, requests);
    log.info({ rawQuotes: quotes }, 'quotes');
    const resolvedQuotes = await contextHandler.resolveQuotes(quotes);
    log.info({ resolvedQuotes }, 'resolvedQuotes');

    this.emitQuoteRequestedMetrics(quoteInfo, quoteRequests);

    const uniswapXRequested = requests.filter((request) => request.routingType === RoutingType.DUTCH_LIMIT).length > 0;
    const resolvedValidQuotes = resolvedQuotes.filter((q) => q !== null) as Quote[];
    const bestQuote = await getBestQuote(resolvedValidQuotes, uniswapXRequested);
    if (!bestQuote) {
      throw new NoQuotesAvailable();
    }

    this.emitQuoteResponseMetrics(quoteInfo, bestQuote, resolvedValidQuotes, uniswapXRequested);

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

  private emitQuoteRequestedMetrics(info: QuoteRequestInfo, requests: QuoteRequest[]) {
    const { tokenInChainId: chainId, tokenIn, tokenOut } = info;
    const tokenInAbbr = tokenIn.slice(0, 6);
    const tokenOutAbbr = tokenOut.slice(0, 6);
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
        createdAt: currentTimestampInSeconds(),
        // only log swapper if it's a dutch limit request
        ...(info.swapper && { swapper: info.swapper }),
      },
    });

    metrics.putMetric(`QuoteRequestedChainId${chainId.toString()}`, 1, Unit.Count);
  }

  private emitQuoteResponseMetrics(
    info: QuoteRequestInfo,
    bestQuote: Quote,
    _allQuotes: Quote[],
    _uniswapXRequested: boolean
  ) {
    const { tokenInChainId: chainId, tokenIn, tokenOut } = info;
    const tokenInAbbr = tokenIn.slice(0, 6);
    const tokenOutAbbr = tokenOut.slice(0, 6);
    const tokenPairSymbol = `${tokenInAbbr}/${tokenOutAbbr}`;
    const tokenPairSymbolChain = `${tokenInAbbr}/${tokenOutAbbr}/${chainId}`;

    enum QuoteType {
      CLASSIC = 'CLASSIC',
      SYNTHETIC = 'SYNTHETIC',
      RFQ = 'RFQ',
    }

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
      metrics.putMetric(`UniswapXRequestedQuoteResponseQuoteType-${bestQuoteType}`, 1, Unit.Count);
      metrics.putMetric(`UniswapXQuoteResponseRoutingType-${bestQuote.routingType}`, 1, Unit.Count);
      metrics.putMetric(`UniswapXQuoteResponseQuoteType-${bestQuoteType}ChainId${chainId.toString()}`, 1, Unit.Count);
      metrics.putMetric(
        `UniswapXQuoteResponseRoutingType-${bestQuote.routingType}ChainId${chainId.toString()}`,
        1,
        Unit.Count
      );
      metrics.putMetric(`UniswapXQuoteResponseChainId${chainId.toString()}`, 1, Unit.Count);
    }

    // Overall QuoteResponse metrics
    metrics.putMetric(`QuoteResponseRoutingType-${bestQuote.routingType}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseQuoteType-${bestQuoteType}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseRoutingType-${bestQuote.routingType}ChainId${chainId.toString()}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseQuoteType-${bestQuoteType}ChainId${chainId.toString()}`, 1, Unit.Count);
    metrics.putMetric(`QuoteResponseChainId${chainId.toString()}`, 1, Unit.Count);
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response;
    const responseBody = JSON.parse(response.body!);
    const rawBody = JSON.parse(event.body!);

    log.info({ rawBody }, 'rawBody');
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

    const metricName = `QuoteResponseChainId${chainId.toString()}Status${((statusCode % 100) * 100)
      .toString()
      .replace(/0/g, 'X')}`;
    metrics.putMetric(metricName, 1, Unit.Count);
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
  const quotes = await Promise.all(
    requests.flatMap((request) => {
      const quoter = quoterByRoutingType[request.routingType];
      if (!quoter) {
        return [];
      }
      return quoter.quote(request);
    })
  );
  return quotes.filter((q): q is Quote => !!q);
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

// compares two quotes of any type and returns the best one based on tradeType
export function compareQuotes(lhs: Quote, rhs: Quote, tradeType: TradeType): boolean {
  if (tradeType === TradeType.EXACT_INPUT) {
    return getQuotedAmount(lhs, tradeType).gt(getQuotedAmount(rhs, tradeType));
  } else {
    // EXACT_OUTPUT
    return getQuotedAmount(lhs, tradeType).lt(getQuotedAmount(rhs, tradeType));
  }
}

const getQuotedAmount = (quote: Quote, tradeType: TradeType) => {
  if (tradeType === TradeType.EXACT_INPUT) {
    if (quote.routingType === RoutingType.CLASSIC) {
      return (quote as ClassicQuote).amountOutGasAdjusted;
    }
    return (quote as Quote).amountOut;
  } else {
    if (quote.routingType === RoutingType.CLASSIC) {
      return (quote as ClassicQuote).amountInGasAdjusted;
    }
    return (quote as Quote).amountIn;
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
