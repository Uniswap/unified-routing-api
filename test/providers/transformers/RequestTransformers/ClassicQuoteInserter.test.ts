import Logger from 'bunyan';
import { RequestsByRoutingType } from '../../../../lib/entities';

import { ClassicQuoteInserter } from '../../../../lib/providers/transformers';
import { QUOTE_REQUEST_DL } from '../../../utils/fixtures';

describe('ClassicQuoteInserter', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new ClassicQuoteInserter(logger);

  it('adds a classic request when UniswapX requested', async () => {
    const requests: RequestsByRoutingType = {
      DUTCH_LIMIT: { original: QUOTE_REQUEST_DL },
      CLASSIC: {},
    };
    transformer.transform(requests);
    expect(requests.CLASSIC.synthetic).toBeDefined();
    expect(requests.CLASSIC.synthetic).toMatchObject({
      info: {
        tokenIn: QUOTE_REQUEST_DL.info.tokenIn,
        tokenOut: QUOTE_REQUEST_DL.info.tokenOut,
        type: QUOTE_REQUEST_DL.info.type,
        amount: QUOTE_REQUEST_DL.info.amount,
      },
      config: {
        protocols: ['MIXED', 'V2', 'V3'],
      },
    });
  });
});
