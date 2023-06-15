import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import * as _ from 'lodash';

import { DutchLimitQuote } from '../../../lib/entities';
import { DL_PERMIT, DUTCH_LIMIT_ORDER_JSON } from '../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_LARGE,
  CLASSIC_QUOTE_EXACT_OUT_LARGE,
  createClassicQuote,
  createDutchLimitQuote,
  DL_QUOTE_EXACT_IN_LARGE,
  DL_QUOTE_EXACT_OUT_LARGE,
} from '../../utils/fixtures';

describe('DutchLimitQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('Reparameterize', () => {
    it('Does not reparameterize if classic is not defined', async () => {
      const reparameterized = DutchLimitQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, undefined);
      expect(reparameterized).toMatchObject(DL_QUOTE_EXACT_IN_LARGE);
    });

    it('slippage is in percent terms', async () => {
      const amountIn = BigNumber.from('1000000000');
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
        Object.assign({}, DL_QUOTE_EXACT_IN_LARGE.request, {
          info: {
            ...DL_QUOTE_EXACT_IN_LARGE.request.info,
            slippageTolerance: 10,
          },
        }),
        amountIn,
        amountIn
      );

      expect(amountInEnd).toEqual(amountIn);
      expect(amountOutEnd).toEqual(amountIn.mul(90).div(100));
    });

    it('reparameterizes with classic quote for end', async () => {
      const reparameterized = DutchLimitQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, CLASSIC_QUOTE_EXACT_IN_LARGE);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_EXACT_IN_LARGE.request);
      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_EXACT_IN_LARGE.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(DL_QUOTE_EXACT_IN_LARGE.amountOutStart);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } =
        DutchLimitQuote.applyGasAdjustment(CLASSIC_QUOTE_EXACT_IN_LARGE);
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
        DL_QUOTE_EXACT_IN_LARGE.request,
        amountInClassic,
        amountOutClassic
      );

      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
    });

    it('reparameterizes with classic quote for end exactOutput', async () => {
      const reparameterized = DutchLimitQuote.reparameterize(DL_QUOTE_EXACT_OUT_LARGE, CLASSIC_QUOTE_EXACT_OUT_LARGE);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_EXACT_OUT_LARGE.request);
      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_EXACT_OUT_LARGE.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(DL_QUOTE_EXACT_OUT_LARGE.amountOutStart);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } =
        DutchLimitQuote.applyGasAdjustment(CLASSIC_QUOTE_EXACT_OUT_LARGE);
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
        DL_QUOTE_EXACT_OUT_LARGE.request,
        amountInClassic,
        amountOutClassic
      );

      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
    });
  });

  describe('getPermit', () => {
    it('Succeeds - Basic', () => {
      jest.useFakeTimers({
        now: 0,
      });
      const quote = createDutchLimitQuote({ amountOut: '10000' }, 'EXACT_INPUT') as any;
      quote.nonce = 1;
      const dlQuote = quote as DutchLimitQuote;
      const result = dlQuote.getPermitData();
      const expected = DL_PERMIT;
      expect(_.isEqual(JSON.stringify(result), JSON.stringify(expected))).toBe(true);
      jest.clearAllTimers();
    });
  });

  describe('toJSON', () => {
    it('Succeeds - Basic', () => {
      const quote = createDutchLimitQuote({ amountOut: '10000' }, 'EXACT_INPUT') as any;
      quote.nonce = 1;
      const result = quote.toJSON();
      expect(result).toMatchObject(DUTCH_LIMIT_ORDER_JSON);
    });
  });

  describe('fromClassicQuote', () => {
    it('Succeeds - Generates nonce on initialization', () => {
      const classicQuote = createClassicQuote({}, {});
      const dutchLimitQuote = createDutchLimitQuote({}, 'EXACT_INPUT');
      const result = DutchLimitQuote.fromClassicQuote(dutchLimitQuote.request, classicQuote);
      const firstNonce = result.toOrder().info.nonce;
      const secondNonce = result.toOrder().info.nonce;
      expect(firstNonce).toEqual(secondNonce);
    });
  });
});
