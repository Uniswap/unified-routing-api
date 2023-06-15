import { PermitDetails } from '@uniswap/permit2-sdk';
import Logger from 'bunyan';

import { ClassicQuoteContext } from '../../../../../lib/entities';
import { Permit2Fetcher } from '../../../../../lib/fetchers/Permit2Fetcher';
import { PERMIT_DETAILS } from '../../../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  QUOTE_REQUEST_CLASSIC,
} from '../../../../utils/fixtures';

describe('ClassicQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const permit2FetcherMock = (permitDetails: PermitDetails, isError = false): Permit2Fetcher => {
    const fetcher = {
      fetchAllowance: jest.fn(),
    };

    if (isError) {
      fetcher.fetchAllowance.mockRejectedValue(new Error('error'));
      return fetcher as unknown as Permit2Fetcher;
    }

    fetcher.fetchAllowance.mockResolvedValueOnce(permitDetails);
    return fetcher as unknown as Permit2Fetcher;
  };

  describe('dependencies', () => {
    it('returns only request dependency', () => {
      const permit2Fetcher = permit2FetcherMock(PERMIT_DETAILS);
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC, permit2Fetcher);
      expect(context.dependencies()).toEqual([QUOTE_REQUEST_CLASSIC]);
    });
  });

  describe('resolve', () => {
    it('returns null if no quotes given', async () => {
      const permit2Fetcher = permit2FetcherMock(PERMIT_DETAILS);
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC, permit2Fetcher);
      expect(await context.resolve({})).toEqual(null);
    });

    it('still returns quote if too many dependencies given', async () => {
      const permit2Fetcher = permit2FetcherMock(PERMIT_DETAILS);
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC, permit2Fetcher);
      expect(
        await context.resolve({
          [QUOTE_REQUEST_CLASSIC.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
          [CLASSIC_QUOTE_EXACT_OUT_WORSE.request.key()]: CLASSIC_QUOTE_EXACT_IN_WORSE,
        })
      ).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns quote', async () => {
      const permit2Fetcher = permit2FetcherMock(PERMIT_DETAILS);
      const context = new ClassicQuoteContext(logger, QUOTE_REQUEST_CLASSIC, permit2Fetcher);
      expect(
        await context.resolve({
          [QUOTE_REQUEST_CLASSIC.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
        })
      ).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });
  });
});
