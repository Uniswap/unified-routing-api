import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';

import { BPS, NATIVE_ADDRESS, RoutingType } from '../../../../../lib/constants';
import { ClassicConfig, DutchQuote, DutchQuoteContext, DutchQuoteDataJSON } from '../../../../../lib/entities';
import { SyntheticStatusProvider } from '../../../../../lib/providers';
import { Erc20__factory } from '../../../../../lib/types/ext/factories/Erc20__factory';
import {
  AMOUNT,
  AMOUNT_GAS_ADJUSTED,
  AMOUNT_LARGE,
  AMOUNT_LARGE_GAS_ADJUSTED,
  AMOUNT_UNDER_GAS_THRESHOLD,
  CHAIN_OUT_ID,
  ETH_IN,
  TOKEN_IN,
} from '../../../../constants';
import {
  BASE_REQUEST_INFO_EXACT_IN,
  createClassicQuote,
  createDutchQuote,
  createDutchQuoteWithRequestOverrides,
  DL_QUOTE_EXACT_IN_BETTER,
  makeDutchRequest,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
} from '../../../../utils/fixtures';

describe('DutchQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  let provider: any;

  const OLD_ENV = process.env;

  const SyntheticStatusProviderMock = (syntheticEnabled: boolean): SyntheticStatusProvider => {
    const provider = {
      getStatus: jest.fn(),
    };

    provider.getStatus.mockResolvedValue({ syntheticEnabled });
    return provider as unknown as SyntheticStatusProvider;
  };

  beforeAll(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = {
      ...OLD_ENV,
    }; // Make a copy

    jest.mock('../../../../../lib/types/ext/factories/Erc20__factory');
    Erc20__factory.connect = jest.fn().mockImplementation(() => {
      return {
        allowance: () => ({ gte: () => true }),
      };
    });
    provider = jest.fn();
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  function makeProviders(syntheticEnabled: boolean) {
    return {
      rpcProvider: provider,
      syntheticStatusProvider: SyntheticStatusProviderMock(syntheticEnabled),
    };
  }

  describe('dependencies', () => {
    it('returns expected dependencies when output is weth', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const deps = context.dependencies();
      expect(deps.length).toEqual(2);
      // first is base
      expect(deps[0]).toEqual(QUOTE_REQUEST_DL);
      // second is classic
      expect(deps[1].info).toEqual(QUOTE_REQUEST_DL.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
      const classicRequestConfig = deps[1].config as ClassicConfig;
      expect(classicRequestConfig.enableUniversalRouter).toEqual(QUOTE_REQUEST_CLASSIC.config.enableUniversalRouter);
    });

    it('returns expected dependencies when output is not weth', () => {
      const request = makeDutchRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const deps = context.dependencies();
      expect(deps.length).toEqual(2);
      // first is base
      expect(deps[0]).toEqual(request);
      // second is classic
      expect(deps[1].info).toEqual(request.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
      const classicRequestConfig = deps[1].config as ClassicConfig;
      expect(classicRequestConfig.enableUniversalRouter).toEqual(QUOTE_REQUEST_CLASSIC.config.enableUniversalRouter);
    });
  });

  describe('resolve', () => {
    it('returns null if no dependencies given', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      expect(await context.resolve({})).toEqual(null);
    });

    it('returns null if quote key is not set properly', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      expect(
        await context.resolve({
          wrong: DL_QUOTE_EXACT_IN_BETTER,
        })
      ).toBeNull();
    });

    it('returns main quote if others are null', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: AMOUNT, filler }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toMatchObject(rfqQuote);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(filler);
    });

    it('returns null if quotes have 0 amountOut', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '0', filler }, 'EXACT_INPUT');
      expect(
        await context.resolve({
          [QUOTE_REQUEST_DL.key()]: rfqQuote,
        })
      ).toBe(null);
    });

    it('returns null if tokenIn is not in tokenlist', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const rfqQuote = createDutchQuote(
        { tokenIn: '0x1111111111111111111111111111111111111111', amountOut: '2' },
        'EXACT_INPUT'
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toBeNull();
    });

    it('returns null if tokenOut is not in tokenlist', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const rfqQuote = createDutchQuote(
        { tokenOut: '0x1111111111111111111111111111111111111111', amountOut: '2' },
        'EXACT_INPUT'
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toBeNull();
    });

    it('returns rfq quote if tokenIn is NATIVE_ADDRESS', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const rfqQuote = createDutchQuote({ tokenIn: NATIVE_ADDRESS, amountOut: '2' }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      expect(quote?.amountOut.toString()).toEqual('2');
    });

    it('returns rfq quote if tokenOut is NATIVE_ADDRESS', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const rfqQuote = createDutchQuote({ tokenOut: NATIVE_ADDRESS, amountOut: '2' }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      expect(quote?.amountOut.toString()).toEqual('2');
    });

    it('overrides auctionPeriodSec on mainnet', async () => {
      const req = makeDutchRequest({ tokenInChainId: 1, tokenOutChainId: 1 }, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, req, makeProviders(false));
      const rfqQuote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: 1 },
        'EXACT_INPUT',
        '1'
      );
      const classicQuote = createClassicQuote(
        { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
        { type: 'EXACT_INPUT', tokenInChainId: 1, tokenOutChainId: 1 }
      );
      const quote = await context.resolve({
        [req.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).auctionPeriodSecs).toBe(120);
    });

    it('does not override auctionPeriodSec on non-mainnet chains', async () => {
      const req = makeDutchRequest({ tokenInChainId: 137, tokenOutChainId: 137 }, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, req, makeProviders(false));
      const rfqQuote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: 137 },
        'EXACT_INPUT',
        '1'
      );
      const classicQuote = createClassicQuote(
        { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
        { type: 'EXACT_INPUT', tokenInChainId: 137, tokenOutChainId: 137 }
      );
      const quote = await context.resolve({
        [req.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).auctionPeriodSecs).toBe(60);
    });

    it('uses synthetic if better with useSyntheticQuotes=true and switch=false', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      // Synthetic starts at quoteGasAdjusted + 1bp
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });

    it('uses synthetic if better with useSyntheticQuotes=true and switch=true', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, request, makeProviders(true));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      // Synthetic starts at quoteGasAdjusted + 1bp
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });

    it('uses synthetic if better with useSyntheticQuotes=false and switch=true', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, makeProviders(true));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      // Synthetic starts at quoteGasAdjusted + 1bp
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });

    it('does not use synthetic if better with useSyntheticQuotes=false and switch=false', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '9999000009', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(filler);
    });

    it('uses synthetic if rfq quote is at least 300% better than classic; EXACT_IN', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '400000000', filler }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: '100000000', quoteGasAdjusted: '90000000' },
        { type: 'EXACT_INPUT' }
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });

      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      // Synthetic starts at quoteGasAdjusted + 1bp
      const expected = BigNumber.from(90000000)
        .mul(BPS + DutchQuote.defaultPriceImprovementBps)
        .div(BPS)
        .toString();
      expect(quote?.amountOut.toString()).toEqual(expected);
    });

    it('uses synthetic if rfq quote is at least 300% better than classic; EXACT_OUT', async () => {
      const request = makeDutchRequest({ type: 'EXACT_OUTPUT' }, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountIn: '100000000', filler }, 'EXACT_OUTPUT');
      const classicQuote = createClassicQuote(
        { quote: '400000000', quoteGasAdjusted: '399000000' },
        { type: 'EXACT_OUTPUT' }
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });

      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      // Synthetic starts at quoteGasAdjusted + 1bp
      const expected = BigNumber.from(399000000)
        .mul(BPS - DutchQuote.defaultPriceImprovementBps)
        .div(BPS)
        .toString();
      expect(quote?.amountIn.toString()).toEqual(expected);
    });

    it('skips UniswapX if rfq quote is at least 300% better than clasic; EXACT_IN, skipSynthetic', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '400000000', filler }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: '100000000', quoteGasAdjusted: '90000000' },
        { type: 'EXACT_INPUT' }
      );
      expect(
        await context.resolve({
          [QUOTE_REQUEST_DL.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
          [context.routeToNativeKey]: classicQuote,
        })
      ).toEqual(null);
    });

    it('skips UniswapX if rfq quote is at least 300% better than clasic; EXACT_OUT, skipSynthetic', async () => {
      const request = makeDutchRequest({ type: 'EXACT_OUTPUT' }, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountIn: '100000000', filler }, 'EXACT_OUTPUT');
      const classicQuote = createClassicQuote(
        { quote: '400000000', quoteGasAdjusted: '399000000' },
        { type: 'EXACT_OUTPUT' }
      );
      expect(
        await context.resolve({
          [QUOTE_REQUEST_DL.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
          [context.routeToNativeKey]: classicQuote,
        })
      ).toEqual(null);
    });
    it('filters out zero amountOut quotes in favor of others', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '0', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      // Synthetic starts at quoteGasAdjusted + 1bp
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });

    it('skips synthetic if useSyntheticQuotes = false', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1000000000000000000', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '1000000000000000000', quoteGasAdjusted: '999900000000000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(filler);
    });

    it('skips synthetic if no route to eth', async () => {
      const request = makeDutchRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1000000000000000000', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '1000000000000000000', quoteGasAdjusted: '999900000000000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.request).toMatchObject(rfqQuote.request);
      expect(quote?.amountIn).toEqual(rfqQuote?.amountIn);
      expect(quote?.amountOut).toEqual(rfqQuote?.amountOut);
    });

    it('skips rfq if reparameterization makes the decay inverted', async () => {
      const request = makeDutchRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote).toBeNull();
    });

    it('keeps synthetic if output is weth', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const native = WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(1)].address;
      const rfqQuote = createDutchQuote({ amountOut: '1', tokenOut: native, filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });

    it('returns no DL quotes if classic provided does not meet gas threshold', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      context.dependencies();
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: AMOUNT, filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: AMOUNT, quoteGasAdjusted: AMOUNT_UNDER_GAS_THRESHOLD },
        { type: 'EXACT_INPUT' }
      );

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote).toBeNull();
    });

    it('still returns DL rfq quote if classic is not provided', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
      context.dependencies();
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: AMOUNT, filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: AMOUNT, quoteGasAdjusted: AMOUNT_UNDER_GAS_THRESHOLD },
        { type: 'EXACT_INPUT' }
      );

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote).toMatchObject(rfqQuote);
    });

    it('applies less overhead for ETH in if WETH approved on Permit2', async () => {
      const request = makeDutchRequest({
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
      });

      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuoteWithRequestOverrides(
        { tokenIn: ETH_IN, tokenOut: TOKEN_IN, amountOut: AMOUNT, filler },
        {
          tokenIn: ETH_IN,
          tokenOut: TOKEN_IN,
          type: 'EXACT_INPUT',
        }
      );
      const classicQuote = createClassicQuote(
        { quote: AMOUNT, quoteGasAdjusted: AMOUNT_GAS_ADJUSTED },
        { tokenIn: ETH_IN, tokenOut: TOKEN_IN, type: 'EXACT_INPUT' }
      );

      // Get quote when user has *not* apprroved Permit2
      Erc20__factory.connect = jest.fn().mockImplementation(() => {
        return {
          allowance: () => ({ gte: () => false }),
        };
      });

      let context = new DutchQuoteContext(logger, request, makeProviders(false));
      context.dependencies();

      const nonApprovedQuote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });

      // Get quote when user has approved Permit2.
      Erc20__factory.connect = jest.fn().mockImplementation(() => {
        return {
          allowance: () => ({ gte: () => true }),
        };
      });

      context = new DutchQuoteContext(logger, request, makeProviders(false));
      context.dependencies();

      const approvedQuote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });

      // Non approved quote, approved quote, and rfq quote should be
      // the same except for different amount outs due to diff eth adjustments
      expect({
        ...nonApprovedQuote,
        amountOutStart: expect.any(BigNumber),
        amountOutEnd: expect.any(BigNumber),
      }).toMatchObject({
        ...rfqQuote,
        amountOutStart: expect.any(BigNumber),
        amountOutEnd: expect.any(BigNumber),
        portion: {
          bips: 0,
          recipient: '0x0000000000000000000000000000000000000000',
          type: 'flat',
        },
        derived: {
          largeTrade: true,
        },
      });

      expect({
        ...approvedQuote,
        amountOutStart: expect.any(BigNumber),
        amountOutEnd: expect.any(BigNumber),
      }).toMatchObject({
        ...rfqQuote,
        amountOutStart: expect.any(BigNumber),
        amountOutEnd: expect.any(BigNumber),
        portion: {
          bips: 0,
          recipient: '0x0000000000000000000000000000000000000000',
          type: 'flat',
        },
        derived: {
          largeTrade: true,
        },
      });

      // Expect adjustment to amount out because of ETH in
      expect(nonApprovedQuote!.amountOut.lt(rfqQuote.amountOut));
      expect(approvedQuote!.amountOut.lt(rfqQuote.amountOut));

      // If not approved, the adjustment should be bigger than if approved.
      expect(nonApprovedQuote!.amountOut.lt(approvedQuote!.amountOut)).toEqual(true);
    });
  });

  describe('hasOrderSize', () => {
    describe('exactIn', () => {
      it('returns true if quote == quoteGasAdjusted', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));
        const amountOut = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.toString() },
          { type: 'EXACT_INPUT' }
        );
        const hasSize = context.hasOrderSize(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns true if amountOut * 5% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));

        const amountOut = ethers.utils.parseEther('1');
        const fivePercent = amountOut.mul(5).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(fivePercent).toString() },
          { type: 'EXACT_INPUT' }
        );

        const hasSize = context.hasOrderSize(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns false if amountOut * 55% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));

        const amountOut = ethers.utils.parseEther('1');
        const gas = amountOut.mul(55).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(gas).toString() },
          { type: 'EXACT_INPUT' }
        );

        const hasSize = context.hasOrderSize(logger, classicQuote);
        expect(hasSize).toEqual(false);
      });
    });

    describe('exactOut', () => {
      it('returns true if amountIn * 5% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));

        const amountIn = ethers.utils.parseEther('1');
        const fivePercent = amountIn.mul(5).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(fivePercent).toString() },
          { type: 'EXACT_OUTPUT' }
        );

        const hasSize = context.hasOrderSize(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns false if amountIn * 55% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, makeProviders(false));

        const amountIn = ethers.utils.parseEther('1');
        const gas = amountIn.mul(55).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(gas).toString() },
          { type: 'EXACT_OUTPUT' }
        );

        const hasSize = context.hasOrderSize(logger, classicQuote);
        expect(hasSize).toEqual(false);
      });
    });
  });

  describe('needsRouteToNative', () => {
    it('if native tokenOut, needsRouteToNative is false and resolves to synethtic quote', async () => {
      const request = makeDutchRequest(
        {},
        { useSyntheticQuotes: true },
        { ...BASE_REQUEST_INFO_EXACT_IN, tokenOut: NATIVE_ADDRESS }
      );
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuoteWithRequestOverrides(
        { amountOut: '1', filler, tokenOut: NATIVE_ADDRESS },
        { type: 'EXACT_INPUT' }
      );
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT', tokenOut: NATIVE_ADDRESS }
      );
      context.dependencies();
      expect(context.needsRouteToNative).toBe(false);
      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      // Synthetic starts at quoteGasAdjusted + 1bp
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });

    it('if wrapped native tokenOut, needsRouteToNative is false and resolves to synthetic quote', async () => {
      const request = makeDutchRequest(
        {},
        { useSyntheticQuotes: true },
        { ...BASE_REQUEST_INFO_EXACT_IN, tokenOut: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_OUT_ID)].address }
      );
      const context = new DutchQuoteContext(logger, request, makeProviders(false));
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuoteWithRequestOverrides(
        { amountOut: '1', filler, tokenOut: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_OUT_ID)].address },
        { type: 'EXACT_INPUT' }
      );
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '9999000000' },
        { type: 'EXACT_INPUT', tokenOut: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(CHAIN_OUT_ID)].address }
      );
      context.dependencies();
      expect(context.needsRouteToNative).toBe(false);
      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
      // Synthetic starts at quoteGasAdjusted + 1bp
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(9999000000)
          .mul(BPS + DutchQuote.defaultPriceImprovementBps)
          .div(BPS)
          .toString()
      );
    });
  });
});
