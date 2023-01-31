import { TradeType } from '@uniswap/sdk-core';
import { default as Logger } from 'bunyan';

import { QuoteRequest } from '../../../lib/entities/QuoteRequest';
import { QuoteResponse } from '../../../lib/entities/QuoteResponse';
import { compareQuotes, getBestQuote } from '../../../lib/handlers/quote/handler';
import { QuoterByRoutingType } from '../../../lib/handlers/quote/injector';
import { Quoter } from '../../../lib/quoters';
import { AMOUNT_IN, CHAIN_IN_ID, CHAIN_OUT_ID, OFFERER, TOKEN_IN, TOKEN_OUT } from '../../constants';

const QUOTE_REQUEST = QuoteRequest.fromRequestBody({
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  requestId: 'requestId',
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  tradeType: 'EXACT_INPUT',
  configs: [
    {
      routingType: 'DUTCH_LIMIT',
      offerer: OFFERER,
      exclusivePeriodSecs: 12,
      auctionPeriodSecs: 60,
    },
  ],
});

const DL_QUOTE_EXACT_IN_WORSE: QuoteResponse = QuoteResponse.fromResponseBody({
  routing: 'DUTCH_LIMIT',
  quote: {
    chainId: 1,
    requestId: 'requestId',
    tokenIn: 'tokenIn',
    amountIn: '1',
    tokenOut: 'tokenOut',
    amountOut: '1',
    offerer: 'offerer',
  },
});

const DL_QUOTE_EXACT_IN_BETTER: QuoteResponse = QuoteResponse.fromResponseBody({
  routing: 'DUTCH_LIMIT',
  quote: {
    chainId: 1,
    requestId: 'requestId',
    tokenIn: 'tokenIn',
    amountIn: '1',
    tokenOut: 'tokenOut',
    amountOut: '2',
    offerer: 'offerer',
  },
});

const DL_QUOTE_EXACT_OUT_WORSE: QuoteResponse = QuoteResponse.fromResponseBody({
  routing: 'DUTCH_LIMIT',
  quote: {
    chainId: 1,
    requestId: 'requestId',
    tokenIn: 'tokenIn',
    amountIn: '2',
    tokenOut: 'tokenOut',
    amountOut: '1',
    offerer: 'offerer',
  },
});

const DL_QUOTE_EXACT_OUT_BETTER: QuoteResponse = QuoteResponse.fromResponseBody({
  routing: 'DUTCH_LIMIT',
  quote: {
    chainId: 1,
    requestId: 'requestId',
    tokenIn: 'tokenIn',
    amountIn: '1',
    tokenOut: 'tokenOut',
    amountOut: '1',
    offerer: 'offerer',
  },
});

describe('QuoteHandler', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('compareQuotes', () => {
    it('returns true if lhs is a better dutch limit quote than rhs', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, DL_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(true);
    });
    it('returns false if lhs is a worse dutch limit quote than rhs', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_WORSE, DL_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(false);
    });
  });

  describe('getBestQuote', () => {
    const rfqQuoterMock = (quote: QuoteResponse): Quoter => {
      return {
        // eslint-disable-next-line no-unused-labels
        quote: () => Promise.resolve(quote),
      };
    };

    it('returns the best quote among two dutch limit quotes', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [rfqQuoterMock(DL_QUOTE_EXACT_IN_WORSE), rfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER)],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST, TradeType.EXACT_INPUT);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });
  });
});
