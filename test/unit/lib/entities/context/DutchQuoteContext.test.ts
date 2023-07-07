import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';

import { RoutingType } from '../../../../../lib/constants';
import { DutchQuote, DutchQuoteContext, DutchQuoteDataJSON } from '../../../../../lib/entities';
import {
  createClassicQuote,
  createDutchQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  makeDutchRequest,
  QUOTE_REQUEST_DL,
} from '../../../../utils/fixtures';

describe('DutchQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('dependencies', () => {
    it('returns expected dependencies when output is weth', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
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
      const context = new DutchQuoteContext(logger, request);
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
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      expect(await context.resolve({})).toEqual(null);
    });

    it('returns null if quote key is not set properly', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      expect(
        await context.resolve({
          wrong: DL_QUOTE_EXACT_IN_BETTER,
        })
      ).toBeNull();
    });

    it('returns main quote if others are null', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      const quote = await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toMatchObject(rfqQuote);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(filler);
    });

    it('returns null if quotes have 0 amountOut', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '0', filler }, 'EXACT_INPUT');
      expect(await context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      })).toBe(null);
    });

    it('returns null if tokenIn is not in tokenlist', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
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
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
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
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
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

    it('filters out zero amountOut quotes in favor of others', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote(
        { quote: '10000000000', quoteGasAdjusted: '0' },
        { type: 'EXACT_INPUT' }
      );
      context.dependencies();

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote).toMatchObject(rfqQuote);
      expect((quote?.toJSON() as DutchQuoteDataJSON).orderInfo.exclusiveFiller).toEqual(filler);
    });

    it('skips synthetic if useSyntheticQuotes = false', async () => {
      const request = makeDutchRequest({}, { useSyntheticQuotes: false });
      const context = new DutchQuoteContext(logger, request);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1000000000000000000', filler }, 'EXACT_INPUT');
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

    it('skips synthetic if no route to eth', async () => {
      const request = makeDutchRequest({
        tokenOut: '0x1111111111111111111111111111111111111111',
      });
      const context = new DutchQuoteContext(logger, request);
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
      expect(quote?.request).toMatchObject(rfqQuote.request);
      expect(quote?.amountIn).toEqual(rfqQuote?.amountIn);
      expect(quote?.amountOut).toEqual(rfqQuote?.amountOut);
    });

    it('keeps synthetic if output is weth', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
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

    it('skips synthetic if very small', async () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      context.dependencies();
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote({ quote: '10', quoteGasAdjusted: '4' }, { type: 'EXACT_INPUT' });

      const quote = await context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.request).toMatchObject(rfqQuote.request);
      expect(quote?.amountIn).toEqual(rfqQuote?.amountIn);
      expect(quote?.amountOut).toEqual(rfqQuote?.amountOut);
    });
  });

  describe('hasOrderSizeForsynthetic', () => {
    describe('exactIn', () => {
      it('returns true if quote == quoteGasAdjusted', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
        const amountOut = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.toString() },
          { type: 'EXACT_INPUT' }
        );
        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns true if amountOut * 5% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountOut = ethers.utils.parseEther('1');
        const fivePercent = amountOut.mul(5).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(fivePercent).toString() },
          { type: 'EXACT_INPUT' }
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns false if amountOut * 55% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountOut = ethers.utils.parseEther('1');
        const gas = amountOut.mul(55).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(gas).toString() },
          { type: 'EXACT_INPUT' }
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(false);
      });
    });

    describe('exactOut', () => {
      it('returns true if amountIn * 5% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountIn = ethers.utils.parseEther('1');
        const fivePercent = amountIn.mul(5).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(fivePercent).toString() },
          { type: 'EXACT_OUTPUT' }
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns false if amountIn * 55% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountIn = ethers.utils.parseEther('1');
        const gas = amountIn.mul(55).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(gas).toString() },
          { type: 'EXACT_OUTPUT' }
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(false);
      });
    });
  });
});
