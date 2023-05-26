import Logger from 'bunyan';
import * as _ from 'lodash';

import { DutchLimitQuote } from '../../../lib/entities';
import { DL_PERMIT } from '../../constants';
import { CLASSIC_QUOTE_EXACT_IN_LARGE, createDutchLimitQuote, DL_QUOTE_EXACT_IN_LARGE } from '../../utils/fixtures';

describe('DutchLimitQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('Reparameterize', () => {
    it('Does not reparameterize if classic is not defined', async () => {
      const reparameterized = DutchLimitQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, undefined);
      expect(reparameterized).toMatchObject(DL_QUOTE_EXACT_IN_LARGE);
    });

    it('reparameterizes with classic quote for end', async () => {
      const reparameterized = DutchLimitQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, CLASSIC_QUOTE_EXACT_IN_LARGE);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_EXACT_IN_LARGE.request);
      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_EXACT_IN_LARGE.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(DL_QUOTE_EXACT_IN_LARGE.amountOutStart);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } =
        DutchLimitQuote.applyGasAdjustment(CLASSIC_QUOTE_EXACT_IN_LARGE);
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchLimitQuote.calculateEndAmountFromSlippage(
        DL_QUOTE_EXACT_IN_LARGE.request.info,
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
      const result = dlQuote.getPermit();
      const expected = DL_PERMIT;
      expect(_.isEqual(JSON.stringify(result), JSON.stringify(expected))).toBe(true);
      jest.clearAllTimers();
    });
  });
});
