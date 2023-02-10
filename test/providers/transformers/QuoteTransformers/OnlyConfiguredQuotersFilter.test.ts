import Logger from 'bunyan';
import { ethers } from 'ethers';

import { OnlyConfiguredQuotersFilter } from '../../../../lib/providers/transformers';
import {
  CLASSIC_QUOTE_DATA,
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_IN_BETTER,
  makeClassicRequest,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../../utils/fixtures';
import { buildQuoteResponse } from '../../../utils/quoteResponse';

describe('OnlyConfiguredQuotersFilter', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  const filter = new OnlyConfiguredQuotersFilter(logger);

  it('does not filter classic if configured', async () => {
    const filtered = await filter.transform([QUOTE_REQUEST_CLASSIC], [CLASSIC_QUOTE_EXACT_IN_BETTER]);
    expect(filtered.length).toEqual(1);
    expect(filtered[0]).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
  });

  it('does not filter DL if configured', async () => {
    const filtered = await filter.transform([QUOTE_REQUEST_DL], [DL_QUOTE_EXACT_IN_BETTER]);
    expect(filtered.length).toEqual(1);
    expect(filtered[0]).toEqual(DL_QUOTE_EXACT_IN_BETTER);
  });

  it('filters DL if not configured', async () => {
    const filtered = await filter.transform([QUOTE_REQUEST_CLASSIC], [DL_QUOTE_EXACT_IN_BETTER]);
    expect(filtered.length).toEqual(0);
  });

  it('filters classic if not configured', async () => {
    const filtered = await filter.transform([QUOTE_REQUEST_DL], [CLASSIC_QUOTE_EXACT_IN_BETTER]);
    expect(filtered.length).toEqual(0);
  });

  it('does not filter either if both configured', async () => {
    const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [
      CLASSIC_QUOTE_EXACT_IN_BETTER,
      DL_QUOTE_EXACT_IN_BETTER,
    ]);
    expect(filtered.length).toEqual(2);
  });

  it('filters one of several if configured', async () => {
    let filtered = await filter.transform(
      [QUOTE_REQUEST_CLASSIC],
      [CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_BETTER]
    );
    expect(filtered.length).toEqual(1);
    filtered = await filter.transform([QUOTE_REQUEST_DL], [CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_BETTER]);
    expect(filtered.length).toEqual(1);
  });

  it('filter if configured but different params', async () => {
    const diffParamQuote = buildQuoteResponse(
      CLASSIC_QUOTE_DATA,
      makeClassicRequest({ tokenOut: ethers.constants.AddressZero })
    );

    const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [
      CLASSIC_QUOTE_EXACT_IN_BETTER,
      DL_QUOTE_EXACT_IN_BETTER,
      diffParamQuote,
    ]);
    expect(filtered.length).toEqual(2);
  });

  it('does not filter multiple of same type', async () => {
    const filtered = await filter.transform(
      [QUOTE_REQUEST_CLASSIC],
      [CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_BETTER]
    );
    expect(filtered.length).toEqual(2);
  });
});
