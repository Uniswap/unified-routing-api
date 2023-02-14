import axios from 'axios';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';

import { DutchLimitQuote, DutchLimitQuoteJSON } from '../../../lib/entities/quote/DutchLimitQuote';
import { RfqQuoter } from '../../../lib/providers/quoters/RfqQuoter';
import { AMOUNT_IN, OFFERER, TOKEN_IN, TOKEN_OUT } from '../../constants';
import { QUOTE_REQUEST_DL, QUOTE_REQUEST_DL_EXACT_OUT } from '../../utils/fixtures';

describe('RfqQuoter test', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const getSpy = (nonce?: string) => jest.spyOn(axios, 'get').mockResolvedValue({ data: { nonce: nonce } });
  const postSpy = (responseData: DutchLimitQuoteJSON) =>
    jest.spyOn(axios, 'post').mockResolvedValue({ data: responseData });
  const quoter = new RfqQuoter(logger, 'https://api.uniswap.org/', 'https://api.uniswap.org/');

  beforeEach(() => {
    jest.clearAllMocks();
    postSpy({
      chainId: 1,
      requestId: '123',
      tokenIn: TOKEN_IN,
      amountIn: AMOUNT_IN,
      tokenOut: TOKEN_OUT,
      amountOut: AMOUNT_IN,
      offerer: OFFERER,
    });
  });

  it('returns null if requested trade type is EXACT_OUTPUT', async () => {
    const quote = await quoter.quote(QUOTE_REQUEST_DL_EXACT_OUT);
    expect(quote).toBeNull();
  });

  it('uses nonce returned by UniX service and increment by 1', async () => {
    getSpy('123');
    const quote = await quoter.quote(QUOTE_REQUEST_DL);
    expect(quote?.toJSON()).toMatchObject({
      nonce: '124',
    });
  });

  it('generates random nonce if UniX service returns null', async () => {
    getSpy();
    const quote = (await quoter.quote(QUOTE_REQUEST_DL)) as DutchLimitQuote;
    const nonce = BigNumber.from(quote?.toOrder().nonce);
    expect(nonce.gt(0) && nonce.lt(ethers.constants.MaxUint256)).toBeTruthy();
  });
});
