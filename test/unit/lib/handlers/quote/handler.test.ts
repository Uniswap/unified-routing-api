import { TradeType } from '@uniswap/sdk-core';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as Logger } from 'bunyan';

import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { RoutingType } from '../../../../../lib/constants';
import { ClassicQuote, ClassicQuoteDataJSON, DutchLimitQuote, Quote } from '../../../../../lib/entities';
import { QuoteRequestBodyJSON } from '../../../../../lib/entities/request/index';
import { ApiInjector, ApiRInj } from '../../../../../lib/handlers/base';
import { compareQuotes, getBestQuote, getQuotes, QuoteHandler } from '../../../../../lib/handlers/quote/handler';
import { ContainerInjected, QuoterByRoutingType } from '../../../../../lib/handlers/quote/injector';
import { Quoter } from '../../../../../lib/providers/quoters';
import { CHECKSUM_OFFERER } from '../../../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  CLASSIC_REQUEST_BODY,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_IN_WORSE,
  DL_QUOTE_EXACT_OUT_BETTER,
  DL_QUOTE_EXACT_OUT_WORSE,
  QUOTE_REQUEST_BODY_MULTI,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../../../utils/fixtures';

describe('QuoteHandler', () => {
  describe('handler', () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      child: () => ({
        info: jest.fn(),
        error: jest.fn(),
      }),
    };

    const requestInjectedMock: Promise<ApiRInj> = new Promise(
      (resolve) =>
        resolve({
          log: logger as unknown as Logger,
          requestId: 'test',
        }) as unknown as ApiRInj
    );

    const injectorPromiseMock = (
      quoters: QuoterByRoutingType
    ): Promise<ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>> =>
      new Promise((resolve) =>
        resolve({
          getContainerInjected: () => {
            return {
              quoters: quoters,
            };
          },
          getRequestInjected: () => requestInjectedMock,
        } as unknown as ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>)
      );

    const getQuoteHandler = (quoters: QuoterByRoutingType) => new QuoteHandler('quote', injectorPromiseMock(quoters));

    const RfqQuoterMock = (dlQuote: DutchLimitQuote): Quoter => {
      return {
        quote: jest.fn().mockResolvedValue(dlQuote),
      };
    };
    const ClassicQuoterMock = (classicQuote: ClassicQuote): Quoter => {
      return {
        quote: jest.fn().mockResolvedValue(classicQuote),
      };
    };
    const getEvent = (request: QuoteRequestBodyJSON): APIGatewayProxyEvent =>
      ({
        body: JSON.stringify(request),
      } as APIGatewayProxyEvent);

    describe('handler test', () => {
      it('handles classic quotes', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE) };
        const res = await getQuoteHandler(quoters).handler(getEvent(CLASSIC_REQUEST_BODY), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote as ClassicQuoteDataJSON;
        expect(quoteJSON.quoteGasAdjusted).toBe(CLASSIC_QUOTE_EXACT_IN_WORSE.amountOutGasAdjusted.toString());
      });

      it('sets the DL quote endAmount using classic quote', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const res = await getQuoteHandler(quoters).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );
        const quoteJSON = JSON.parse(res.body).quote as DutchLimitOrderInfoJSON;
        expect(quoteJSON.outputs.length).toBe(1);
        expect(quoteJSON.outputs[0].endAmount).toBe(CLASSIC_QUOTE_EXACT_IN_WORSE.amountOutGasAdjusted.toString());
      });
    });

    describe('logging test', () => {
      it('logs the requests and response in correct format', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        await getQuoteHandler(quoters).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'UnifiedRoutingQuoteRequest',
            body: expect.objectContaining({
              tokenInChainId: QUOTE_REQUEST_BODY_MULTI.tokenInChainId,
              tokenOutChainId: QUOTE_REQUEST_BODY_MULTI.tokenOutChainId,
              tokenIn: QUOTE_REQUEST_BODY_MULTI.tokenIn,
              tokenOut: QUOTE_REQUEST_BODY_MULTI.tokenOut,
              amount: QUOTE_REQUEST_BODY_MULTI.amount,
              type: QUOTE_REQUEST_BODY_MULTI.type,
              offerer: CHECKSUM_OFFERER,
              configs: 'DUTCH_LIMIT,CLASSIC',
              createdAt: expect.any(String),
            }),
          })
        );

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'UnifiedRoutingQuoteResponse',
            body: expect.objectContaining({
              tokenInChainId: QUOTE_REQUEST_BODY_MULTI.tokenInChainId,
              tokenOutChainId: QUOTE_REQUEST_BODY_MULTI.tokenOutChainId,
              quoteId: 'quoteId',
              tokenIn: QUOTE_REQUEST_BODY_MULTI.tokenIn,
              tokenOut: QUOTE_REQUEST_BODY_MULTI.tokenOut,
              amountIn: DL_QUOTE_EXACT_IN_BETTER.amountIn.toString(),
              amountOut: DL_QUOTE_EXACT_IN_BETTER.amountOut.toString(),
              offerer: DL_QUOTE_EXACT_IN_BETTER.offerer,
              filler: DL_QUOTE_EXACT_IN_BETTER.filler,
              routing: DL_QUOTE_EXACT_IN_BETTER.routingType,
              createdAt: expect.any(String),
            }),
          })
        );
      });
    });
  });

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
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        DUTCH_LIMIT: nullQuoterMock(),
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toBeNull();
    });

    it('only considers quoters that did not throw', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        DUTCH_LIMIT: nullQuoterMock(),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the best quote among two dutch limit quotes', async () => {
      let quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
      };
      let quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      quoters = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
      };
      quotes = quotes.concat(await getQuotes(quoters, [QUOTE_REQUEST_DL]));
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the dutch limit quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE);
    });

    it('returns the classic quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the DL quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });
  });
});
