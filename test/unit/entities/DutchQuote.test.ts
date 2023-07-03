import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';
import * as _ from 'lodash';

import { ClassicQuote, DutchQuote } from '../../../lib/entities';
import { DL_PERMIT, DUTCH_LIMIT_ORDER_JSON } from '../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_LARGE,
  CLASSIC_QUOTE_EXACT_IN_NATIVE,
  CLASSIC_QUOTE_EXACT_OUT_LARGE,
  createClassicQuote,
  createDutchQuote,
  DL_QUOTE_EXACT_IN_LARGE,
  DL_QUOTE_EXACT_OUT_LARGE,
  DL_QUOTE_NATIVE_EXACT_IN_LARGE,
} from '../../utils/fixtures';

describe('DutchQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('Reparameterize', () => {
    it('Does not reparameterize if classic is not defined', async () => {
      const reparameterized = DutchQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, undefined);
      expect(reparameterized).toMatchObject(DL_QUOTE_EXACT_IN_LARGE);
    });

    it('slippage is in percent terms', async () => {
      const amountIn = BigNumber.from('1000000000');
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
        { amountIn, amountOut: amountIn },
        Object.assign({}, DL_QUOTE_EXACT_IN_LARGE.request, {
          info: {
            ...DL_QUOTE_EXACT_IN_LARGE.request.info,
            slippageTolerance: 10,
          },
        })
      );

      expect(amountInEnd).toEqual(amountIn);
      expect(amountOutEnd).toEqual(amountIn.mul(90).div(100));
    });

    it('reparameterizes with classic quote for end', async () => {
      const reparameterized = DutchQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, CLASSIC_QUOTE_EXACT_IN_LARGE);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_EXACT_IN_LARGE.request);
      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_EXACT_IN_LARGE.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(DL_QUOTE_EXACT_IN_LARGE.amountOutStart);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
        {
          amountIn: CLASSIC_QUOTE_EXACT_IN_LARGE.amountInGasAdjusted,
          amountOut: CLASSIC_QUOTE_EXACT_IN_LARGE.amountOutGasAdjusted,
        },
        CLASSIC_QUOTE_EXACT_IN_LARGE
      );
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
        { amountIn: amountInClassic, amountOut: amountOutClassic },
        DL_QUOTE_EXACT_IN_LARGE.request
      );

      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
    });

    it('reparameterizes with classic quote for end exactOutput', async () => {
      const reparameterized = DutchQuote.reparameterize(DL_QUOTE_EXACT_OUT_LARGE, CLASSIC_QUOTE_EXACT_OUT_LARGE);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_EXACT_OUT_LARGE.request);
      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_EXACT_OUT_LARGE.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(DL_QUOTE_EXACT_OUT_LARGE.amountOutStart);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
        {
          amountIn: CLASSIC_QUOTE_EXACT_OUT_LARGE.amountInGasAdjusted,
          amountOut: CLASSIC_QUOTE_EXACT_OUT_LARGE.amountOutGasAdjusted,
        },
        CLASSIC_QUOTE_EXACT_OUT_LARGE
      );
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
        { amountIn: amountInClassic, amountOut: amountOutClassic },
        DL_QUOTE_EXACT_OUT_LARGE.request
      );

      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
    });

    it('reparameterizes with wrap factored into startAmount', async () => {
      const classicQuote = CLASSIC_QUOTE_EXACT_IN_NATIVE as ClassicQuote;
      const reparameterized = DutchQuote.reparameterize(DL_QUOTE_NATIVE_EXACT_IN_LARGE, classicQuote);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_NATIVE_EXACT_IN_LARGE.request);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
        {
          amountIn: classicQuote.amountInGasAdjusted,
          amountOut: classicQuote.amountOutGasAdjusted,
        },
        classicQuote
      );
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
        { amountIn: amountInClassic, amountOut: amountOutClassic },
        DL_QUOTE_NATIVE_EXACT_IN_LARGE.request
      );

      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_NATIVE_EXACT_IN_LARGE.amountInStart);
      expect(reparameterized.amountOutStart.lt(DL_QUOTE_NATIVE_EXACT_IN_LARGE.amountOutStart)).toBeTruthy();
      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
    });
  });

  describe('getPermit', () => {
    it('Succeeds - Basic', () => {
      jest.useFakeTimers({
        now: 0,
      });
      const quote = createDutchQuote({ amountOut: '10000' }, 'EXACT_INPUT') as any;
      quote.nonce = 1;
      const dlQuote = quote as DutchQuote;
      const result = dlQuote.getPermitData();
      const expected = DL_PERMIT;
      expect(_.isEqual(JSON.stringify(result), JSON.stringify(expected))).toBe(true);
      jest.clearAllTimers();
    });
  });

  describe('toJSON', () => {
    it('Succeeds - Basic', () => {
      const quote = createDutchQuote({ amountOut: '10000' }, 'EXACT_INPUT') as any;
      quote.nonce = 1;
      const result = quote.toJSON();
      expect(result).toMatchObject(DUTCH_LIMIT_ORDER_JSON);
    });
  });

  describe('fromClassicQuote', () => {
    it('Succeeds - Generates nonce on initialization', () => {
      const classicQuote = createClassicQuote({}, {});
      const dutchQuote = createDutchQuote({}, 'EXACT_INPUT');
      const result = DutchQuote.fromClassicQuote(dutchQuote.request, classicQuote);
      const firstNonce = result.toOrder().info.nonce;
      const secondNonce = result.toOrder().info.nonce;
      expect(firstNonce).toEqual(secondNonce);
    });

    it('applies gas adjustment to endAmount', () => {
      const amount = '10000000000000000';
      const classicQuote = createClassicQuote({ amount }, {});
      const dutchQuote = createDutchQuote({ amountIn: amount }, 'EXACT_INPUT');
      const result = DutchQuote.fromClassicQuote(dutchQuote.request, classicQuote);
      const firstNonce = result.toOrder().info.nonce;
      const secondNonce = result.toOrder().info.nonce;
      expect(firstNonce).toEqual(secondNonce);
      expect(result.amountInStart).toEqual(classicQuote.amountInGasAdjusted);
      // greater because of price improvement
      expect(result.amountOutStart.gt(classicQuote.amountOutGasAdjusted)).toBeTruthy();

      const { amountIn: slippageAdjustedAmountIn, amountOut: slippageAdjustedAmountOut } = DutchQuote.applySlippage(
        { amountIn: result.amountInStart, amountOut: result.amountOutStart },
        dutchQuote.request
      );
      expect(result.amountInEnd).toEqual(slippageAdjustedAmountIn);
      expect(result.amountInEnd).toEqual(result.amountInStart);
      // should have extra adjustment for gas to amountOut
      expect(result.amountOutEnd.lte(slippageAdjustedAmountOut)).toBeTruthy();
    });
  });

  describe('getGasAdjustedAmounts', () => {
    it('properly calculates gas for exactInput', () => {
      const amounts = {
        amountIn: ethers.utils.parseEther('1'),
        amountOut: ethers.utils.parseEther('1'),
      };
      const gasAdjustment = BigNumber.from('10000');
      // gas adjustment wei = 10000 * 10 = 100,000 wei
      // wei to quote = 1:1
      // so gas adjustment quote = 100,000 wei
      const classicQuote = {
        request: {
          info: {
            type: TradeType.EXACT_INPUT,
          },
        },
        toJSON: () => ({
          gasUseEstimate: '10000',
          gasUseEstimateQuote: '100000',
          gasPriceWei: 10,
        }),
      } as unknown as ClassicQuote;
      const expectedGasAdjustmentQuote = 100000;

      const result = DutchQuote.getGasAdjustedAmounts(amounts, gasAdjustment, classicQuote);
      expect(result.amountIn).toEqual(ethers.utils.parseEther('1'));
      expect(result.amountOut).toEqual(ethers.utils.parseEther('1').sub(expectedGasAdjustmentQuote));
    });

    it('properly calculates gas for exactOutput', () => {
      const amounts = {
        amountIn: ethers.utils.parseEther('1'),
        amountOut: ethers.utils.parseEther('1'),
      };
      const gasAdjustment = BigNumber.from('10000');
      // gas adjustment wei = 10000 * 10 = 100,000 wei
      // wei to quote = 1:1
      // so gas adjustment quote = 100,000 wei
      const classicQuote = {
        request: {
          info: {
            type: TradeType.EXACT_OUTPUT,
          },
        },
        toJSON: () => ({
          gasUseEstimate: '10000',
          gasUseEstimateQuote: '100000',
          gasPriceWei: 10,
        }),
      } as unknown as ClassicQuote;
      const expectedGasAdjustmentQuote = 100000;

      const result = DutchQuote.getGasAdjustedAmounts(amounts, gasAdjustment, classicQuote);
      expect(result.amountIn).toEqual(ethers.utils.parseEther('1').add(expectedGasAdjustmentQuote));
      expect(result.amountOut).toEqual(ethers.utils.parseEther('1'));
    });
  });
});
