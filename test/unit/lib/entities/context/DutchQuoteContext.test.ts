import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import Logger from 'bunyan';
import { ethers } from 'ethers';

import { RoutingType } from '../../../../../lib/constants';
import { DutchQuoteContext } from '../../../../../lib/entities';
import {
  createClassicQuote,
  createDutchLimitQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  QUOTE_REQUEST_DL,
} from '../../../../utils/fixtures';

describe('DutchQuoteContext', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('dependencies', () => {
    it('returns expected dependencies', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const deps = context.dependencies();
      expect(deps.length).toEqual(3);
      expect(deps[0]).toEqual(QUOTE_REQUEST_DL);
      // first is classic
      expect(deps[1].info).toEqual(QUOTE_REQUEST_DL.info);
      expect(deps[1].routingType).toEqual(RoutingType.CLASSIC);
      // second is route to eth
      expect(deps[2].info.tokenIn).toEqual(QUOTE_REQUEST_DL.info.tokenOut);
      expect(deps[2].info.tokenOut).toEqual('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(deps[2].routingType).toEqual(RoutingType.CLASSIC);
    });
  });

  describe('resolve', () => {
    it('returns null if dependencies given', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      expect(context.resolve({})).toEqual(null);
    });

    it('returns null if quote key is not set properly', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      expect(
        context.resolve({
          wrong: DL_QUOTE_EXACT_IN_BETTER,
        })
      ).toBeNull();
    });

    it('returns main quote if others are null', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchLimitQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      const quote = context.resolve({
        [QUOTE_REQUEST_DL.key()]: rfqQuote,
      });
      expect(quote).toMatchObject(rfqQuote);
      expect((quote?.toJSON() as DutchLimitOrderInfoJSON).exclusiveFiller).toEqual(filler);
    });

    it('uses synthetic if better', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchLimitQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote({ quote: '10000000000', quoteGasAdjusted: '9999000000' }, 'EXACT_INPUT');
      context.dependencies();

      const quote = context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
        [context.routeToNativeKey]: classicQuote,
      });
      expect(quote?.routingType).toEqual(RoutingType.DUTCH_LIMIT);
      expect((quote?.toJSON() as DutchLimitOrderInfoJSON).exclusiveFiller).toEqual(
        '0x0000000000000000000000000000000000000000'
      );
    });

    it('skips synthetic if no route to eth', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchLimitQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote({ quote: '10000000000', quoteGasAdjusted: '9999000000' }, 'EXACT_INPUT');
      context.dependencies();

      const quote = context.resolve({
        [context.requestKey]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      expect(quote?.request).toMatchObject(rfqQuote.request);
      expect(quote?.amountIn).toEqual(rfqQuote?.amountIn);
      expect(quote?.amountOut).toEqual(rfqQuote?.amountOut);
    });

    it('skips synthetic if very small', () => {
      const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
      context.dependencies();
      const filler = '0x1111111111111111111111111111111111111111';
      const rfqQuote = createDutchLimitQuote({ amountOut: '1', filler }, 'EXACT_INPUT');
      expect(rfqQuote.filler).toEqual(filler);
      const classicQuote = createClassicQuote({ quote: '10', quoteGasAdjusted: '9' }, 'EXACT_INPUT');

      const quote = context.resolve({
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
      it('returns false if amountOut == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);
        const amountOut = ethers.utils.parseEther('1');
        const classicQuote = createClassicQuote({ quote: amountOut.toString(), quoteGasAdjusted: '1' }, 'EXACT_INPUT');
        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(false);
      });

      it('returns true if amountOut * 5% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountOut = ethers.utils.parseEther('1');
        const fivePercent = amountOut.mul(5).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(fivePercent).toString() },
          'EXACT_INPUT'
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns false if amountOut * 25% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountOut = ethers.utils.parseEther('1');
        const fivePercent = amountOut.mul(25).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(fivePercent).toString() },
          'EXACT_INPUT'
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
          'EXACT_OUTPUT'
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(true);
      });

      it('returns false if amountIn * 25% == gas used', async () => {
        const context = new DutchQuoteContext(logger, QUOTE_REQUEST_DL);

        const amountIn = ethers.utils.parseEther('1');
        const fivePercent = amountIn.mul(25).div(100);
        const classicQuote = createClassicQuote(
          { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(fivePercent).toString() },
          'EXACT_OUTPUT'
        );

        const hasSize = context.hasOrderSizeForSynthetic(logger, classicQuote);
        expect(hasSize).toEqual(false);
      });
    });
  });
});
