import { AxiosError } from 'axios';
import NodeCache from 'node-cache';
import { ClassicQuote } from '../../../../lib/entities';
import { GetPortionResponse, PortionFetcher, PortionType } from '../../../../lib/fetchers/PortionFetcher';
import { TokenFetcher } from '../../../../lib/fetchers/TokenFetcher';
import { PortionProvider } from '../../../../lib/providers';
import { RoutingApiQuoter } from '../../../../lib/providers/quoters';
import axios from '../../../../lib/providers/quoters/helpers';
import { PORTION_BIPS, PORTION_RECIPIENT } from '../../../constants';
import { CLASSIC_QUOTE_DATA, QUOTE_REQUEST_CLASSIC } from '../../../utils/fixtures';

describe('RoutingApiQuoter', () => {
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
  const tokenFetcher = new TokenFetcher();
  const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key', portionProvider, tokenFetcher);
  const axiosMock = jest.spyOn(axios, 'get');

  describe('quote', () => {
    it('throws error on quote request non-axios error', async () => {
      const standardError = new Error('Failed fetching route');
      axiosMock.mockRejectedValue(standardError);
      await expect(routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC)).rejects.toThrow(standardError);
    });

    it('throws error on quote request 5xx', async () => {
      const axiosError = new AxiosError('Failed fetching route', '502', {} as any, {}, {
        status: 502,
      } as any);
      axiosMock.mockRejectedValue(axiosError);
      await expect(routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC)).rejects.toThrow(axiosError);
    });

    it('throws error on quote request 500', async () => {
      const axiosError = new AxiosError('Failed fetching route', '500', {} as any, {}, {
        status: 500,
      } as any);
      axiosMock.mockRejectedValue(axiosError);
      await expect(routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC)).rejects.toThrow(axiosError);
    });

    it('throws error on quote request 429', async () => {
      const axiosError = new AxiosError('Failed fetching route', '429', {} as any, {}, {
        status: 429,
      } as any);
      axiosMock.mockRejectedValue(axiosError);
      await expect(routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC)).rejects.toThrow(axiosError);
    });

    it('does not throw error on quote request 404', async () => {
      const axiosError = new AxiosError('Failed fetching route', '404', {} as any, {}, {
        status: 404,
      } as any);
      axiosMock.mockRejectedValue(axiosError);
      await expect(routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC)).resolves.toBeNull();
    });

    it('quote with portion', async () => {
      process.env.ENABLE_PORTION = 'true';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toEqual(PORTION_BIPS);
      expect(classicQuote.toJSON().portionAmount).toEqual(PORTION_BIPS);
    });
  });

  describe('buildRequest', () => {
    it('properly builds query string', async () => {
      expect(await routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12'
      );
    });
  });
});
