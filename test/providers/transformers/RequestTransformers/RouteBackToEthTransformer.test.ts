import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { ethers } from 'ethers';
import { RouteBackToEthTransformer } from '../../../../lib/providers/transformers/RequestTransformers/RouteBackToEthRequestTransformer';
import { QUOTE_REQUEST_CLASSIC } from '../../../utils/fixtures';

describe('RouteBackToEthTransformer', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new RouteBackToEthTransformer(logger);

  it('adds a synthetic classic request', async () => {
    const requests = transformer.transform([QUOTE_REQUEST_CLASSIC], '1000000000');
    expect(requests.length).toEqual(2);
    expect(requests[1]).toMatchObject({
      info: {
        tokenIn: QUOTE_REQUEST_CLASSIC.info.tokenOut,
        tokenOut: 'ETH',
        type: TradeType.EXACT_OUTPUT,
        amount: ethers.utils.parseEther('1'),
      },
      config: {
        protocols: ['MIXED', 'V2', 'V3'],
        gasPriceWei: '1000000000',
      },
    });
  });
});
