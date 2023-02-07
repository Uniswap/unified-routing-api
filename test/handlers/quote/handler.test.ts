import { TradeType } from '@uniswap/sdk-core';
import { default as Logger } from 'bunyan';

import { Quote } from '../../../lib/entities';
import { compareQuotes, getBestQuote, getQuotes } from '../../../lib/handlers/quote/handler';
import { QuoterByRoutingType } from '../../../lib/handlers/quote/injector';
import { Quoter } from '../../../lib/providers/quoters';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_IN_WORSE,
  DL_QUOTE_EXACT_OUT_BETTER,
  DL_QUOTE_EXACT_OUT_WORSE,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../utils/fixtures';

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

    it('returns true if lhs is a better classic quote', () => {
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(
        true
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
    });

    it('returns false if lhs is a worse classic quote', () => {
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_WORSE, CLASSIC_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(
        false
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_WORSE, CLASSIC_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
    });

    it('returns true if lhs is a better mixed type', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_BETTER, DL_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
    });

    it('returns false if lhs is a worse mixed type', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_WORSE, CLASSIC_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_WORSE, DL_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_WORSE, CLASSIC_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
    });
  });

  describe('getBestQuote', () => {
    const quoterMock = (quote: Quote): Quoter => {
      return {
        // eslint-disable-next-line no-unused-labels
        quote: () => Promise.resolve(quote),
      };
    };

    it('returns the best quote among two dutch limit quotes', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_WORSE), quoterMock(DL_QUOTE_EXACT_IN_BETTER)],
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the dutch limit quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_WORSE)],
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER)],
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE);
    });

    it('returns the classic quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_WORSE)],
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER)],
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the DL quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_BETTER)],
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE)],
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });
  });
});
