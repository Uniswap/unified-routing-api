import { TradeType } from '@uniswap/sdk-core';
import { default as Logger } from 'bunyan';

import { QuoteRequest } from '../../../../lib/entities/QuoteRequest';
import { QuoteResponse } from '../../../../lib/entities/QuoteResponse';
import { compareQuotes, getBestQuote } from '../../../../lib/handlers/quote/handler';
import { QuoterByRoutingType } from '../../../../lib/handlers/quote/injector';
import { Quoter } from '../../../../lib/quoters';
import { AMOUNT_IN, CHAIN_IN_ID, CHAIN_OUT_ID, OFFERER, TOKEN_IN, TOKEN_OUT } from '../../../constants';
import { buildQuoteResponse } from '../../utils/quoteResponse';

const baseQuote = {
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  requestId: 'requestId',
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_INPUT',
};

const QUOTE_REQUEST = QuoteRequest.fromRequestBody({
  ...baseQuote,
  configs: [
    {
      routingType: 'DUTCH_LIMIT',
      offerer: OFFERER,
      exclusivePeriodSecs: 12,
      auctionPeriodSecs: 60,
    },
  ],
});

const QUOTE_REQUEST_MULTI = QuoteRequest.fromRequestBody({
  ...baseQuote,
  configs: [
    {
      routingType: 'DUTCH_LIMIT',
      offerer: OFFERER,
      exclusivePeriodSecs: 12,
      auctionPeriodSecs: 60,
    },
    {
      routingType: 'CLASSIC',
      protocols: ['v3'],
      gasPriceWei: '12',
    },
  ],
});

const DL_QUOTE_DATA = {
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
};

const CLASSIC_QUOTE_DATA = {
  routing: 'CLASSIC',
  quote: {
    quoteId: '1',
    amount: '1',
    amountDecimals: '18',
    quote: '1',
    quoteDecimals: '18',
    quoteGasAdjusted: AMOUNT_IN,
    quoteGasAdjustedDecimals: '18',
    gasUseEstimate: '100',
    gasUseEstimateQuote: '100',
    gasUseEstimateQuoteDecimals: '18',
    gasUseEstimateUSD: '100',
    simulationStatus: 'asdf',
    gasPriceWei: '10000',
    blockNumber: '1234',
    route: [],
    routeString: 'USD-ETH',
  },
};

const DL_QUOTE_EXACT_IN_BETTER = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountOut: '2' } })
);
const DL_QUOTE_EXACT_IN_WORSE = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountOut: '1' } })
);
const DL_QUOTE_EXACT_OUT_BETTER = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountIn: '1' } })
);
const DL_QUOTE_EXACT_OUT_WORSE = buildQuoteResponse(
  Object.assign({}, DL_QUOTE_DATA, { quote: { ...DL_QUOTE_DATA.quote, amountIn: '2' } })
);
const CLASSIC_QUOTE_EXACT_IN_BETTER = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '2' } })
);
const CLASSIC_QUOTE_EXACT_IN_WORSE = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '1' } })
);
const CLASSIC_QUOTE_EXACT_OUT_BETTER = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '1' } }),
  TradeType.EXACT_OUTPUT
);
const CLASSIC_QUOTE_EXACT_OUT_WORSE = buildQuoteResponse(
  Object.assign({}, CLASSIC_QUOTE_DATA, { quote: { ...CLASSIC_QUOTE_DATA.quote, quote: '2' } }),
  TradeType.EXACT_OUTPUT
);

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
    const quoterMock = (quote: QuoteResponse): Quoter => {
      return {
        // eslint-disable-next-line no-unused-labels
        quote: () => Promise.resolve(quote),
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

    it('returns null if the only specified quoter in config returns null', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER)],
        DUTCH_LIMIT: [nullQuoterMock()],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST, TradeType.EXACT_INPUT, logger);
      expect(bestQuote).toBeNull();
    });

    it('only considers quoters that did not throw', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER)],
        DUTCH_LIMIT: [nullQuoterMock()],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST_MULTI, TradeType.EXACT_INPUT, logger);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the best quote among two dutch limit quotes', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_WORSE), quoterMock(DL_QUOTE_EXACT_IN_BETTER)],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST, TradeType.EXACT_INPUT);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the dutch limit quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_WORSE)],
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER)],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST, TradeType.EXACT_INPUT);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE);
    });

    it('returns the classic quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_WORSE)],
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER)],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST_MULTI, TradeType.EXACT_INPUT);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the DL quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: [quoterMock(DL_QUOTE_EXACT_IN_BETTER)],
        CLASSIC: [quoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE)],
      };
      const bestQuote = await getBestQuote(quoters, QUOTE_REQUEST_MULTI, TradeType.EXACT_INPUT);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });
  });
});
