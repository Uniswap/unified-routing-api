import { TradeType } from '@uniswap/sdk-core';
import Joi from 'joi';

import { QuoteRequest, QuoteResponse } from '../../entities';
import { QuoteRequestDataJSON } from '../../entities/QuoteRequest';
import { QuoteResponseJSON } from '../../entities/QuoteResponse';
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
      containerInjected: { quoters },
    } = params;

    log.info(requestBody, 'requestBody');

    const request = QuoteRequest.fromRequestBody({
      tokenInChainId: 1,
      tokenOutChainId: 1,
      requestId: 'requestId',
      tokenIn: '0x6b175474e89094c44da98b954eedeac495271d0f',
      tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      amount: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      tradeType: 'EXACT_INPUT',
      configs: [
        {
          routingType: 'DUTCH_LIMIT',
          offerer: '0x6b175474e89094c44da98b954eedeac495271d0f',
          exclusivePeriodSecs: 12,
          auctionPeriodSecs: 60,
        },
      ],
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
  quotersByRoutingType: QuoterByRoutingType,
  quoteRequest: QuoteRequest,
  tradeType: TradeType
): Promise<QuoteResponse | null> {
  const responses: QuoteResponse[] = await Promise.all(
    quoteRequest.configs.flatMap((config) => {
      const quoters = quotersByRoutingType[config.routingType];
      if (!quoters) {
        return [];
      }
      return quoters.map((q) => q.quote(quoteRequest, config));
    })
  );

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
  return tradeType === TradeType.EXACT_INPUT ? quote.quote.amountOut : quote.quote.amountIn;
};
