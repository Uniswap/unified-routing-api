import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';

import { RoutingType } from '../../../../../lib/constants';
import { DutchQuote, DutchQuoteContext, DutchQuoteDataJSON } from '../../../../../lib/entities';
import { Erc20__factory } from '../../../../../lib/types/ext/factories/Erc20__factory';
import {
  AMOUNT,
  AMOUNT_GAS_ADJUSTED,
  AMOUNT_UNDER_GAS_THRESHOLD,
  CHAIN_IN_ID,
  CHAIN_OUT_ID,
  ETH_IN,
  INELIGIBLE_TOKEN,
  SWAPPER,
  TOKEN_IN,
  TOKEN_OUT,
} from '../../../../constants';
import {
  createClassicQuote,
  createDutchQuote,
  createDutchQuoteWithRequest,
  DL_QUOTE_EXACT_IN_BETTER,
  makeDutchRequest,
  QUOTE_REQUEST_DL,
} from '../../../../utils/fixtures';

describe('DutchQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  let provider: any;

  const OLD_ENV = process.env;

  beforeAll(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = {
      ...OLD_ENV,
      SYNTHETIC_ELIGIBLE_TOKENS: `{"1":["${TOKEN_IN.toLowerCase()}", "${TOKEN_OUT.toLowerCase()}"]}`,
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

  describe('dependencies', () => {
    it('returns expected dependencies when output is weth', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      const deps = context.dependencies();
      expect(deps.length).toEqual(2);
      // first is base
      expect(deps[0]).toEqual(QUOTE_REQUEST_DL);
      // second is classic
      expect(deps[1].info).toEqual(QUOTE_REQUEST_DL.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
    });

    it('returns expected dependencies when output is not weth', () => {
      const request = makeDutchRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new DutchQuoteContext(logger, request, provider);
      const deps = context.dependencies();
      expect(deps.length).toEqual(3);
      // first is base
      expect(deps[0]).toEqual(request);
      // second is classic
      expect(deps[1].info).toEqual(request.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
      // third is route to eth
      expect(deps[2].info.tokenIn).toEqual(request.info.tokenOut);
      expect(deps[2].info.tokenOut).toEqual('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(deps[2].routingType).toEqual(RoutingType.CLASSIC);
    });
  });

  describe('resolve', () => {
    it('returns null if no dependencies given', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      expect(await context.resolve({})).toEqual(null);
    });

    it('returns null if quote key is not set properly', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      expect(
        await context.resolve({
          wrong: DL_QUOTE_EXACT_IN_BETTER,
        })
      ).toBeNull();
    });

    it('returns main quote if others are null', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: AMOUNT, filler }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toMatchObject(rfqQuote);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(filler);
    });

    it('returns null if quotes have 0 amountOut', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '0', filler }, 'EXACT_INPUT');
      expect(
        await context.resolve({
          [QUOTE_REQUEST_DL.key()]: rfqQuote,
        })
      ).toBe(null);
    });

    it('returns null if tokenIn is not in tokenlist', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      const rfqQuote = createDutchQuote(
        { tokenIn: '0x0000000000000000000000000000000000000000', amountOut: '1' },
        'EXACT_INPUT'
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toBeNull();
    });

    it('returns null if tokenOut is not in tokenlist', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
      const rfqQuote = createDutchQuote(
        { tokenOut: '0x0000000000000000000000000000000000000000', amountOut: '1' },
        'EXACT_INPUT'
      );
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toBeNull();
    });

    it('uses synthetic if better', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, request, provider);
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
        BigNumber.from(9999000000).mul(DutchQuote.amountOutImprovementExactIn).div(10000).toString()
      );
    });

    it('uses synthetic if rfq quote is at least 300% better than clasic; EXACT_IN', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
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
      expect(quote?.amountOut.toString()).toEqual(
        BigNumber.from(90000000).mul(DutchQuote.amountOutImprovementExactIn).div(10000).toString()
      );
    });

    it('uses synthetic if rfq quote is at least 300% better than clasic; EXACT_OUT', async () => {
      const request = makeDutchRequest({ type: 'EXACT_OUTPUT' }, { useSyntheticQuotes: true });
      const context = new DutchQuoteContext(logger, request, provider);
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
      expect(quote?.amountIn.toString()).toEqual(
        BigNumber.from(399000000).mul(DutchQuote.amountInImprovementExactOut).div(10000).toString()
      );
    });

    it('skips UniswapX if rfq quote is at least 300% better than clasic; EXACT_IN, skipSynthetic', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, provider);
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
      const context = new DutchQuoteContext(logger, request, provider);
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
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
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
        BigNumber.from(9999000000).mul(DutchQuote.amountOutImprovementExactIn).div(10000).toString()
      );
    });

    it('skips synthetic if useSyntheticQuotes = false', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request, provider);
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
      const context = new DutchQuoteContext(logger, request, provider);
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
      const context = new DutchQuoteContext(logger, request, provider);
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
      const context = new DutchQuoteContext(logger, request, provider);
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
        BigNumber.from(9999000000).mul(DutchQuote.amountOutImprovementExactIn).div(10000).toString()
      );
    });

    it('returns no DL quotes if classic provided does not meet gas threshold', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
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
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
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
      const rfqQuote = createDutchQuoteWithRequest({ tokenIn: ETH_IN, tokenOut: TOKEN_IN, amountOut: AMOUNT, filler }, {
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
        type: 'EXACT_INPUT'
      });
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

      let context = new DutchQuoteContext(logger, request, provider);
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

      context = new DutchQuoteContext(logger, request, provider);
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
      });

      expect({
        ...approvedQuote,
        amountOutStart: expect.any(BigNumber),
        amountOutEnd: expect.any(BigNumber),
      }).toMatchObject({
        ...rfqQuote,
        amountOutStart: expect.any(BigNumber),
        amountOutEnd: expect.any(BigNumber),
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
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);
        const amountOut = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.toString() },
          { type: 'EXACT_INPUT' }
        );
        const hasSize = context.hasOrderSize(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns true if amountOut * 5% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);

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
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);

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
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);

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
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL, provider);

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

  describe('hasSyntheticEligibleTokens', () => {
    it('returns true if tokenOut and tokenIn are in SYNTHETIC_ELIGIBLE_TOKENS', async () => {
      const baseRequest = {
        tokenInChainId: CHAIN_IN_ID,
        tokenOutChainId: CHAIN_OUT_ID,
        requestId: 'requestId',
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amount: AMOUNT,
        type: 'EXACT_INPUT',
        swapper: SWAPPER,
        useUniswapX: true,
      };
      const QUOTE_REQUEST_ELIGIBLE_TOKENS = makeDutchRequest({}, { useSyntheticQuotes: true }, baseRequest);
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_ELIGIBLE_TOKENS, provider);
      expect(context.hasSyntheticEligibleTokens()).toEqual(true);
    });

    it('returns false if tokenIn not in SYNTHETIC_ELIGIBLE_TOKENS', async () => {
      const baseRequest = {
        tokenInChainId: CHAIN_IN_ID,
        tokenOutChainId: CHAIN_OUT_ID,
        requestId: 'requestId',
        tokenIn: INELIGIBLE_TOKEN,
        tokenOut: TOKEN_OUT,
        amount: AMOUNT,
        type: 'EXACT_INPUT',
        swapper: SWAPPER,
        useUniswapX: true,
      };
      const QUOTE_REQUEST_INELIGIBLE_TOKEN = makeDutchRequest({}, { useSyntheticQuotes: true }, baseRequest);
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_INELIGIBLE_TOKEN, provider);
      expect(context.hasSyntheticEligibleTokens()).toEqual(false);
    });

    it('returns false if tokenOut not in SYNTHETIC_ELIGIBLE_TOKENS', async () => {
      const baseRequest = {
        tokenInChainId: CHAIN_IN_ID,
        tokenOutChainId: CHAIN_OUT_ID,
        requestId: 'requestId',
        tokenIn: TOKEN_IN,
        tokenOut: INELIGIBLE_TOKEN,
        amount: AMOUNT,
        type: 'EXACT_INPUT',
        swapper: SWAPPER,
        useUniswapX: true,
      };
      const QUOTE_REQUEST_INELIGIBLE_TOKEN = makeDutchRequest({}, { useSyntheticQuotes: true }, baseRequest);
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_INELIGIBLE_TOKEN, provider);
      expect(context.hasSyntheticEligibleTokens()).toEqual(false);
    });

    it('returns false if tokenOut not in SYNTHETIC_ELIGIBLE_TOKENS', async () => {
      const baseRequest = {
        tokenInChainId: CHAIN_IN_ID,
        tokenOutChainId: CHAIN_OUT_ID,
        requestId: 'requestId',
        tokenIn: ETH_IN,
        tokenOut: TOKEN_OUT,
        amount: AMOUNT,
        type: 'EXACT_INPUT',
        swapper: SWAPPER,
        useUniswapX: true,
      };

      Erc20__factory.connect = jest.fn().mockImplementation(() => {
        return {
          allowance: () => ({ gte: () => false }),
        };
      });

      const QUOTE_REQUEST = makeDutchRequest({}, { useSyntheticQuotes: true }, baseRequest);
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST, provider);
      expect(context.hasSyntheticEligibleTokens()).toEqual(false);
    });
  });
});
