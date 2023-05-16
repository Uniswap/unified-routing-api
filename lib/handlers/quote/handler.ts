import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import Joi from 'joi';
import { PermitSingleData } from '@uniswap/permit2-sdk'
import { v4 as uuidv4 } from 'uuid';
import { RoutingType } from '../../constants';
import {
  ClassicQuote,
  parseQuoteContexts,
  parseQuoteRequests,
  Quote,
  QuoteContextManager,
  QuoteJSON,
  QuoteRequest,
  QuoteRequestBodyJSON,
} from '../../entities';
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
  permit: PermitSingleData;
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
      containerInjected: { quoters },
    } = params;

    const request = {
      ...requestBody,
      requestId: uuidv4(),
    };

    log.info({ requestBody: request }, 'request');
    const contextHandler = new QuoteContextManager(log, parseQuoteContexts(log, parseQuoteRequests(request, log)));
    const requests = contextHandler.getRequests();
    log.info({ requests }, 'requests');
    const quotes = await getQuotes(quoters, requests);
    log.info({ rawQuotes: quotes }, 'quotes');

    const resolvedQuotes = await contextHandler.resolveQuotes(quotes);
    log.info({ resolvedQuotes: quotes }, 'resolvedQuotes');

    const uniswapXRequested = requests.filter((request) => request.routingType === RoutingType.DUTCH_LIMIT).length > 0;
    const bestQuote = await getBestQuote(resolvedQuotes, uniswapXRequested, log);
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
