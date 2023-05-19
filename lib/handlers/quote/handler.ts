import { TradeType } from '@uniswap/sdk-core';
import Joi from 'joi';

import { Unit } from 'aws-embedded-metrics';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { RoutingType } from '../../constants';
import {
  ClassicQuote,
  parseQuoteContexts,
  parseQuoteRequests,
  prepareQuoteRequests,
  Quote,
  QuoteContextManager,
  QuoteJSON,
  QuoteRequest,
  QuoteRequestBodyJSON,
  QuoteRequestInfo,
} from '../../entities';
import { ValidationError } from '../../util/errors';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import { currentTimestampInSeconds } from '../../util/time';
import { APIGLambdaHandler } from '../base';
import { APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/api-handler';
import { ContainerInjected, QuoterByRoutingType } from './injector';
import { PostQuoteRequestBodyJoi } from './schema';

// number of bps per whole
const BPS = 10000;
// amount of price preference for dutch limit orders
const DUTCH_LIMIT_PREFERENCE_BUFFER_BPS = 500;

export interface QuoteResponseJSON {
  routing: string;
  quote: QuoteJSON;
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
      containerInjected: { quoters },
      requestBody: { tokenInChainId, tokenOutChainId },
    } = params;

    if (tokenInChainId != tokenOutChainId) {
      throw new ValidationError(`Cannot request quotes for tokens on different chains`);
    }

    const request = {
      ...requestBody,
      requestId: uuidv4(),
    };

    log.info({ requestBody: request }, 'request');
    const { quoteRequests, quoteInfo } = parseQuoteRequests(await prepareQuoteRequests(request));
    const contextHandler = new QuoteContextManager(parseQuoteContexts(quoteRequests));
    const requests = contextHandler.getRequests();
    log.info({ requests }, 'requests');
    const quotes = await getQuotes(quoters, requests);
    log.info({ rawQuotes: quotes }, 'quotes');

    const resolvedQuotes = await contextHandler.resolveQuotes(quotes);
    log.info({ resolvedQuotes: quotes }, 'resolvedQuotes');

    this.emitQuoteRequestedMetrics(quoteInfo, quoteRequests);

    const uniswapXRequested = requests.filter((request) => request.routingType === RoutingType.DUTCH_LIMIT).length > 0;
    const bestQuote = await getBestQuote(resolvedQuotes, uniswapXRequested);
    if (!bestQuote) {
      return {
        statusCode: 404,
        detail: 'No quotes available',
        errorCode: 'QUOTE_ERROR',
      };
    }

    return {
      statusCode: 200,
      body: quoteToResponse(bestQuote),
    };
  }

  private emitQuoteRequestedMetrics(info: QuoteRequestInfo, requests: QuoteRequest[]) {
    const { tokenInChainId: chainId, tokenIn, tokenOut } = info;
    const tokenInAbbr = tokenIn.slice(0, 6);
    const tokenOutAbbr = tokenOut.slice(0, 6);
    const tokenPairSymbol = `${tokenInAbbr}/${tokenOutAbbr}`;
    const tokenPairSymbolChain = `${tokenInAbbr}/${tokenOutAbbr}/${chainId}`;

    // This log is used to generate the quotes by token dashboard.
    log.info({ tokenIn, tokenOut, chainId, tokenPairSymbol, tokenPairSymbolChain }, 'tokens and chains');

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
        // only log offerer if it's a dutch limit request
        ...(info.offerer && { offerer: info.offerer }),
      },
    });

    metrics.putMetric(`QuoteRequestedChainId${chainId.toString()}`, 1, Unit.Count);
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response;

    // Try and extract the chain id from the raw json.
    let chainId = '0';
    try {
      const rawBody = JSON.parse(event.body!);
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
    } else if (quote.routingType === RoutingType.DUTCH_LIMIT) {
      return (quote as Quote).amountOut.mul(BPS + DUTCH_LIMIT_PREFERENCE_BUFFER_BPS).div(BPS);
    }
    return (quote as Quote).amountOut;
  } else {
    if (quote.routingType === RoutingType.CLASSIC) {
      return (quote as ClassicQuote).amountInGasAdjusted;
    } else if (quote.routingType === RoutingType.DUTCH_LIMIT) {
      return (quote as Quote).amountIn.mul(BPS - DUTCH_LIMIT_PREFERENCE_BUFFER_BPS).div(BPS);
    }
    return (quote as Quote).amountIn;
  }
};

export function quoteToResponse(quote: Quote): QuoteResponseJSON {
  return {
    routing: quote.routingType,
    quote: quote.toJSON(),
  };
}
