import Logger from 'bunyan';

import { NoRouteBackToNativeFilter } from '../../../../../lib/providers/transformers';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_HAS_ROUTE_TO_NATIVE,
  CLASSIC_QUOTE_NO_ROUTE_TO_NATIVE,
  DL_QUOTE_EXACT_IN_BETTER,
  QUOTE_REQUEST_MULTI,
} from '../../../../utils/fixtures';

describe('NoRouteBackToEthFilter', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  const filter = new NoRouteBackToNativeFilter(logger);

  it('should not filter UniX if there is route back to native token', async () => {
    const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [
      CLASSIC_QUOTE_HAS_ROUTE_TO_NATIVE,
      DL_QUOTE_EXACT_IN_BETTER,
      CLASSIC_QUOTE_EXACT_IN_BETTER,
    ]);
    expect(filtered.length).toEqual(3);
  });

  it('should filter UniX if there is no route back to native token', async () => {
    const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [
      CLASSIC_QUOTE_NO_ROUTE_TO_NATIVE,
      DL_QUOTE_EXACT_IN_BETTER,
      CLASSIC_QUOTE_EXACT_IN_BETTER,
    ]);
    expect(filtered.length).toEqual(2);
  });
});
