import { default as Logger } from 'bunyan';

import { RoutingApiQuoter } from '../../../lib/providers/quoters';
import { QUOTE_REQUEST_CLASSIC } from '../../utils/fixtures';

describe('RoutingApiQuoter', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  const routingApiQuoter = new RoutingApiQuoter(logger, 'https://api.uniswap.org/');

  describe('buildRequest', () => {
    it('properly builds query string', () => {
      expect(routingApiQuoter.buildRequest(QUOTE_REQUEST_CLASSIC)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984&tokenInChainId=1&tokenOutAddress=0x6B175474E89094C44Da98b954EedeAC495271d0F&tokenOutChainId=1&amount=1000000000000000000&type=exactIn&gasPriceWei=12'
      );
    });
  });
});
