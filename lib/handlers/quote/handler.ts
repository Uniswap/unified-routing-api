import { TradeType } from '@uniswap/sdk-core';
import Joi from 'joi';

import {
  ClassicQuote,
  parseQuoteRequests,
  Quote,
  QuoteJSON,
  QuoteRequest,
  QuoteRequestBodyJSON,
  RoutingType,
} from '../../entities';
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

    log.info({ requestBody: requestBody }, 'requestBody');
    const requests = parseQuoteRequests(requestBody, log);
    const requestsTransformed = requestTransformer.transform(requests);
    const quotes = await getQuotes(quoters, requestsTransformed);
    const quotesTransformed = await quoteTransformer.transform(requests, quotes);

    log.info({ quotesTransformed: quotesTransformed }, 'quotesTransformed');

    const bestQuote = await getBestQuote(quotesTransformed);
    if (!bestQuote) {
      return {
        statusCode: 404,
        detail: 'No quotes available',
        errorCode: 'QUOTE_ERROR',
      };
    }

    log.info({ bestQuote: bestQuote }, 'bestQuote to response');
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
export async function getQuotes(quotersByRoutingType: QuoterByRoutingType, requests: QuoteRequest[]): Promise<Quote[]> {
  const quotes = await Promise.all(
    requests.flatMap((request) => {
      const quoters = quotersByRoutingType[request.routingType];
      if (!quoters) {
        return [];
      }
      return quoters.map((q) => q.quote(request));
    })
  );
  return quotes.filter((q): q is Quote => !!q);
}

// determine and return the "best" quote of the given list
export async function getBestQuote(quotes: Quote[]): Promise<Quote | null> {
  return quotes.reduce((bestQuote: Quote | null, quote: Quote) => {
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
