import { BigNumber, ethers } from 'ethers';

import NodeCache from 'node-cache';
import { BPS } from '../../../../lib/constants';
import { DutchQuote, DutchQuoteDataJSON, DutchQuoteJSON } from '../../../../lib/entities';
import { GetPortionResponse, PortionFetcher, PortionType } from '../../../../lib/fetchers/PortionFetcher';
import { RfqQuoter } from '../../../../lib/providers';
import axios from '../../../../lib/providers/quoters/helpers';
import {
  AMOUNT,
  FLAT_PORTION,
  PORTION_BIPS,
  PORTION_RECIPIENT,
  SWAPPER,
  TOKEN_IN,
  TOKEN_OUT,
} from '../../../constants';
import {
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_DL_EXACT_OUT,
  QUOTE_REQUEST_DL_EXACT_OUT_WITH_PORTION,
  QUOTE_REQUEST_DL_FE_SEND_PORTION,
} from '../../../utils/fixtures';

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
  jest.spyOn(portionFetcher, 'getPortion').mockResolvedValue(portionResponse);
  const quoter = new RfqQuoter('https://api.uniswap.org/', 'https://api.uniswap.org/', 'test-api-key');

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

    it('sets numOutputs to 2 if portionEnabled', async () => {
      process.env.ENABLE_PORTION = 'true';
      await quoter.quote(QUOTE_REQUEST_DL_FE_SEND_PORTION);
      expect(axios.post).toBeCalledWith(
        'https://api.uniswap.org/quote',
        expect.objectContaining({
          numOutputs: 2,
        }),
        expect.anything()
      );
    });

    it('sets numOutputs to 1 if either FE or BE portion flag is set to false', async () => {
      process.env.ENABLE_PORTION = 'false';
      await quoter.quote(QUOTE_REQUEST_DL_FE_SEND_PORTION);
      expect(axios.post).toBeCalledWith(
        'https://api.uniswap.org/quote',
        expect.objectContaining({
          numOutputs: 1,
        }),
        expect.anything()
      );

      process.env.ENABLE_PORTION = 'true';
      await quoter.quote(QUOTE_REQUEST_DL);
      expect(axios.post).toBeCalledWith(
        'https://api.uniswap.org/quote',
        expect.objectContaining({
          numOutputs: 1,
        }),
        expect.anything()
      );
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
      const quote = await quoter.quote(QUOTE_REQUEST_DL_FE_SEND_PORTION);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
      expect(quote).toBeInstanceOf(DutchQuote);
      expect((quote as DutchQuote).portion?.bips).toEqual(portionResponse.portion?.bips);
      expect((quote as DutchQuote).portion?.recipient).toEqual(portionResponse.portion?.recipient);
    });

    it('returns EXACT_INPUT quote with portion', async () => {
      process.env.ENABLE_PORTION = 'true';

      const quote = await quoter.quote(QUOTE_REQUEST_DL_FE_SEND_PORTION);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
      expect(quote).toBeInstanceOf(DutchQuote);
      expect((quote as DutchQuote).portion?.bips).toEqual(portionResponse.portion?.bips);
      expect((quote as DutchQuote).portion?.recipient).toEqual(portionResponse.portion?.recipient);

      expect(
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
        })
      ).toHaveBeenCalledWith(
        'https://api.uniswap.org/quote',
        {
          tokenInChainId: 1,
          tokenOutChainId: 1,
          tokenIn: TOKEN_IN,
          tokenOut: TOKEN_OUT,
          amount: AMOUNT,
          swapper: SWAPPER,
          requestId: 'requestId',
          type: 'EXACT_INPUT',
          numOutputs: 2,
          protocol: 'v1',
        },
        { headers: { 'x-api-key': 'test-api-key' } }
      );
    });

    it('returns EXACT_OUTPUT quote with portion', async () => {
      process.env.ENABLE_PORTION = 'true';

      const quote = await quoter.quote(QUOTE_REQUEST_DL_EXACT_OUT_WITH_PORTION);
      expect(quote).toMatchObject({
        chainId: 1,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountInStart: BigNumber.from(AMOUNT),
        amountOutStart: BigNumber.from(AMOUNT),
      });
      expect(quote).toBeInstanceOf(DutchQuote);
      expect((quote as DutchQuote).portion?.bips).toEqual(portionResponse.portion?.bips);
      expect((quote as DutchQuote).portion?.recipient).toEqual(portionResponse.portion?.recipient);

      expect(
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
        })
      ).toHaveBeenCalledWith(
        'https://api.uniswap.org/quote',
        {
          tokenInChainId: 1,
          tokenOutChainId: 1,
          tokenIn: TOKEN_IN,
          tokenOut: TOKEN_OUT,
          amount: BigNumber.from(AMOUNT).add(BigNumber.from(AMOUNT).mul(FLAT_PORTION.bips).div(BPS)).toString(),
          swapper: SWAPPER,
          requestId: 'requestId',
          type: 'EXACT_OUTPUT',
          numOutputs: 2,
          protocol: 'v1',
        },
        { headers: { 'x-api-key': 'test-api-key' } }
      );
    });
  });
});
