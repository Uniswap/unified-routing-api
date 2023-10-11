import { BigNumber, ethers } from 'ethers';

import NodeCache from 'node-cache';
import { DutchQuote, DutchQuoteDataJSON, DutchQuoteJSON } from '../../../../lib/entities';
import { GetPortionResponse, PortionFetcher, PortionType } from '../../../../lib/fetchers/PortionFetcher';
import { PortionProvider, RfqQuoter } from '../../../../lib/providers';
import axios from '../../../../lib/providers/quoters/helpers';
import { AMOUNT, PORTION_BIPS, PORTION_RECIPIENT, SWAPPER, TOKEN_IN, TOKEN_OUT } from '../../../constants';
import { QUOTE_REQUEST_DL, QUOTE_REQUEST_DL_EXACT_OUT } from '../../../utils/fixtures';

const UUID = 'c67c2882-24aa-4a68-a90b-53250ef81517';

describe('RfqQuoter test', () => {
  const getSpy = (nonce?: string) => {
    return jest.spyOn(axios, 'get').mockResolvedValue({ data: { nonce: nonce } });
  };
  const postSpy = (responseData: DutchQuoteJSON) => jest.spyOn(axios, 'post').mockResolvedValue({ data: responseData });

  const portionResponse: GetPortionResponse = {
    hasPortion: true,
    portion: {
      bips: PORTION_BIPS,
      recipient: PORTION_RECIPIENT,
      type: PortionType.Flat,
    },
  };
  const portionCache = new NodeCache({ stdTTL: 600 });
  const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
  const portionProvider = new PortionProvider(portionFetcher);
  jest.spyOn(portionFetcher, 'getPortion').mockResolvedValue(portionResponse);
  const quoter = new RfqQuoter('https://api.uniswap.org/', 'https://api.uniswap.org/', 'test-api-key', portionProvider);

  describe('quote test', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      postSpy({
        chainId: 1,
        requestId: UUID,
        quoteId: UUID,
        tokenIn: TOKEN_IN,
        amountIn: AMOUNT,
        tokenOut: TOKEN_OUT,
        amountOut: AMOUNT,
        swapper: SWAPPER,
        filler: SWAPPER,
      });
      process.env.ENABLE_PORTION = undefined;
    });

    it('returns null if quote response is invalid', async () => {
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          chainId: 1,
          requestId: UUID,
          quoteId: UUID,
          tokenIn: TOKEN_IN,
          amountIn: AMOUNT,
          tokenOut: TOKEN_OUT,
          amountOut: AMOUNT,
          swapper: SWAPPER,
        },
      });
      const quote = await quoter.quote(QUOTE_REQUEST_DL);
      expect(quote).toBeNull();
    });

    it('returns EXACT_INPUT quote', async () => {
      const quote = await quoter.quote(QUOTE_REQUEST_DL);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
    });

    it('returns EXACT_OUTPUT quote', async () => {
      const quote = await quoter.quote(QUOTE_REQUEST_DL_EXACT_OUT);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
    });

    it('returns null if rfq POST times out', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue(new Error('RfqQuoterErr'));
      const quote = (await quoter.quote(QUOTE_REQUEST_DL)) as DutchQuote;
      expect(quote).toBeNull();
    });

    it('gracefully handles GET nonce error', async () => {
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('GET nonce error'));
      const quote = (await quoter.quote(QUOTE_REQUEST_DL)) as DutchQuote;
      const nonce = BigNumber.from(quote.nonce);
      expect(nonce.gt(0) && nonce.lt(ethers.constants.MaxUint256)).toBeTruthy();
    });

    it('uses nonce returned by UniX service and increment by 1', async () => {
      getSpy('123');
      const quote = await quoter.quote(QUOTE_REQUEST_DL);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo).toMatchObject({
        nonce: '124',
      });
    });

    it('get nonce by address and chainId', async () => {
      const spy = getSpy('123');
      await quoter.quote(QUOTE_REQUEST_DL);
      expect(spy).toBeCalledWith(
        'https://api.uniswap.org/dutch-auction/nonce?address=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&chainId=1'
      );
    });

    it('returns EXACT_INPUT quote with portion', async () => {
      const quote = await quoter.quote(QUOTE_REQUEST_DL);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
      expect(quote).toBeInstanceOf(DutchQuote);
      expect((quote as DutchQuote).portionBips).toEqual(portionResponse.portion?.bips);
      expect((quote as DutchQuote).portionRecipient).toEqual(portionResponse.portion?.recipient);
    });

    it('returns EXACT_OUTPUT quote with portion', async () => {
      process.env.ENABLE_PORTION = 'true';

      const quote = await quoter.quote(QUOTE_REQUEST_DL_EXACT_OUT);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
      expect(quote).toBeInstanceOf(DutchQuote);
      expect((quote as DutchQuote).portionBips).toEqual(portionResponse.portion?.bips);
      expect((quote as DutchQuote).portionRecipient).toEqual(portionResponse.portion?.recipient);
    });
  });
});
