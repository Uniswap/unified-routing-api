import Logger from 'bunyan';

import { ClassicQuoteContext } from '../../../../lib/entities';
import { QUOTE_REQUEST_CLASSIC, CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE } from '../../../utils/fixtures';

describe('ClassicQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('dependencies', () => {
    it('returns no dependencies', () => {
      const context = new ClassicQuoteContext(QUOTE_REQUEST_CLASSIC);
      expect(context.dependencies()).toEqual([]);
    });
  });

  describe('resolve', () => {
    it('throws if no dependencies given', () => {
      const context = new ClassicQuoteContext(QUOTE_REQUEST_CLASSIC);
      expect(() => context.resolve([])).toThrowError('Invalid quote result: ');
    });

    it('throws if too many dependencies given', () => {
      const context = new ClassicQuoteContext(QUOTE_REQUEST_CLASSIC);
      expect(() => context.resolve([CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE])).toThrowError('Invalid quote result: ');
    });

    it('returns null if quote is null', () => {
      const context = new ClassicQuoteContext(QUOTE_REQUEST_CLASSIC);
      expect(context.resolve([null])).toBeNull();
    });

    it('returns quote', () => {
      const context = new ClassicQuoteContext(QUOTE_REQUEST_CLASSIC);
      expect(context.resolve([CLASSIC_QUOTE_EXACT_IN_BETTER])).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });
  });
});
