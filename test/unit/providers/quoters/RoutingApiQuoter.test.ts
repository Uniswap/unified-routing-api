import { AxiosError } from 'axios';
import NodeCache from 'node-cache';
import { ClassicQuote } from '../../../../lib/entities';
import { GetPortionResponse, GET_NO_PORTION_RESPONSE, PortionFetcher } from '../../../../lib/fetchers/PortionFetcher';
import { RoutingApiQuoter } from '../../../../lib/providers/quoters';
import axios from '../../../../lib/providers/quoters/helpers';
import { PORTION_BIPS, PORTION_RECIPIENT } from '../../../constants';
import {
  CLASSIC_QUOTE_DATA,
  CLASSIC_QUOTE_DATA_WITH_FOX_TAX,
  CLASSIC_QUOTE_DATA_WITH_PORTION,
  makeClassicRequest,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_CLASSIC_FE_ENABLE_FEE_ON_TRANSFER,
  QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION,
} from '../../../utils/fixtures';

describe('RoutingApiQuoter', () => {
  const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key');
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

    it('quote with portion with FE portion flag and BE portion flag', async () => {
      process.env.ENABLE_PORTION = 'true';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA_WITH_PORTION.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toEqual(PORTION_BIPS);
      expect(classicQuote.toJSON().portionRecipient).toEqual(PORTION_RECIPIENT);
    });

    it('quote with portion no FE flag', async () => {
      process.env.ENABLE_PORTION = 'true';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toBeUndefined;
      expect(classicQuote.toJSON().portionRecipient).toBeUndefined;
    });

    it('quote with portion no BE flag', async () => {
      process.env.ENABLE_PORTION = 'false';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toBeUndefined;
      expect(classicQuote.toJSON().portionRecipient).toBeUndefined;
    });

    it('quote with portion no bips with FE portion flag and BE portion flag', async () => {
      const portionResponse: GetPortionResponse = GET_NO_PORTION_RESPONSE;
      const portionCache = new NodeCache({ stdTTL: 600 });
      const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
      jest.spyOn(portionFetcher, 'getPortion').mockResolvedValue(portionResponse);
      const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key');

      process.env.ENABLE_PORTION = 'true';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toEqual(0);
      expect(classicQuote.toJSON().portionRecipient).toBeUndefined;
    });

    it('quote with portion no bips no FE flag', async () => {
      const portionResponse: GetPortionResponse = GET_NO_PORTION_RESPONSE;
      const portionCache = new NodeCache({ stdTTL: 600 });
      const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
      jest.spyOn(portionFetcher, 'getPortion').mockResolvedValue(portionResponse);
      const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key');

      process.env.ENABLE_PORTION = 'true';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toBeUndefined;
      expect(classicQuote.toJSON().portionRecipient).toBeUndefined;
    });

    it('quote with portion no bips no BE flag', async () => {
      const portionResponse: GetPortionResponse = GET_NO_PORTION_RESPONSE;
      const portionCache = new NodeCache({ stdTTL: 600 });
      const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
      jest.spyOn(portionFetcher, 'getPortion').mockResolvedValue(portionResponse);
      const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key');

      process.env.ENABLE_PORTION = 'false';
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      expect(classicQuote.toJSON().portionBips).toBeUndefined;
      expect(classicQuote.toJSON().portionRecipient).toBeUndefined;
    });

    it('quote with fee-on-transfer tax', async () => {
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA_WITH_FOX_TAX.quote });
      const response = await routingApiQuoter.quote(QUOTE_REQUEST_CLASSIC_FE_ENABLE_FEE_ON_TRANSFER);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      const classicQuote = response as ClassicQuote;

      // By strictly asserting the route equals the test setup route, which includes BULLET_WITH_TAX in both token out and pool reserve0,
      // we effectively assert that RoutingApiQuoter.quote now returns the FOT tax in the response payload
      expect(classicQuote.toJSON().route).toStrictEqual(CLASSIC_QUOTE_DATA_WITH_FOX_TAX.quote.route);
    });

    it('quote with x-request-source headers', async () => {
      const request = makeClassicRequest({});
      request.headers = { 'x-request-source': 'uniswap-ios' };
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(request);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      expect(axiosMock).toHaveBeenCalledWith(expect.any(String), {
        headers: expect.objectContaining({ 'x-request-source': 'uniswap-ios' }),
      });
    });

    it('quote with x-request-source and x-app-version headers', async () => {
      const request = makeClassicRequest({});
      request.headers = { 'x-request-source': 'uniswap-ios', 'x-app-version': '1.27' };
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(request);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      expect(axiosMock).toHaveBeenCalledWith(expect.any(String), {
        headers: expect.objectContaining({ 'x-request-source': 'uniswap-ios', 'x-app-version': '1.27' }),
      });
    });

    it('quote with x-request-source, x-app-version and aws-timestamp headers, ignores aws header', async () => {
      const request = makeClassicRequest({});
      request.headers = { 'x-request-source': 'uniswap-ios', 'x-app-version': '1.27', 'aws-timestamp': '12345678' };
      axiosMock.mockResolvedValue({ data: CLASSIC_QUOTE_DATA.quote });
      const response = await routingApiQuoter.quote(request);
      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(ClassicQuote);

      expect(axiosMock).toHaveBeenCalledWith(expect.any(String), {
        headers: { 'x-api-key': 'test-key', 'x-request-source': 'uniswap-ios', 'x-app-version': '1.27' },
      });
    });
  });

  describe('buildRequest', () => {
    it('properly builds query string', async () => {
      expect(await routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12&slippageTolerance=0.5&enableUniversalRouter=true'
      );
    });

    it('properly builds query string with FE portion flag and BE portion flag', () => {
      process.env.ENABLE_PORTION = 'true';

      expect(routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION)).toEqual(
        `https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12&slippageTolerance=0.5&enableUniversalRouter=true&portionBips=${PORTION_BIPS}&portionRecipient=${PORTION_RECIPIENT}`
      );
    });

    it('properly builds query string with only FE portion flag', () => {
      process.env.ENABLE_PORTION = 'false';

      expect(routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC_FE_SEND_PORTION)).toEqual(
        `https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12&slippageTolerance=0.5&enableUniversalRouter=true`
      );
    });

    it('properly builds query string with only BE portion flag', () => {
      process.env.ENABLE_PORTION = 'true';

      expect(routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12&slippageTolerance=0.5&enableUniversalRouter=true'
      );
    });
  });
});
