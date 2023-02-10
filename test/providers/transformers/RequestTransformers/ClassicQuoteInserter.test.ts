import Logger from 'bunyan';

import { ClassicQuoteInserter } from '../../../../lib/providers/transformers';
import { QUOTE_REQUEST_CLASSIC, QUOTE_REQUEST_DL } from '../../../utils/fixtures';

describe('ClassicQuoteInserter', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new ClassicQuoteInserter(logger);

  it('adds a classic request when UniswapX requested', async () => {
    const requests = transformer.transform([QUOTE_REQUEST_DL]);
    expect(requests.length).toEqual(2);
    expect(requests[1]).toMatchObject({
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

  it('does not add a classic request when UniswapX not requested', async () => {
    const requests = transformer.transform([QUOTE_REQUEST_CLASSIC]);
    expect(requests.length).toEqual(1);
  });

  it('does not add a classic request when already exists', async () => {
    const requests = transformer.transform([QUOTE_REQUEST_CLASSIC, QUOTE_REQUEST_DL]);
    expect(requests.length).toEqual(2);
  });
});
