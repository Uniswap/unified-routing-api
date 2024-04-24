import Logger from 'bunyan';

import { NATIVE_ADDRESS, RoutingType } from '../../../../../lib/constants';
import { RelayQuoteContext } from '../../../../../lib/entities';
import { Erc20__factory } from '../../../../../lib/types/ext/factories/Erc20__factory';
import { AMOUNT } from '../../../../constants';
import {
  createClassicQuote,
  createRelayQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  makeRelayRequest,
  QUOTE_REQUEST_RELAY,
} from '../../../../utils/fixtures';

describe('RelayQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  let provider: any;

  beforeAll(() => {
    jest.resetModules(); // Most important - it clears the cache

    jest.mock('../../../../../lib/types/ext/factories/Erc20__factory');
    Erc20__factory.connect = jest.fn().mockImplementation(() => {
      return {
        allowance: () => ({ gte: () => true }),
      };
    });
    provider = jest.fn();
  });

  function makeProviders() {
    return {
      rpcProvider: provider,
    };
  }

  describe('dependencies', () => {
    it('returns expected dependencies when output is weth', () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      const deps = context.dependencies();
      expect(deps.length).toEqual(2);
      // first is base
      expect(deps[0]).toEqual(QUOTE_REQUEST_RELAY);
      // second is classic
      expect(deps[1].info).toEqual(QUOTE_REQUEST_RELAY.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
    });

    it('returns expected dependencies when output is not weth', () => {
      const request = makeRelayRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new RelayQuoteContext(logger, request, makeProviders());
      const deps = context.dependencies();
      expect(deps.length).toEqual(2);
      // first is base
      expect(deps[0]).toEqual(request);
      // second is classic
      expect(deps[1].info).toEqual(request.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
    });
  });

  describe('resolve', () => {
    it('returns null if no dependencies given', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      expect(await context.resolve({})).toEqual(null);
    });

    it('returns null if quote key is not set properly', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      expect(
        await context.resolve({
          wrong: DL_QUOTE_EXACT_IN_BETTER,
        })
      ).toBeNull();
    });

    it('returns main quote if others are null', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());

      const relayQuote = createRelayQuote({ amountOut: AMOUNT }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_RELAY.key()]: relayQuote,
      });
      expect(quote).toMatchObject(relayQuote);
    });

    it('reconstructs quote from dependencies if main quote is null', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());

      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000', gasUseEstimateGasToken: '1' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.classicKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.RELAY);
    });

    it('returns null if quotes have 0 amountOut', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());

      const relayQuote = createRelayQuote({ amountOut: '0' }, 'EXACT_INPUT');
      expect(
        await context.resolve({
          [QUOTE_REQUEST_RELAY.key()]: relayQuote,
        })
      ).toBe(null);
    });

    it('returns relay quote if tokenIn is NATIVE_ADDRESS', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      const relayQuote = createRelayQuote({ tokenIn: NATIVE_ADDRESS, amountOut: '2' }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_RELAY.key()]: relayQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.RELAY);
      expect(quote?.amountOut.toString()).toEqual('2');
    });

    it('returns relay quote if tokenOut is NATIVE_ADDRESS', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      const relayQuote = createRelayQuote({ tokenOut: NATIVE_ADDRESS, amountOut: '2' }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_RELAY.key()]: relayQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.RELAY);
      expect(quote?.amountOut.toString()).toEqual('2');
    });
  });
});
