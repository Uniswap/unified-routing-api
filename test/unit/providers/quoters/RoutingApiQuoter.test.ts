import { RoutingApiQuoter } from '../../../../lib/providers/quoters';
import { QUOTE_REQUEST_CLASSIC } from '../../../utils/fixtures';

describe('RoutingApiQuoter', () => {
  const routingApiQuoter = new RoutingApiQuoter('https://api.uniswap.org/', 'test-key');

  describe('buildRequest', () => {
    it('properly builds query string', () => {
      expect(routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&protocols=v3&gasPriceWei=12'
      );
    });
  });
});
