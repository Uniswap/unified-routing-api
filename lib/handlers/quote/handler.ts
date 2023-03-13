import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import Joi from 'joi';

import { v4 as uuidv4 } from 'uuid';
import {
  ClassicQuote,
  parseQuoteRequests,
  Quote,
  QuoteJSON,
  QuoteRequest,
  QuoteRequestBodyJSON,
  RoutingType,
} from '../../entities';
import { DutchLimitQuote } from '../../entities/quote/DutchLimitQuote';
import { QuotesByRoutingType } from '../../entities/quote/index';
import { APIGLambdaHandler } from '../base';
import { APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/api-handler';
import { ContainerInjected, QuoterByRoutingType } from './injector';
import { PostQuoteRequestBodyJoi } from './schema';

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
      requestInjected: { log },
      requestBody,
      containerInjected: { quoters, quoteTransformer, requestTransformer },
    } = params;

    const request = {
      ...requestBody,
      requestId: uuidv4(),
    };

    log.info({ requestBody: request }, 'request');
    const requests = parseQuoteRequests(request, log);
    const requestsTransformed = requestTransformer.transform(requests);
    const quotesByRequestType: QuotesByRoutingType = {};
    const quotes = await getQuotes(quoters, requestsTransformed, quotesByRequestType);
    const quotesTransformed = await quoteTransformer.transform(requests, quotes);

    // hack: set endAmount of dutch limit quotes to that of auto router quote gas adjusted
    if (
      requests.length > 1 &&
      quotesByRequestType[RoutingType.CLASSIC] &&
      quotesByRequestType[RoutingType.CLASSIC].length > 0
    ) {
      // UniswapX requested
      const classicQuote = quotesByRequestType[RoutingType.CLASSIC][0] as ClassicQuote; // assuming only one classic quote
      quotesTransformed.forEach((quote) => {
        if (quote.routingType === RoutingType.DUTCH_LIMIT) {
          (quote as DutchLimitQuote).endAmountIn =
            quote.request.info.type === TradeType.EXACT_INPUT ? quote.amountIn : classicQuote.amountInGasAdjusted;
          (quote as DutchLimitQuote).endAmountOut =
            quote.request.info.type === TradeType.EXACT_INPUT ? classicQuote.amountOutGasAdjusted : quote.amountOut;
        }
      });
    }

    log.info({ quotesTransformed: quotesTransformed }, 'quotesTransformed');

    const bestQuote = await getBestQuote(quotesTransformed, requests.length > 1, log);
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

  // TODO: add Joi validations
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
export async function getQuotes(
  quotersByRoutingType: QuoterByRoutingType,
  requests: QuoteRequest[],
  quotesByRoutingType: QuotesByRoutingType
): Promise<Quote[]> {
  const quotes = await Promise.all(
    requests.flatMap((request) => {
      const quoters = quotersByRoutingType[request.routingType];
      if (!quoters) {
        return [];
      }
      return quoters.map((q) => q.quote(request));
    })
  );
  const filtered = quotes.filter((q): q is Quote => !!q);
  filtered.forEach((quote) => {
    if (!quotesByRoutingType[quote.routingType]) {
      quotesByRoutingType[quote.routingType] = [];
    }
    quotesByRoutingType[quote.routingType]?.push(quote);
  });
  return filtered;
}

// determine and return the "best" quote of the given list
export async function getBestQuote(quotes: Quote[], uniswapXRequested?: boolean, log?: Logger): Promise<Quote | null> {
  return quotes.reduce((bestQuote: Quote | null, quote: Quote) => {
    // log all valid quotes, so that we capture auto router prices at request time
    // skip logging in only classic requested
    if (uniswapXRequested) {
      log?.info({
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

export function quoteToResponse(quote: Quote): QuoteResponseJSON {
  return {
    routing: quote.routingType,
    quote: quote.toJSON(),
  };
}
