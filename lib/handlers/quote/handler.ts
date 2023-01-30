import { TradeType } from '@uniswap/sdk-core';
import Joi from 'joi';

import { QuoteRequest, QuoteResponse } from '../../entities';
import { QuoteRequestDataJSON } from '../../entities/QuoteRequest';
import { QuoteResponseJSON } from '../../entities/QuoteResponse';
import { RoutingType } from '../../entities/routing';
import { Quoter } from '../../quoters';
import { APIGLambdaHandler } from '../base';
import { APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/api-handler';
import { ContainerInjected } from './injector';
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
      containerInjected: { quoters },
    } = params;

    log.info(requestBody, 'requestBody');

    const request = QuoteRequest.fromRequestBody(requestBody);

    log.info({
      eventType: 'QuoteRequest',
      body: {
        requestId: request.requestId,
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amount: request.amount.toString(),
        tradeType: request.tradeType,
      },
    });

    const bestQuote = await getBestQuote(quoters, request, request.tradeType);
    if (!bestQuote) {
      return {
        statusCode: 404,
        detail: 'No quotes available',
        errorCode: 'QUOTE_ERROR',
      };
    }

    return {
      statusCode: 200,
      body: bestQuote.toJSON(),
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

// fetch quotes from all quoters and return the best one
export async function getBestQuote(
  quoters: Quoter[],
  quoteRequest: QuoteRequest,
  tradeType: TradeType
): Promise<QuoteResponse | null> {
  const responses: QuoteResponse[] = (await Promise.all(quoters.map((q) => q.quote(quoteRequest)))).flat();

  return responses.reduce((bestQuote: QuoteResponse | null, quote: QuoteResponse) => {
    if (!bestQuote || compareQuotes(quote, bestQuote, tradeType)) {
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
  if (tradeType === TradeType.EXACT_INPUT) {
    if (quote.routing === RoutingType.DUTCH_LIMIT) {
      return quote.quote.amountOut;
    } else {
      throw 'Not implemented -- add RoutingType.CLASSIC';
    }
  } else {
    // EXACT_OUTPUT
    if (quote.routing === RoutingType.DUTCH_LIMIT) {
      return quote.quote.amountIn;
    } else {
      throw 'Not implemented -- add RoutingType.CLASSIC';
    }
  }
};
