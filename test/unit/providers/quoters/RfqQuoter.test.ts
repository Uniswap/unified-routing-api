import axios from 'axios';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';

import { WETH9 } from '@uniswap/sdk-core';
import { DutchLimitQuote, DutchLimitQuoteJSON } from '../../../../lib/entities/quote/DutchLimitQuote';
import { RfqQuoter } from '../../../../lib/providers/quoters/RfqQuoter';
import { AMOUNT_IN, OFFERER, TOKEN_IN, TOKEN_OUT } from '../../../constants';
import {
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_DL_EXACT_OUT,
  QUOTE_REQUEST_DL_ONE_SYMBOL,
  QUOTE_REQUEST_DL_TOKEN_SYMBOLS,
  QUOTE_REQUEST_DL_UNKNOWN_SYMBOLS,
} from '../../../utils/fixtures';
import { UNI_MAINNET } from '../../../utils/tokens';

describe('RfqQuoter test', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const getSpy = (nonce?: string) => jest.spyOn(axios, 'get').mockResolvedValue({ data: { nonce: nonce } });
  const postSpy = (responseData: DutchLimitQuoteJSON) =>
    jest.spyOn(axios, 'post').mockResolvedValue({ data: responseData });
  const quoter = new RfqQuoter(logger, 'https://api.uniswap.org/', 'https://api.uniswap.org/');

  describe('quote test', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      postSpy({
        chainId: 1,
        requestId: '123',
        quoteId: '321',
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

    it('returns null if rfq POST times out', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue(new Error('RfqQuoterErr'));
      const quote = (await quoter.quote(QUOTE_REQUEST_DL)) as DutchLimitQuote;
      expect(quote).toBeNull();
    })

    it('gracefully handles GET nonce error', async () => {
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('GET nonce error'));
      const quote = (await quoter.quote(QUOTE_REQUEST_DL)) as DutchLimitQuote;
      const nonce = BigNumber.from(quote?.toOrder().nonce);
      expect(nonce.gt(0) && nonce.lt(ethers.constants.MaxUint256)).toBeTruthy();
    });

    it('uses nonce returned by UniX service and increment by 1', async () => {
      getSpy('123');
      const quote = await quoter.quote(QUOTE_REQUEST_DL);
      expect(quote?.toJSON()).toMatchObject({
        nonce: '124',
      });
    });
  });

  describe('resolveTokenSymbols', () => {
    it('maps token symbols to addresses', async () => {
      const request = await QUOTE_REQUEST_DL_TOKEN_SYMBOLS.resolveTokenSymbols();
      expect(request.info.tokenIn).toEqual(UNI_MAINNET.address);
      expect(request.info.tokenOut).toEqual(WETH9[1].address);
    });

    it('maps one token symbol to addresses', async () => {
      const request = await QUOTE_REQUEST_DL_ONE_SYMBOL.resolveTokenSymbols();
      expect(request.info.tokenIn).toEqual(UNI_MAINNET.address);
      expect(request.info.tokenOut).toEqual(WETH9[1].address);
    });

    it('throws on unresolved token symbol', async () => {
      expect(async () => await QUOTE_REQUEST_DL_UNKNOWN_SYMBOLS.resolveTokenSymbols()).rejects.toThrow(
        'Could not find token with symbol ASDF'
      );
    });
  });
});
