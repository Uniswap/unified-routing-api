import {
  DutchLimitOrder,
  DutchLimitOrderBuilder,
  DutchLimitOrderInfo,
  DutchLimitOrderInfoJSON,
  DutchLimitOrderTrade,
} from '@uniswap/gouda-sdk';
import { Token, TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import Joi from 'joi';

import { PermitSingleData, PermitTransferFromData } from '@uniswap/permit2-sdk';
import { BigNumber } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { RoutingType } from '../../constants';
import { ClassicQuote, parseQuoteRequests, Quote, QuoteJSON, QuoteRequest, QuoteRequestBodyJSON } from '../../entities';
import { QuotesByRoutingType } from '../../entities/quote/index';
import { getDecimals } from '../../util/tokens';
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
  permit?: PermitSingleData | PermitTransferFromData;
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

    log.info({ quotesTransformed: quotesTransformed }, 'quotesTransformed');

    const uniswapXRequested = requests.filter((request) => request.routingType === RoutingType.DUTCH_LIMIT).length > 0;
    const bestQuote = await getBestQuote(quotesTransformed, uniswapXRequested, log);
    if (!bestQuote) {
      return {
        statusCode: 404,
        detail: 'No quotes available',
        errorCode: 'QUOTE_ERROR',
      };
    }

    // check if permit needed
    const order = await getOrder(bestQuote);
    if (!order) {
      return {
        statusCode: 404,
        detail: 'Failed to create permit',
        errorCode: 'PERMIT_ERROR',
      };
    }

    return {
      statusCode: 200,
      body: quoteToResponse(bestQuote, order),
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

export function quoteToResponse(quote: Quote, order: DutchLimitOrder): QuoteResponseJSON {
  return {
    routing: quote.routingType,
    quote: quote.toJSON(),
    permit: order.permitData(),
  };
}

export async function getOrder(quote: Quote): Promise<DutchLimitOrder> {
  const tokenInDecimals = await getDecimals(quote.request.info.tokenInChainId, quote.request.info.tokenIn);
  const tokenOutDecimals = await getDecimals(quote.request.info.tokenOutChainId, quote.request.info.tokenOut);

  const trade = new DutchLimitOrderTrade({
    currencyIn: new Token(quote.request.info.tokenInChainId, quote.request.info.tokenIn, tokenInDecimals),
    currenciesOut: [new Token(quote.request.info.tokenOutChainId, quote.request.info.tokenOut, tokenOutDecimals)],
    tradeType: quote.request.info.type,
    orderInfo: quoteToDutchLimitOrderInfo(quote.toJSON() as DutchLimitOrderInfoJSON),
  });

  // add the current time etc if needed
  return DutchLimitOrderBuilder.fromOrder(trade.order).build();
}

export function quoteToDutchLimitOrderInfo(orderInfoJSON: DutchLimitOrderInfoJSON): DutchLimitOrderInfo {
  const { nonce, input, outputs } = orderInfoJSON;
  return {
    ...orderInfoJSON,
    exclusivityOverrideBps: BigNumber.from(orderInfoJSON.exclusivityOverrideBps),
    nonce: BigNumber.from(nonce),
    input: {
      ...input,
      startAmount: BigNumber.from(input.startAmount),
      endAmount: BigNumber.from(input.endAmount),
    },
    outputs: outputs.map((output) => ({
      ...output,
      startAmount: BigNumber.from(output.startAmount),
      endAmount: BigNumber.from(output.endAmount),
    })),
  };
}
