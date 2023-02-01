import { default as Logger } from 'bunyan';

import { QuoteRequest } from '../../lib/entities/QuoteRequest';
import { ClassicConfig } from '../../lib/entities/routing';
import { RoutingApiQuoter } from '../../lib/quoters';

const CLASSIC_QUOTE = QuoteRequest.fromRequestBody({
  tokenInChainId: 1,
  tokenOutChainId: 1,
  requestId: '1',
  tokenIn: '0x6b175474e89094c44da98b954eedeac495271d0f',
  tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  amount: '1000000000000000000',
  tradeType: 'exactIn',
  configs: [
    {
      routingType: 'CLASSIC',
      gasPriceWei: '10000',
      protocols: ['v3'],
    },
  ],
});

describe('RoutingApiQuoter', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  const routingApiQuoter = new RoutingApiQuoter(logger, 'https://api.uniswap.org/');

  describe('buildRequest', () => {
    it('properly builds query string', () => {
      expect(routingApiQuoter.buildRequest(CLASSIC_QUOTE, CLASSIC_QUOTE.configs[0] as ClassicConfig)).toEqual(
        'https://api.uniswap.org/quote?tokenInAddress=0x6b175474e89094c44da98b954eedeac495271d0f&tokenInChainId=1&tokenOutAddress=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&tokenOutChainId=1&amount=1000000000000000000&type=exactOut&gasPriceWei=10000'
      );
    });
  });
});
