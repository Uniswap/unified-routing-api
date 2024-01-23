import Logger from 'bunyan';

import { NATIVE_ADDRESS, RoutingType } from '../../../../../lib/constants';
import { RelayQuoteContext } from '../../../../../lib/entities';
import { Erc20__factory } from '../../../../../lib/types/ext/factories/Erc20__factory';
import {
  AMOUNT,
  AMOUNT_UNDER_GAS_THRESHOLD,
} from '../../../../constants';
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

    it('returns null if quotes have 0 amountOut', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      
      const relayQuote = createRelayQuote({ amountOut: '0' }, 'EXACT_INPUT');
      expect(
        await context.resolve({
          [QUOTE_REQUEST_RELAY.key()]: relayQuote,
        })
      ).toBe(null);
    });

    // TODO:
    xit('returns null if tokenIn is not in tokenlist', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      const relayQuote = createRelayQuote(
        { tokenIn: '0x1111111111111111111111111111111111111111', amountOut: '2' },
        'EXACT_INPUT'
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_RELAY.key()]: relayQuote,
      });
      expect(quote).toBeNull();
    });

    // TODO:
    xit('returns null if tokenOut is not in tokenlist', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      const relayQuote = createRelayQuote(
        { tokenOut: '0x1111111111111111111111111111111111111111', amountOut: '2' },
        'EXACT_INPUT'
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_RELAY.key()]: relayQuote,
      });
      expect(quote).toBeNull();
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

    it('filters out zero amountOut quotes in favor of others', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      
      const relayQuote = createRelayQuote({ amountOut: '0' }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: relayQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.RELAY);
    });

    it('skips relay if reparameterization makes the decay inverted', async () => {
      const request = makeRelayRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new RelayQuoteContext(logger, request, makeProviders());
      
      const relayQuote = createRelayQuote({ amountOut: '1' }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: relayQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote).toBeNull();
    });

    it('still returns DL relay quote if classic is not provided', async () => {
      const context = new RelayQuoteContext(logger, QUOTE_REQUEST_RELAY, makeProviders());
      context.dependencies();
      
      const relayQuote = createRelayQuote({ amountOut: AMOUNT }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: AMOUNT, quoteGasAdjusted: AMOUNT_UNDER_GAS_THRESHOLD },
        { type: 'EXACT_INPUT' }
      );

      const quote = await context.resolve({
        [context.requestKey]: relayQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote).toMatchObject(relayQuote);
    });
  });
});
