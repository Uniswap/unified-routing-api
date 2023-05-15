import Logger from 'bunyan';

import { DutchLimitQuote } from '../../../lib/entities';
import { CLASSIC_QUOTE_EXACT_IN_LARGE, DL_QUOTE_EXACT_IN_LARGE } from '../../utils/fixtures';

describe('DutchLimitQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('Reparameterize', () => {
    it('Does ont reparameterize if classic is not defined', async () => {
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
});
