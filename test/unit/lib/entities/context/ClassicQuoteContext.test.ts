import Logger from 'bunyan';

import { ClassicQuoteContext } from '../../../../../lib/entities';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  QUOTE_REQUEST_CLASSIC,
} from '../../../../utils/fixtures';

describe('ClassicQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('dependencies', () => {
    it('returns only request dependency', () => {
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC);
      expect(context.dependencies()).toEqual([QUOTE_REQUEST_CLASSIC]);
    });
  });

  describe('resolve', () => {
    it('returns null if no quotes given', () => {
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC);
      expect(context.resolve({})).toEqual(null);
    });

    it('still returns quote if too many dependencies given', () => {
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC);
      expect(
        context.resolve({
          [QUOTE_REQUEST_CLASSIC.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
          [CLASSIC_QUOTE_EXACT_OUT_WORSE.request.key()]: CLASSIC_QUOTE_EXACT_IN_WORSE,
        })
      ).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns quote', () => {
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC);
      expect(
        context.resolve({
          [QUOTE_REQUEST_CLASSIC.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
        })
      ).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });
  });
});
