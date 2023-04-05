import { TradeType } from '@uniswap/sdk-core';
import { ChainId, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { ethers } from 'ethers';

import { RouteBackToNativeInserter } from '../../../../../lib/providers/transformers/RequestTransformers/RouteBackToNativeInserter';
import { makeDutchLimitRequest, QUOTE_REQUEST_CLASSIC, QUOTE_REQUEST_DL_NATIVE_OUT } from '../../../../utils/fixtures';

describe('RouteBackToEthTransformer', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new RouteBackToNativeInserter(logger);

  it('adds a synthetic classic request when UniswapX requested', async () => {
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
    const requests = transformer.transform([QUOTE_REQUEST_CLASSIC]);
    expect(requests.length).toEqual(1);
  });

  it('does not add a synthetic classic request when output token is native token', async () => {
    const requests = transformer.transform([QUOTE_REQUEST_DL_NATIVE_OUT]);
    expect(requests.length).toEqual(1);
  });
});
