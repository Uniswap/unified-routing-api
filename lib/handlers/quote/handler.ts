import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import Joi from 'joi';

import { QuoteRequest, QuoteRequestDataJSON, QuoteResponse, QuoteResponseJSON } from '../../entities';
import { APIGLambdaHandler } from '../base';
import { APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/api-handler';
import { ContainerInjected, QuoterByRoutingType } from './injector';
import { PostQuoteRequestBodyJoi } from './schema';

export class QuoteHandler extends APIGLambdaHandler<
  ContainerInjected,
  ApiRInj,
  QuoteRequestDataJSON,
  void,
  QuoteResponseJSON
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, ApiRInj, QuoteRequestDataJSON, void>
  ): Promise<ErrorResponse | Response<QuoteResponseJSON>> {
    const {
      requestInjected: { log },
      requestBody,
      containerInjected: { quoters, quoteFilter },
    } = params;

    log.info(requestBody, 'requestBody');
    const request = QuoteRequest.fromRequestBody(requestBody);

    const quotes = await getQuotes(quoters, request);
    const filtered = await quoteFilter.filter(request, quotes);

    const bestQuote = await getBestQuote(request, filtered, log);
    if (!bestQuote) {
      return {
        statusCode: 404,
        detail: 'No quotes available',
        errorCode: 'QUOTE_ERROR',
      };
    }

    return {
      statusCode: 200,
      body: bestQuote.toOrder(),
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
  quoteRequest: QuoteRequest
): Promise<QuoteResponse[]> {
  return await Promise.all(
    quoteRequest.configs.flatMap((config) => {
      const quoters = quotersByRoutingType[config.routingType];
      if (!quoters) {
        return [];
      }
      return quoters.map((q) => q.quote(quoteRequest, config));
    })
  );
}

// determine and return the "best" quote of the given list
export async function getBestQuote(
  quoteRequest: QuoteRequest,
  quotes: QuoteResponse[],
  log?: Logger
): Promise<QuoteResponse | null> {
  return quotes.reduce((bestQuote: QuoteResponse | null, quote: QuoteResponse) => {
    log?.info({ bestQuote: bestQuote }, 'current bestQuote');
    if (!bestQuote || compareQuotes(quote, bestQuote, quoteRequest.type)) {
      return quote;
    }
    return bestQuote;
  }, null);
}

// compares two quotes of any type and returns the best one based on tradeType
export function compareQuotes(lhs: QuoteResponse, rhs: QuoteResponse, tradeType: TradeType): boolean {
  if (tradeType === TradeType.EXACT_INPUT) {
    return getQuotedAmount(lhs, tradeType).gt(getQuotedAmount(rhs, tradeType));
  } else {
    // EXACT_OUTPUT
    return getQuotedAmount(lhs, tradeType).lt(getQuotedAmount(rhs, tradeType));
  }
}

const getQuotedAmount = (quote: QuoteResponse, tradeType: TradeType) => {
  return tradeType === TradeType.EXACT_INPUT ? quote.quote.amountOut : quote.quote.amountIn;
};
