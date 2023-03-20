import Logger from 'bunyan';
import { ethers } from 'ethers';
import { Quote, QuoteSession } from '../../../lib/entities';
import { QuoterByRoutingType } from '../../../lib/handlers/quote';
import { Quoter } from '../../../lib/providers/quoters';
import {
  classicQuoterMock,
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  CLASSIC_QUOTE_HAS_ROUTE_TO_NATIVE,
  CLASSIC_QUOTE_NO_ROUTE_TO_NATIVE,
  createClassicQuote,
  createDutchLimitQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_IN_WORSE,
  DL_QUOTE_EXACT_OUT_BETTER,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
  QUOTE_REQUEST_MULTI_EXACT_OUT,
} from '../../utils/fixtures';

describe('QuoteSession tests', () => {
  const log = new Logger({ name: 'test', level: 'fatal' });

  const quoterMock = (quote: Quote): Quoter => {
    return {
      quote: jest.fn().mockResolvedValueOnce(quote),
      // eslint-disable-next-line no-unused-labels
    };
  };

  const nullQuoterMock = (): Quoter => {
    return {
      // eslint-disable-next-line no-unused-labels
      quote: () => Promise.resolve(null),
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBestQuote', () => {
    it('returns null if the only specified quoter in config returns null', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        DUTCH_LIMIT: nullQuoterMock(),
      };
      const quoteSession = new QuoteSession([QUOTE_REQUEST_DL], log);
      const bestQuote = await quoteSession.getBestQuote(quoters);
      expect(bestQuote).toBeNull();
    });

    it('only considers quoters that did not throw', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        DUTCH_LIMIT: nullQuoterMock(),
      };
      const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
      const bestQuote = await quoteSession.getBestQuote(quoters);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the dutch limit quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quoteSession = new QuoteSession([QUOTE_REQUEST_DL], log);
      const bestQuote = await quoteSession.getBestQuote(quoters);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE);
    });

    it('returns the classic quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
      const bestQuote = await quoteSession.getBestQuote(quoters);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the DL quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
        CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
      };
      const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
      const bestQuote = await quoteSession.getBestQuote(quoters);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });
  });

  describe('Quotes Validation', () => {
    describe('Invalidate for gas usage, EXACT_INPUT', () => {
      it('does not filter if no gas estimate', async () => {
        const quoters: QuoterByRoutingType = {
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
          CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes).toHaveLength(2);
      });

      it('filters if amountOut == gas used', async () => {
        const amountOut = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote({ quote: amountOut.toString(), quoteGasAdjusted: '1' }, 'EXACT_INPUT');
        const quoters: QuoterByRoutingType = {
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes).toHaveLength(1);
        expect(quotes[0]).toEqual(classicQuote);
      });

      it('does not filter if amountOut * 5% == gas used', async () => {
        const amountOut = ethers.utils.parseEther('1');
        const fivePercent = amountOut.mul(5).div(100);
        const dutchQuote = createDutchLimitQuote({ amountOut: amountOut.toString() }, 'EXACT_INPUT');
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(fivePercent).toString() },
          'EXACT_INPUT'
        );
        const quoters: QuoterByRoutingType = {
          DUTCH_LIMIT: quoterMock(dutchQuote),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes).toHaveLength(2);
      });

      it('filters if amountOut * 25% == gas used', async () => {
        const amountOut = ethers.utils.parseEther('1');
        const twentyFivePercent = amountOut.mul(25).div(100);
        const dutchQuote = createDutchLimitQuote({ amountOut: amountOut.toString() }, 'EXACT_INPUT');
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(twentyFivePercent).toString() },
          'EXACT_INPUT'
        );
        const quoters: QuoterByRoutingType = {
          DUTCH_LIMIT: quoterMock(dutchQuote),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes).toHaveLength(1);
      });
    });

    describe('Invalidate for gas usage, EXACT_OUTPUT', () => {
      it('does not filter if no routing api quote', async () => {
        const quoters = {
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_OUT_BETTER),
          CLASSIC: classicQuoterMock(CLASSIC_QUOTE_HAS_ROUTE_TO_NATIVE),
        };
        const quoteSession = new QuoteSession([QUOTE_REQUEST_DL], log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes).toHaveLength(1);
        expect(quotes[0]).toEqual(DL_QUOTE_EXACT_OUT_BETTER);
      });

      it('does not filter if no gouda quote', async () => {
        const quoters = {
          CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_OUT_BETTER),
        };
        const quoteSession = new QuoteSession([QUOTE_REQUEST_CLASSIC], log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(1);
        expect(quotes[0]).toEqual(CLASSIC_QUOTE_EXACT_OUT_BETTER);
      });

      it('does not filter if no gas estimate', async () => {
        const amountIn = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.toString() },
          'EXACT_OUTPUT'
        );
        const quoters = {
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_OUT_BETTER),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI_EXACT_OUT, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(2);
      });

      it('filters if amountOut == gas used', async () => {
        const amountIn = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(1).toString() },
          'EXACT_OUTPUT'
        );
        const quoters = {
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_OUT_BETTER),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI_EXACT_OUT, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(1);
        expect(quotes[0]).toEqual(classicQuote);
      });

      it('does not filter if amountIn + 5% == gas used', async () => {
        const amountIn = ethers.utils.parseEther('1');
        const fivePercent = amountIn.mul(5).div(100);
        const dutchQuote = createDutchLimitQuote({ amountIn: amountIn.toString() }, 'EXACT_OUTPUT');
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(fivePercent).toString() },
          'EXACT_OUTPUT'
        );
        const quoters = {
          DUTCH_LIMIT: quoterMock(dutchQuote),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI_EXACT_OUT, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(2);
      });

      it('filters if amountOut + 25% == gas used', async () => {
        const amountIn = ethers.utils.parseEther('1');
        const twentyFivePercent = amountIn.mul(25).div(100);
        const dutchQuote = createDutchLimitQuote({ amountIn: amountIn.toString() }, 'EXACT_OUTPUT');
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(twentyFivePercent).toString() },
          'EXACT_OUTPUT'
        );
        const quoters = {
          DUTCH_LIMIT: quoterMock(dutchQuote),
          CLASSIC: classicQuoterMock(classicQuote),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI_EXACT_OUT, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(1);
        expect(quotes[0]).toEqual(classicQuote);
      });
    });

    describe('Invalidate no route back to native', () => {
      it('should not filter UniX if there is route back to native token', async () => {
        const quoters: QuoterByRoutingType = {
          CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(2);
      });

      it('should filter UniX if there is no route back to native token', async () => {
        const quoters: QuoterByRoutingType = {
          CLASSIC: classicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_NO_ROUTE_TO_NATIVE),
          DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const quoteSession = new QuoteSession(QUOTE_REQUEST_MULTI, log);
        const quotes = await quoteSession.getAndValidateQuotes(quoters);
        expect(quotes.length).toEqual(1);
        expect(quotes[0]).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
      });
    });
  });
});
