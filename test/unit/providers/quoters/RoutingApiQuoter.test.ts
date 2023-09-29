import { AxiosError } from 'axios';
import { PortionFetcher } from '../../../../lib/fetchers/PortionFetcher';
import { RoutingApiQuoter } from '../../../../lib/providers/quoters';
import { DefaultPortionProvider } from '../../../../lib/providers';
import axios from '../../../../lib/providers/quoters/helpers';
import { QUOTE_REQUEST_CLASSIC } from '../../../utils/fixtures';
import { TokenFetcher } from '../../../../lib/fetchers/TokenFetcher';
import NodeCache from 'node-cache';

describe('RoutingApiQuoter', () => {
  const portionCache = new NodeCache({ stdTTL: 600 });
  const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
  const tokenFetcher = new TokenFetcher();
  const portionProvider = new DefaultPortionProvider(portionFetcher, tokenFetcher);
  const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key', portionProvider);
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
  });

  describe('buildRequest', () => {
    it('properly builds query string', async () => {
      expect(await routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12'
      );
    });
  });
});
