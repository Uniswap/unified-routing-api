import Logger from 'bunyan';
import { ethers } from 'ethers';

import { UniswapXOrderSizeFilter } from '../../../../../lib/providers/transformers';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  createClassicQuote,
  createDutchLimitQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_OUT_BETTER,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../../../utils/fixtures';

describe('UniswapXOrderSizeFilter', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  const filter = new UniswapXOrderSizeFilter(logger);

  describe('ExactIn', () => {
    it('does not filter if no routing api quote', async () => {
      const filtered = await filter.transform([QUOTE_REQUEST_DL], [DL_QUOTE_EXACT_IN_BETTER]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });

    it('does not filter if no gouda quote', async () => {
      const filtered = await filter.transform([QUOTE_REQUEST_CLASSIC], [CLASSIC_QUOTE_EXACT_IN_BETTER]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('does not filter if no gas estimate', async () => {
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [
        DL_QUOTE_EXACT_IN_BETTER,
        CLASSIC_QUOTE_EXACT_IN_BETTER,
      ]);
      expect(filtered.length).toEqual(2);
    });

    it('filters if amountOut == gas used', async () => {
      const amountOut = ethers.utils.parseEther('1');
      const classicQuote = createClassicQuote({ quote: amountOut.toString(), quoteGasAdjusted: '1' }, 'EXACT_INPUT');
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [classicQuote, DL_QUOTE_EXACT_IN_BETTER]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(classicQuote);
    });

    it('does not filter if amountOut * 5% == gas used', async () => {
      const amountOut = ethers.utils.parseEther('1');
      const fivePercent = amountOut.mul(5).div(100);
      const dutchQuote = createDutchLimitQuote({ amountOut: amountOut.toString() }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(fivePercent).toString() },
        'EXACT_INPUT'
      );
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [classicQuote, dutchQuote]);
      expect(filtered.length).toEqual(2);
    });

    it('filters if amountOut * 25% == gas used', async () => {
      const amountOut = ethers.utils.parseEther('1');
      const twentyFivePercent = amountOut.mul(25).div(100);
      const dutchQuote = createDutchLimitQuote({ amountOut: amountOut.toString() }, 'EXACT_INPUT');
      const classicQuote = createClassicQuote(
        { quote: amountOut.toString(), quoteGasAdjusted: amountOut.sub(twentyFivePercent).toString() },
        'EXACT_INPUT'
      );
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [classicQuote, dutchQuote]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(classicQuote);
    });
  });

  describe('ExactOut', () => {
    it('does not filter if no routing api quote', async () => {
      const filtered = await filter.transform([QUOTE_REQUEST_DL], [DL_QUOTE_EXACT_OUT_BETTER]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(DL_QUOTE_EXACT_OUT_BETTER);
    });

    it('does not filter if no gouda quote', async () => {
      const filtered = await filter.transform([QUOTE_REQUEST_CLASSIC], [CLASSIC_QUOTE_EXACT_OUT_BETTER]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(CLASSIC_QUOTE_EXACT_OUT_BETTER);
    });

    it('does not filter if no gas estimate', async () => {
      const amountIn = ethers.utils.parseEther('1');
      const classicQuote = createClassicQuote(
        { quote: amountIn.toString(), quoteGasAdjusted: amountIn.toString() },
        'EXACT_OUTPUT'
      );
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [DL_QUOTE_EXACT_OUT_BETTER, classicQuote]);
      expect(filtered.length).toEqual(2);
    });

    it('filters if amountOut == gas used', async () => {
      const amountIn = ethers.utils.parseEther('1');
      const classicQuote = createClassicQuote(
        { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(1).toString() },
        'EXACT_OUTPUT'
      );
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [classicQuote, DL_QUOTE_EXACT_OUT_BETTER]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(classicQuote);
    });

    it('does not filter if amountIn + 5% == gas used', async () => {
      const amountIn = ethers.utils.parseEther('1');
      const fivePercent = amountIn.mul(5).div(100);
      const dutchQuote = createDutchLimitQuote({ amountIn: amountIn.toString() }, 'EXACT_OUTPUT');
      const classicQuote = createClassicQuote(
        { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(fivePercent).toString() },
        'EXACT_OUTPUT'
      );
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [classicQuote, dutchQuote]);
      expect(filtered.length).toEqual(2);
    });

    it('filters if amountOut + 25% == gas used', async () => {
      const amountIn = ethers.utils.parseEther('1');
      const twentyFivePercent = amountIn.mul(25).div(100);
      const dutchQuote = createDutchLimitQuote({ amountIn: amountIn.toString() }, 'EXACT_OUTPUT');
      const classicQuote = createClassicQuote(
        { quote: amountIn.toString(), quoteGasAdjusted: amountIn.add(twentyFivePercent).toString() },
        'EXACT_OUTPUT'
      );
      const filtered = await filter.transform(QUOTE_REQUEST_MULTI, [classicQuote, dutchQuote]);
      expect(filtered.length).toEqual(1);
      expect(filtered[0]).toEqual(classicQuote);
    });
  });
});
