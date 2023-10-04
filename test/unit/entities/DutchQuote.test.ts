import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';
import * as _ from 'lodash';

import { BPS, DEFAULT_START_TIME_BUFFER_SECS, OPEN_QUOTE_START_TIME_BUFFER_SECS } from '../../../lib/constants';
import { ClassicQuote, DutchQuote } from '../../../lib/entities';
import { AMOUNT_LARGE, DL_PERMIT_RFQ, DUTCH_LIMIT_ORDER_JSON, PORTION_BIPS, PORTION_RECIPIENT } from '../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_LARGE,
  CLASSIC_QUOTE_EXACT_IN_LARGE_GAS,
  CLASSIC_QUOTE_EXACT_IN_NATIVE,
  CLASSIC_QUOTE_EXACT_OUT_LARGE,
  createClassicQuote,
  createDutchQuote,
  createDutchQuoteWithRequest,
  DL_QUOTE_EXACT_IN_LARGE,
  DL_QUOTE_EXACT_OUT_LARGE,
  DL_QUOTE_NATIVE_EXACT_IN_LARGE,
} from '../../utils/fixtures';

describe('DutchQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  process.env.ENABLE_PORTION = 'true';

  describe('Reparameterize', () => {
    it('Does not reparameterize if classic is not defined', async () => {
      const reparameterized = DutchQuote.reparameterize(DL_QUOTE_EXACT_IN_LARGE, undefined, undefined);
      expect(reparameterized).toMatchObject(DL_QUOTE_EXACT_IN_LARGE);
      expect(reparameterized.portionBips).toEqual(PORTION_BIPS);
      expect(reparameterized.portionRecipient).toEqual(PORTION_RECIPIENT);
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

    it('adjustments should always decrease outputs for exactIn', async () => {
      const quote = CLASSIC_QUOTE_EXACT_IN_LARGE_GAS;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote
      );
      expect(amountInGasAdjusted.eq(amountIn)).toBeTruthy();
      expect(amountOutGasAdjusted.lt(amountOut)).toBeTruthy();
      const { amountIn: amountInSlippageAdjusted, amountOut: amountOutSlippageAdjusted } = DutchQuote.applySlippage(
        { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted },
        DL_QUOTE_EXACT_IN_LARGE.request
      );

      expect(amountInSlippageAdjusted.eq(amountInGasAdjusted)).toBeTruthy();
      expect(amountOutSlippageAdjusted.lt(amountOutGasAdjusted)).toBeTruthy();
    });

    it('adjustments should always increase inputs for exactOut', async () => {
      const quote = CLASSIC_QUOTE_EXACT_OUT_LARGE;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote
      );
      expect(amountInGasAdjusted.gt(amountIn)).toBeTruthy();
      expect(amountOutGasAdjusted.eq(amountOut)).toBeTruthy();
      const { amountIn: amountInSlippageAdjusted, amountOut: amountOutSlippageAdjusted } = DutchQuote.applySlippage(
        { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted },
        DL_QUOTE_EXACT_OUT_LARGE.request
      );

      expect(amountInSlippageAdjusted.gte(amountInGasAdjusted)).toBeTruthy();
      expect(amountOutSlippageAdjusted.eq(amountOutGasAdjusted)).toBeTruthy();
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
      expect(reparameterized.portionBips).toEqual(PORTION_BIPS);
      expect(reparameterized.portionRecipient).toEqual(PORTION_RECIPIENT);
      expect(reparameterized.portionAmountOutStart).toEqual(reparameterized.amountOutStart.mul(PORTION_BIPS).div(BPS));
      expect(reparameterized.portionAmountOutEnd).toEqual(amountOutEnd.mul(PORTION_BIPS).div(BPS));
    });

    it('reparameterizes with classic quote for end exactOutput', async () => {
      const reparameterized = DutchQuote.reparameterize(DL_QUOTE_EXACT_OUT_LARGE, CLASSIC_QUOTE_EXACT_OUT_LARGE);
      expect(reparameterized.request).toMatchObject(DL_QUOTE_EXACT_OUT_LARGE.request);

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
      expect(reparameterized.amountInStart).toEqual(DL_QUOTE_EXACT_OUT_LARGE.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(DL_QUOTE_EXACT_OUT_LARGE.amountOutStart);
      expect(reparameterized.portionBips).toEqual(PORTION_BIPS);
      expect(reparameterized.portionRecipient).toEqual(PORTION_RECIPIENT);
      expect(reparameterized.portionAmountOutStart).toEqual(
        DL_QUOTE_EXACT_OUT_LARGE.amountOutStart.mul(PORTION_BIPS).div(BPS)
      );
      expect(reparameterized.portionAmountOutEnd).toEqual(
        DL_QUOTE_EXACT_OUT_LARGE.amountOutEnd.mul(PORTION_BIPS).div(BPS)
      );
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
      expect(reparameterized.amountOutStart.lte(DL_QUOTE_NATIVE_EXACT_IN_LARGE.amountOutStart)).toBeTruthy();
      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
      expect(reparameterized.portionBips).toEqual(PORTION_BIPS);
      expect(reparameterized.portionRecipient).toEqual(PORTION_RECIPIENT);
      expect(reparameterized.portionAmountOutStart).toEqual(reparameterized.amountOutStart.mul(PORTION_BIPS).div(BPS));
      expect(reparameterized.portionAmountOutEnd).toEqual(amountOutEnd.mul(PORTION_BIPS).div(BPS));
    });
  });

  describe('decay parameters', () => {
    it('uses default parameters - RFQ', () => {
      const quote = createDutchQuoteWithRequest(
        { filler: '0x1111111111111111111111111111111111111111' },
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: undefined,
          auctionPeriodSecs: undefined,
          deadlineBufferSecs: undefined,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(DEFAULT_START_TIME_BUFFER_SECS);
      expect(result.auctionPeriodSecs).toEqual(60);
      expect(result.deadlineBufferSecs).toEqual(12);
    });

    it('uses default parameters - Open', () => {
      const quote = createDutchQuoteWithRequest(
        { filler: '0x0000000000000000000000000000000000000000' },
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: undefined,
          auctionPeriodSecs: undefined,
          deadlineBufferSecs: undefined,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(OPEN_QUOTE_START_TIME_BUFFER_SECS);
      expect(result.auctionPeriodSecs).toEqual(60);
      expect(result.deadlineBufferSecs).toEqual(12);
    });

    it('uses default parameters - polygon', () => {
      const quote = createDutchQuoteWithRequest(
        { filler: '0x0000000000000000000000000000000000000000', chainId: 137 },
        {
          tokenInChainId: 137,
          tokenOutChainId: 137,
        },
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: undefined,
          auctionPeriodSecs: undefined,
          deadlineBufferSecs: undefined,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(OPEN_QUOTE_START_TIME_BUFFER_SECS);
      expect(result.auctionPeriodSecs).toEqual(60);
      expect(result.deadlineBufferSecs).toEqual(5);
    });

    it('overrides parameters in request', () => {
      const quote = createDutchQuoteWithRequest(
        { filler: '0x1111111111111111111111111111111111111111' },
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: 111,
          auctionPeriodSecs: 222,
          deadlineBufferSecs: 333,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(111);
      expect(result.auctionPeriodSecs).toEqual(222);
      expect(result.deadlineBufferSecs).toEqual(333);
    });
  });

  describe('getPermit', () => {
    it('Succeeds - Basic', () => {
      jest.useFakeTimers({
        now: 0,
      });
      const quote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, filler: '0x1111111111111111111111111111111111111111' },
        'EXACT_INPUT'
      ) as any;
      quote.nonce = 1;
      const dlQuote = quote as DutchQuote;
      const result = dlQuote.getPermitData();
      const expected = DL_PERMIT_RFQ;
      expect(_.isEqual(JSON.stringify(result), JSON.stringify(expected))).toBe(true);
      jest.clearAllTimers();
    });
  });

  describe('toJSON', () => {
    it('Succeeds - Basic', () => {
      const quote: DutchQuote = createDutchQuote(
        { amountOut: '10000', filler: '0x1111111111111111111111111111111111111111' },
        'EXACT_INPUT',
        '1',
        PORTION_BIPS,
        PORTION_RECIPIENT
      ) as any;
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
      expect(result.portionBips).toEqual(PORTION_BIPS);
      expect(result.portionRecipient).toEqual(PORTION_RECIPIENT);
      expect(result.portionAmountOutStart).toEqual(result.amountOutStart.mul(PORTION_BIPS).div(BPS));
      expect(result.portionAmountOutEnd).toEqual(result.amountOutEnd.mul(PORTION_BIPS).div(BPS));
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
      expect(result.portionBips).toEqual(PORTION_BIPS);
      expect(result.portionRecipient).toEqual(PORTION_RECIPIENT);
      expect(result.portionAmountOutStart).toEqual(result.amountOutStart.mul(PORTION_BIPS).div(BPS));
      expect(result.portionAmountOutEnd).toEqual(result.amountOutEnd.mul(PORTION_BIPS).div(BPS));
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
