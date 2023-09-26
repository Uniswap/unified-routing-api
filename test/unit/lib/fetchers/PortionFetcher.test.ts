import { GET_NO_PORTION_RESPONSE, PortionFetcher } from '../../../../lib/fetchers/PortionFetcher';
import axios from '../../../../lib/providers/quoters/helpers';
import { AxiosInstance } from 'axios';

describe('PortionFetcher Unit Tests', () => {
  process.env.PORTION_FLAG = 'true';
  const tokenInChainId = 1;
  const tokenOutChainId = 1;
  const tokenInAddress = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
  const tokenOutAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  it('Portion Service returns portion data', async () => {
    const portionResponse = {
      hasPortion: true,
      portion: {
        bips: 5,
        receiver: "0x0000000",
        type: "flat",
      }
    }

    const createSpy = jest.spyOn(axios, 'create');
    // @ts-ignore
    const axiosInstanceMock: AxiosInstance = {
      get: jest.fn().mockResolvedValue({ data: portionResponse }),
      // You can optionally mock other methods here, such as post, put, etc.
    };
    createSpy.mockReturnValueOnce(axiosInstanceMock);

    const portionFetcher = new PortionFetcher('https://portion.uniswap.org/');
    const portionData = await portionFetcher.getPortion(tokenInChainId, tokenOutChainId, tokenInAddress, tokenOutAddress);
    expect(portionData.hasPortion).toEqual(true);

    if (portionData.hasPortion) {
      expect(portionData.portion.bips).toEqual(portionResponse.portion.bips);
      expect(portionData.portion.receiver).toEqual(portionResponse.portion.receiver);
      expect(portionData.portion.type).toEqual(portionResponse.portion.type);
    }
  });

  it('Portion Service returns no portion data', async () => {
    const createSpy = jest.spyOn(axios, 'create');
    // @ts-ignore
    const axiosInstanceMock: AxiosInstance = {
      get: jest.fn().mockResolvedValue({ data: GET_NO_PORTION_RESPONSE }),
      // You can optionally mock other methods here, such as post, put, etc.
    };
    createSpy.mockReturnValueOnce(axiosInstanceMock);

    const portionFetcher = new PortionFetcher('https://portion.uniswap.org/');
    const portionData = await portionFetcher.getPortion(tokenInChainId, tokenOutChainId, tokenInAddress, tokenOutAddress);
    expect(portionData.hasPortion).toEqual(GET_NO_PORTION_RESPONSE.hasPortion);
  });
});