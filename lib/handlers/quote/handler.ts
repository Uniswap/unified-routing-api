import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import Joi from 'joi';

import { THOUSAND_FIXED_POINT } from '../../constants';
import { ClassicQuote, parseQuoteRequests, Quote, QuoteJSON, QuoteRequest, QuoteRequestBodyJSON } from '../../entities';
import { DutchLimitQuote } from '../../entities/quote/DutchLimitQuote';
import { RoutingType } from '../../entities/request/index';
import { APIGLambdaHandler } from '../base';
import { APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/api-handler';
import { ContainerInjected, QuoterByRoutingType } from './injector';
import { PostQuoteRequestBodyJoi } from './schema';

export interface QuoteResponseJSON {
  routing: string;
  quote: QuoteJSON;
}

export type QuoteByRoutingType = { [key in RoutingType]?: Quote };

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
      containerInjected: { quoters, quoteFilter },
    } = params;

    const requests = parseQuoteRequests(requestBody);
    console.log({ reqs: requests }, 'all requests');
    const quoteByRoutingType: QuoteByRoutingType = {};
    const quotes = await getQuotes(quoters, requests);
    const filtered = await quoteFilter.filter(requests, quotes);
    console.log({ filtered: filtered }, 'filtered quotes');
    filtered.forEach((q) => (quoteByRoutingType[q.request.routingType] = q));

    const bestQuote = await getBestQuote(filtered);
    if (!bestQuote) {
      return {
        statusCode: 404,
        detail: 'No quotes available',
        errorCode: 'QUOTE_ERROR',
      };
    }

    log.info({ bestQuote: bestQuote }, 'bestQuote');
    if (bestQuote.routingType === RoutingType.CLASSIC) {
      console.log('CLASSIC!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    }
    return {
      statusCode: 200,
      body: quoteToResponse(bestQuote, quoteByRoutingType, log),
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
  return tradeType === TradeType.EXACT_INPUT ? quote.amountOut : quote.amountIn;
};

export function quoteToResponse(quote: Quote, quoteByRoutingType: QuoteByRoutingType, log?: Logger): QuoteResponseJSON {
  log?.info({ quote: quote, qBRT: quoteByRoutingType }, 'quoteToResponse');
  if (quote.routingType === RoutingType.CLASSIC && quoteByRoutingType[RoutingType.DUTCH_LIMIT]) {
    log?.info({ dlQuote: quoteByRoutingType[RoutingType.DUTCH_LIMIT] }, 'dlQuote');
    return classicQuoteToUniswapXResponse(quote as ClassicQuote, quoteByRoutingType[RoutingType.DUTCH_LIMIT], log);
  }
  return {
    routing: quote.routingType,
    quote: quote.toJSON(),
  };
}

export function classicQuoteToUniswapXResponse(quote: ClassicQuote, xQuote: Quote, log?: Logger) {
  log?.info({ quote: quote }, 'classicQuoteToUniswapXResponse');
  if (xQuote.routingType === RoutingType.DUTCH_LIMIT) {
    const dlOrderJSON = (xQuote as DutchLimitQuote).toJSON() as DutchLimitOrderInfoJSON;
    const outStartAmount = quote.amountOut.mul(102).div(100);
    const outEndAmount = outStartAmount
      .mul(BigNumber.from(THOUSAND_FIXED_POINT).sub(BigNumber.from(xQuote.request.info.slippageTolerance)))
      .div(THOUSAND_FIXED_POINT);
    console.log('outEndAmount', outEndAmount.toString());
    return {
      routing: RoutingType.DUTCH_LIMIT,
      quote: {
        ...dlOrderJSON,
        outputs: [
          {
            ...dlOrderJSON.outputs[0],
            startAmount: outStartAmount.toString(),
            endAmount: outEndAmount.toString(),
          },
        ],
      },
    };
  } else {
    throw new Error(`Unsupported routing type ${xQuote.routingType}`);
  }
}
