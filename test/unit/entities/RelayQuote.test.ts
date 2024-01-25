import Logger from 'bunyan';
import * as _ from 'lodash';

import { it } from '@jest/globals';
import { DEFAULT_START_TIME_BUFFER_SECS } from '../../../lib/constants';
import { RelayQuote, RelayQuoteJSON } from '../../../lib/entities';
import {
  AMOUNT,
  RELAY_PERMIT,
} from '../../constants';
import {
  createClassicQuote,
  createRelayQuote,
  createRelayQuoteWithRequest,
} from '../../utils/fixtures';

describe('RelayQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('decay parameters', () => {
    it('uses default parameters', () => {
      const quote = createRelayQuoteWithRequest(
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
      const quote = createRelayQuoteWithRequest(
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

  describe('getPermit', () => {
    it('Succeeds - Basic', () => {
      jest.useFakeTimers({
        now: 0,
      });
      const quote = createRelayQuote(
        {},
        'EXACT_INPUT'
      ) as any;
      quote.nonce = 1;
      const dlQuote = quote as RelayQuote;
      const result = dlQuote.getPermitData();
      const expected = RELAY_PERMIT;
      expect(_.isEqual(JSON.stringify(result), JSON.stringify(expected))).toBe(true);
      jest.clearAllTimers();
    });
  });

  describe('toJSON', () => {
    it('Succeeds', () => {
      const quote = createRelayQuote(
        { amountOut: '10000' },
        'EXACT_INPUT',
        '1',
      ) as any;
      const result = quote.toJSON();
      // TODO
      expect(result).toMatchObject({});
    });
  });

  describe('fromClassicQuote', () => {
    it('Succeeds - Generates nonce on initialization with portion flag %p', () => {
      const classicQuote = createClassicQuote(
        {
          gasUseEstimateGasToken: '0',
        },
        {}
      );
      const dutchQuote = createRelayQuote({}, 'EXACT_INPUT');
      const result = RelayQuote.fromClassicQuote(dutchQuote.request, classicQuote);
      const firstNonce = result.toOrder().info.nonce;
      const secondNonce = result.toOrder().info.nonce;
      expect(firstNonce).toEqual(secondNonce);
    });
  });

  describe('fromResponseBody', () => {
    it('correctly creates RelayQuote', () => {
      const amountOut = AMOUNT;
      const relayQuote = createRelayQuote({ amountOut }, 'EXACT_OUTPUT', '1');
      const RELAY_QUOTE_JSON: RelayQuoteJSON = {
        chainId: relayQuote.chainId,
        requestId: relayQuote.requestId,
        quoteId: relayQuote.quoteId,
        tokenIn: relayQuote.tokenIn,
        amountIn: relayQuote.amountIn.toString(),
        tokenOut: relayQuote.tokenOut,
        amountOut: relayQuote.amountOut.toString(),
        gasToken: relayQuote.request.config.gasToken,
        amountInGasToken: relayQuote.amountInGasTokenStart.toString(),
        swapper: relayQuote.swapper,
        classicAmountInGasAndPortionAdjusted: relayQuote.classicAmountInGasAndPortionAdjusted.toString(),
        classicAmountOutGasAndPortionAdjusted: relayQuote.classicAmountOutGasAndPortionAdjusted.toString(),
      }
      const quote = RelayQuote.fromResponseBody(relayQuote.request, RELAY_QUOTE_JSON);
      // nonce will be different so we can't compare the whole object
      expect(quote.toJSON().orderHash).toEqual(relayQuote.toJSON().orderHash);
    });
  });
});
