import Logger from 'bunyan';
import * as _ from 'lodash';

import { it } from '@jest/globals';
import { DEFAULT_START_TIME_BUFFER_SECS } from '../../../lib/constants';
import { RelayQuote } from '../../../lib/entities';
import { AMOUNT } from '../../constants';
import {
  CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN,
  createClassicQuote,
  createRelayQuote,
  createRelayQuoteWithRequestOverrides,
  makeRelayRequest,
  QUOTE_REQUEST_RELAY,
  RELAY_QUOTE_DATA,
} from '../../utils/fixtures';

describe('RelayQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('decay parameters', () => {
    it('uses default parameters', () => {
      const quote = createRelayQuoteWithRequestOverrides(
        {},
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: undefined,
          auctionPeriodSecs: undefined,
          deadlineBufferSecs: undefined,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(DEFAULT_START_TIME_BUFFER_SECS);
      expect(result.auctionPeriodSecs).toEqual(60);
      expect(result.deadlineBufferSecs).toEqual(12);
    });

    it('overrides parameters in request', () => {
      const quote = createRelayQuoteWithRequestOverrides(
        {},
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: 111,
          auctionPeriodSecs: 222,
          deadlineBufferSecs: 333,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(111);
      expect(result.auctionPeriodSecs).toEqual(222);
      expect(result.deadlineBufferSecs).toEqual(333);
    });
  });

  describe('toOrder', () => {
    it('generates calldata for a classic swap and adds it', () => {
      const quote = createRelayQuote({ amountOut: '10000' }, 'EXACT_INPUT', '1');
      const order = quote.toOrder();
      // expect generated calldata from quote class to be added to order
      expect(quote.universalRouterCalldata(order.info.deadline)).toEqual(order.info.universalRouterCalldata);
    });
  });

  describe('toJSON', () => {
    it('Succeeds', () => {
      const quote = createRelayQuote({ amountOut: '10000' }, 'EXACT_INPUT', '1');
      const quoteJSON = quote.toJSON();

      expect(quoteJSON).toMatchObject({
        requestId: 'requestId',
        quoteId: 'quoteId',
      });
    });
  });

  describe('fromResponseBody', () => {
    it('Succeeds', () => {
      const relayQuote = RelayQuote.fromResponseBody(QUOTE_REQUEST_RELAY, RELAY_QUOTE_DATA.quote);
      expect(relayQuote).toBeDefined();
      // check quote attr
      expect(relayQuote.requestId).toEqual(RELAY_QUOTE_DATA.quote.requestId);
      expect(relayQuote.quoteId).toEqual(RELAY_QUOTE_DATA.quote.quoteId);
      expect(relayQuote.chainId).toEqual(RELAY_QUOTE_DATA.quote.chainId);
      expect(relayQuote.amountIn.toString()).toEqual(RELAY_QUOTE_DATA.quote.amountIn);
      expect(relayQuote.amountOut.toString()).toEqual(RELAY_QUOTE_DATA.quote.amountOut);
      expect(relayQuote.swapper).toEqual(RELAY_QUOTE_DATA.quote.swapper);
      expect(relayQuote.toJSON().classicQuoteData).toMatchObject(RELAY_QUOTE_DATA.quote.classicQuoteData);
      // check request attr
      expect(relayQuote.request.toJSON()).toMatchObject(QUOTE_REQUEST_RELAY.toJSON());
    });
  });

  describe('fromClassicQuote', () => {
    it('Succeeds', () => {
      const classicQuote = createClassicQuote(CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN.quote, {});
      const relayRequest = makeRelayRequest({ type: 'EXACT_INPUT' });
      const quote = RelayQuote.fromClassicQuote(relayRequest, classicQuote);
      expect(quote).toBeDefined();
      // Expect adjustment to be applied to fee token stat amount
      expect(quote.feeAmountStart.gt(AMOUNT)).toBeTruthy();
      // Expect some escalation to be applied to fee token end amount
      expect(quote.feeAmountEnd.gt(quote.feeAmountStart)).toBeTruthy();
    });
  });
});
