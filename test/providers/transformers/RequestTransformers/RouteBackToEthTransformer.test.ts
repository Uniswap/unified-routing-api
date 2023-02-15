import { TradeType } from '@uniswap/sdk-core';
import { ChainId, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { ethers } from 'ethers';

import { RouteBackToEthTransformer } from '../../../../lib/providers/transformers/RequestTransformers/RouteBackToEthRequestTransformer';
import { makeClassicRequest, makeDutchLimitRequest, QUOTE_REQUEST_DL } from '../../../utils/fixtures';

describe('RouteBackToEthTransformer', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new RouteBackToEthTransformer(logger);

  it('does not add a synthetic classic request when output is already WETH', async () => {
    const requests = transformer.transform([QUOTE_REQUEST_DL]);
    expect(requests.length).toEqual(1);
  });

  it('adds a synthetic classic request when UniswapX is requested', async () => {
    const quoteRequest = makeDutchLimitRequest({ tokenOut: ethers.constants.AddressZero });
    const requests = transformer.transform([quoteRequest]);
    expect(requests.length).toEqual(2);
    expect(requests[1]).toMatchObject({
      info: {
        tokenIn: quoteRequest.info.tokenOut,
        tokenOut: WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET].address,
        type: TradeType.EXACT_OUTPUT,
        amount: ethers.utils.parseEther('1'),
      },
      config: {
        protocols: ['MIXED', 'V2', 'V3'],
      },
    });
  });

  it('does not add a synthetic classic request when UniswapX not requested', async () => {
    const classicRequest = makeClassicRequest({ tokenOut: ethers.constants.AddressZero });
    const requests = transformer.transform([classicRequest]);
    expect(requests.length).toEqual(1);
  });
});
