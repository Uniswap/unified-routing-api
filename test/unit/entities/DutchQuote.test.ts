import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';
import * as _ from 'lodash';

import { it } from '@jest/globals';
import {
  BPS,
  DEFAULT_AUCTION_PERIOD_SECS,
  DEFAULT_DEADLINE_BUFFER_SECS,
  DEFAULT_START_TIME_BUFFER_SECS,
  NATIVE_ADDRESS,
  OPEN_QUOTE_START_TIME_BUFFER_SECS,
  UNISWAPX_BASE_GAS,
  WETH_UNWRAP_GAS,
} from '../../../lib/constants';
import { ClassicQuote, DutchQuote, DutchQuoteJSON } from '../../../lib/entities';
import { DutchQuoteFactory } from '../../../lib/entities/quote/DutchQuoteFactory';
import { DutchV1Quote } from '../../../lib/entities/quote/DutchV1Quote';
import {
  AMOUNT,
  AMOUNT_LARGE,
  DL_PERMIT_RFQ,
  DUTCH_LIMIT_ORDER_JSON,
  DUTCH_LIMIT_ORDER_JSON_WITH_PORTION,
  FLAT_PORTION,
  PORTION_BIPS,
  PORTION_RECIPIENT,
  TEST_GAS_ADJUSTED_AMOUNT_INPUT,
  TEST_GAS_ADJUSTED_AMOUNT_OUTPUT,
  TEST_GAS_ADJUSTED_AMOUNT_WITH_ADJUSTMENT_INPUT,
  TEST_GAS_ADJUSTED_AMOUNT_WITH_ADJUSTMENT_OUTPUT,
  TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_INPUT,
  TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_OUTPUT,
  TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_WITH_ADJUSTMENT_INPUT,
  TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_WITH_ADJUSTMENT_OUTPUT,
  TEST_GAS_ADJUSTED_END_AMOUNT,
  TEST_GAS_ADJUSTMENT_BPS,
  TEST_X_GAS_ADJUSTMENT_AMOUNT,
  TEST_X_GAS_ADJUSTMENT_AMOUNT_WITH_UNWRAP,
} from '../../constants';
import {
  CLASSIC_QUOTE_EXACT_IN_LARGE,
  CLASSIC_QUOTE_EXACT_IN_LARGE_GAS,
  CLASSIC_QUOTE_EXACT_IN_LARGE_WITH_PORTION,
  CLASSIC_QUOTE_EXACT_IN_NATIVE,
  CLASSIC_QUOTE_EXACT_IN_NATIVE_WITH_PORTION,
  CLASSIC_QUOTE_EXACT_IN_SMALL,
  CLASSIC_QUOTE_EXACT_OUT_LARGE,
  createClassicQuote,
  createDutchQuote,
  createDutchQuoteWithRequestOverrides,
  DL_QUOTE_EXACT_IN_LARGE,
  DL_QUOTE_EXACT_IN_LARGE_WITH_PORTION,
  DL_QUOTE_EXACT_OUT_LARGE,
  DL_QUOTE_NATIVE_EXACT_IN_LARGE,
  DL_QUOTE_NATIVE_EXACT_IN_LARGE_WITH_PORTION,
} from '../../utils/fixtures';

describe('DutchQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  beforeEach(() => {
    process.env.ENABLE_PORTION = 'true';
  });

  afterEach(() => {
    process.env.ENABLE_PORTION = 'false';
  });

  describe('getGasAdjustment', () => {
    it('gets gas adjustment without unwrap, no adjustment', () => {
      const classicQuote = createClassicQuote({}, {});
      const result = DutchQuote.getGasAdjustment(classicQuote);
      expect(result.eq(BigNumber.from(UNISWAPX_BASE_GAS))).toBeTruthy();
    });

    it('gets gas adjustment with unwrap, no adjustment', () => {
      const classicQuote = createClassicQuote(
        {},
        {
          tokenOut: NATIVE_ADDRESS,
        }
      );
      const result = DutchQuote.getGasAdjustment(classicQuote);
      expect(result.eq(BigNumber.from(UNISWAPX_BASE_GAS).add(BigNumber.from(WETH_UNWRAP_GAS)))).toBeTruthy();
    });

    it('gets gas adjustment without unwrap, with adjustment', () => {
      const classicQuote = createClassicQuote({}, {});
      const result = DutchQuote.getGasAdjustment(classicQuote, TEST_GAS_ADJUSTMENT_BPS);
      expect(result.eq(TEST_X_GAS_ADJUSTMENT_AMOUNT)).toBeTruthy();
    });

    it('gets gas adjustment with unwrap, with adjustment', () => {
      const classicQuote = createClassicQuote(
        {},
        {
          tokenOut: NATIVE_ADDRESS,
        }
      );
      const result = DutchQuote.getGasAdjustment(classicQuote, TEST_GAS_ADJUSTMENT_BPS);
      expect(result.eq(TEST_X_GAS_ADJUSTMENT_AMOUNT_WITH_UNWRAP)).toBeTruthy();
    });
  });

  describe('applyGasAdjustment', () => {
    it('applyGasAdjustment, no unwrap, no adjustment bps', () => {
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
      expect(amountOutGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_OUTPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, no unwrap, with adjustment bps', () => {
      const quote = CLASSIC_QUOTE_EXACT_IN_LARGE_GAS;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote,
        TEST_GAS_ADJUSTMENT_BPS
      );
      expect(amountInGasAdjusted.eq(amountIn)).toBeTruthy();
      expect(amountOutGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_WITH_ADJUSTMENT_OUTPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, with unwrap, no adjustment bps', () => {
      const quote = CLASSIC_QUOTE_EXACT_IN_LARGE_GAS;
      quote.request.info.tokenOut = NATIVE_ADDRESS;
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
      expect(amountOutGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_OUTPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, with unwrap, with adjustment bps', () => {
      const quote = CLASSIC_QUOTE_EXACT_IN_LARGE_GAS;
      quote.request.info.tokenOut = NATIVE_ADDRESS;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote,
        TEST_GAS_ADJUSTMENT_BPS
      );

      expect(amountInGasAdjusted.eq(amountIn)).toBeTruthy();
      expect(amountOutGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_WITH_ADJUSTMENT_OUTPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, exact output, no unwrap, no adjustment bps', () => {
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

      expect(amountOutGasAdjusted.eq(amountOut)).toBeTruthy();
      expect(amountInGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_INPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, exact output, no unwrap, with adjustment bps', () => {
      const quote = CLASSIC_QUOTE_EXACT_OUT_LARGE;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote,
        TEST_GAS_ADJUSTMENT_BPS
      );
      expect(amountOutGasAdjusted.eq(amountOut)).toBeTruthy();
      expect(amountInGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_WITH_ADJUSTMENT_INPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, exact output, with unwrap, no adjustment bps', () => {
      const quote = CLASSIC_QUOTE_EXACT_OUT_LARGE;
      quote.request.info.tokenOut = NATIVE_ADDRESS;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote
      );

      expect(amountOutGasAdjusted.eq(amountOut)).toBeTruthy();
      expect(amountInGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_INPUT)).toBeTruthy();
    });

    it('applyGasAdjustment, exact output, with unwrap, with adjustment bps', () => {
      const quote = CLASSIC_QUOTE_EXACT_OUT_LARGE;
      quote.request.info.tokenOut = NATIVE_ADDRESS;
      const amountIn = quote.amountInGasAdjusted;
      const amountOut = quote.amountOutGasAdjusted;
      const { amountIn: amountInGasAdjusted, amountOut: amountOutGasAdjusted } = DutchQuote.applyGasAdjustment(
        {
          amountIn: amountIn,
          amountOut: amountOut,
        },
        quote,
        TEST_GAS_ADJUSTMENT_BPS
      );

      expect(amountOutGasAdjusted.eq(amountOut)).toBeTruthy();
      expect(amountInGasAdjusted.eq(TEST_GAS_ADJUSTED_AMOUNT_WITH_UNWRAP_WITH_ADJUSTMENT_INPUT)).toBeTruthy();
    });
  });

  describe('Reparameterize', () => {
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

    it.each([
      { title: 'overrides', largeTrade: true },
      { title: 'does not override', largeTrade: false },
    ])('$title auctionPeriodSec if order size is considered large: $largeTrade', async (params) => {
      const classic = params.largeTrade ? CLASSIC_QUOTE_EXACT_IN_LARGE : CLASSIC_QUOTE_EXACT_IN_SMALL;
      const reparamatrized = DutchQuoteFactory.reparameterize(DL_QUOTE_EXACT_IN_LARGE, classic, {
        hasApprovedPermit2: true,
        largeTrade: params.largeTrade,
      }) as DutchV1Quote;
      if (params.largeTrade) {
        expect(reparamatrized.auctionPeriodSecs).toEqual(120);
      } else {
        expect(reparamatrized.auctionPeriodSecs).toEqual(60);
      }
    });

    it.each([true, false])(
      `Does not reparameterize if classic is not defined with portion flag %p`,
      async (enablePortion) => {
        const dutchLargeQuote = enablePortion ? DL_QUOTE_EXACT_IN_LARGE_WITH_PORTION : DL_QUOTE_EXACT_IN_LARGE;
        const reparameterized = DutchQuoteFactory.reparameterize(dutchLargeQuote, undefined, undefined);
        expect(reparameterized).toMatchObject(dutchLargeQuote);

        if (enablePortion) {
          expect(reparameterized.portion?.bips).toEqual(PORTION_BIPS);
          expect(reparameterized.portion?.recipient).toEqual(PORTION_RECIPIENT);
        }
      }
    );

    it('uses portion from original', async () => {
      const dutchQuotePortion = createDutchQuote({ amountOut: AMOUNT_LARGE }, 'EXACT_INPUT', '1', FLAT_PORTION, true);
      const reparameterized = DutchQuoteFactory.reparameterize(
        dutchQuotePortion,
        CLASSIC_QUOTE_EXACT_IN_LARGE,
        undefined
      );
      expect(reparameterized.portion?.bips).toEqual(PORTION_BIPS);
      expect(reparameterized.toOrder().toJSON().outputs.length).toEqual(2);
    });

    it('reparametrizes correctly with gas adjustment bps', async () => {
      const dutchQuotePortion = createDutchQuote({ amountOut: AMOUNT_LARGE }, 'EXACT_INPUT', '1');
      dutchQuotePortion.request.config.gasAdjustmentBps = TEST_GAS_ADJUSTMENT_BPS;
      const reparameterized = DutchQuoteFactory.reparameterize(
        dutchQuotePortion,
        CLASSIC_QUOTE_EXACT_IN_LARGE,
        undefined
      );

      expect(reparameterized.toOrder().toJSON().outputs[0].endAmount).toEqual(TEST_GAS_ADJUSTED_END_AMOUNT);
    });

    it('only override auctionPeriodSec on mainnet', async () => {
      const classic = CLASSIC_QUOTE_EXACT_IN_LARGE;
      const dutchRequest = createDutchQuote({ amountOut: AMOUNT_LARGE, chainId: 137 }, 'EXACT_INPUT', '1');
      const reparamatrized = DutchQuoteFactory.reparameterize(dutchRequest, classic) as DutchV1Quote;
      expect(reparamatrized.auctionPeriodSecs).toEqual(60);
    });

    it.each([true, false])('reparameterizes with classic quote for end with portion flag %p', async (enablePortion) => {
      const classicQuote = enablePortion ? CLASSIC_QUOTE_EXACT_IN_LARGE_WITH_PORTION : CLASSIC_QUOTE_EXACT_IN_LARGE;
      const dutchQuote = enablePortion ? DL_QUOTE_EXACT_IN_LARGE_WITH_PORTION : DL_QUOTE_EXACT_IN_LARGE;
      const reparameterized = DutchQuoteFactory.reparameterize(dutchQuote, classicQuote);
      expect(reparameterized.request).toMatchObject(dutchQuote.request);
      expect(reparameterized.amountInStart).toEqual(dutchQuote.amountInStart);
      expect(reparameterized.amountOutStart).toEqual(dutchQuote.amountOutStart);

      const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
        {
          amountIn: classicQuote.amountInGasAdjusted,
          amountOut: classicQuote.amountOutGasAdjusted,
        },
        classicQuote
      );
      const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
        { amountIn: amountInClassic, amountOut: amountOutClassic },
        DL_QUOTE_EXACT_IN_LARGE.request
      );

      expect(reparameterized.amountInEnd).toEqual(amountInEnd);
      expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);

      if (enablePortion) {
        expect(reparameterized.portion?.bips).toEqual(PORTION_BIPS);
        expect(reparameterized.portion?.recipient).toEqual(PORTION_RECIPIENT);
        expect(reparameterized.portionAmountOutStart).toEqual(
          reparameterized.amountOutStart.mul(PORTION_BIPS).div(BPS)
        );
        expect(reparameterized.portionAmountOutEnd).toEqual(amountOutEnd.mul(PORTION_BIPS).div(BPS));
      }
    });

    it.each([true, false])(
      'reparameterizes with classic quote for end exactOutput with portion flag %p',
      async (enablePortion) => {
        const classicQuote = enablePortion ? CLASSIC_QUOTE_EXACT_IN_LARGE_WITH_PORTION : CLASSIC_QUOTE_EXACT_IN_LARGE;
        const dutchQuote = enablePortion ? DL_QUOTE_EXACT_IN_LARGE_WITH_PORTION : DL_QUOTE_EXACT_IN_LARGE;
        const reparameterized = DutchQuoteFactory.reparameterize(dutchQuote, classicQuote);
        expect(reparameterized.request).toMatchObject(dutchQuote.request);

        const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
          {
            amountIn: classicQuote.amountInGasAdjusted,
            amountOut: classicQuote.amountOutGasAdjusted,
          },
          classicQuote
        );
        const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
          { amountIn: amountInClassic, amountOut: amountOutClassic },
          dutchQuote.request
        );

        expect(reparameterized.amountInEnd).toEqual(amountInEnd);
        expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);
        expect(reparameterized.amountInStart).toEqual(dutchQuote.amountInStart);
        expect(reparameterized.amountOutStart).toEqual(dutchQuote.amountOutStart);

        if (enablePortion) {
          expect(reparameterized.portion?.bips).toEqual(PORTION_BIPS);
          expect(reparameterized.portion?.recipient).toEqual(PORTION_RECIPIENT);
          expect(reparameterized.portionAmountOutStart).toEqual(dutchQuote.amountOutStart.mul(PORTION_BIPS).div(BPS));
          expect(reparameterized.portionAmountOutEnd).toEqual(amountOutEnd.mul(PORTION_BIPS).div(BPS));
        }
      }
    );

    it.each([true, false])(
      'reparameterizes with wrap factored into startAmount with portion flag %p',
      async (enablePortion) => {
        const classicQuote = (
          enablePortion ? CLASSIC_QUOTE_EXACT_IN_NATIVE_WITH_PORTION : CLASSIC_QUOTE_EXACT_IN_NATIVE
        ) as ClassicQuote;
        const dutchQuote = enablePortion ? DL_QUOTE_NATIVE_EXACT_IN_LARGE_WITH_PORTION : DL_QUOTE_NATIVE_EXACT_IN_LARGE;
        const reparameterized = DutchQuoteFactory.reparameterize(dutchQuote, classicQuote);
        expect(reparameterized.request).toMatchObject(dutchQuote.request);

        const { amountIn: amountInClassic, amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
          {
            amountIn: classicQuote.amountInGasAdjusted,
            amountOut: classicQuote.amountOutGasAdjusted,
          },
          classicQuote
        );
        const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
          { amountIn: amountInClassic, amountOut: amountOutClassic },
          dutchQuote.request
        );

        expect(reparameterized.amountInStart).toEqual(dutchQuote.amountInStart);
        expect(reparameterized.amountOutStart.lte(dutchQuote.amountOutStart)).toBeTruthy();
        expect(reparameterized.amountInEnd).toEqual(amountInEnd);
        expect(reparameterized.amountOutEnd).toEqual(amountOutEnd);

        if (enablePortion) {
          expect(reparameterized.portion?.bips).toEqual(PORTION_BIPS);
          expect(reparameterized.portion?.recipient).toEqual(PORTION_RECIPIENT);
          expect(reparameterized.portionAmountOutStart).toEqual(
            reparameterized.amountOutStart.mul(PORTION_BIPS).div(BPS)
          );
          expect(reparameterized.portionAmountOutEnd).toEqual(amountOutEnd.mul(PORTION_BIPS).div(BPS));
        }
      }
    );
  });

  describe('decay parameters', () => {
    it('uses default parameters - RFQ', () => {
      const quote = createDutchQuoteWithRequestOverrides(
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
      expect(result.auctionPeriodSecs).toEqual(DEFAULT_AUCTION_PERIOD_SECS);
      expect(result.deadlineBufferSecs).toEqual(DEFAULT_DEADLINE_BUFFER_SECS);
    });

    it('uses default parameters - Open', () => {
      const quote = createDutchQuoteWithRequestOverrides(
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
      expect(result.auctionPeriodSecs).toEqual(DEFAULT_AUCTION_PERIOD_SECS);
      expect(result.deadlineBufferSecs).toEqual(DEFAULT_DEADLINE_BUFFER_SECS);
    });

    it('uses default parameters - polygon', () => {
      const quote = createDutchQuoteWithRequestOverrides(
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
      expect(result.auctionPeriodSecs).toEqual(DEFAULT_AUCTION_PERIOD_SECS);
      expect(result.deadlineBufferSecs).toEqual(DEFAULT_DEADLINE_BUFFER_SECS);
    });

    it('overrides parameters in request', () => {
      const quote = createDutchQuoteWithRequestOverrides(
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
      const result = quote.getPermitData();
      const expected = DL_PERMIT_RFQ;
      expect(_.isEqual(JSON.stringify(result), JSON.stringify(expected))).toBe(true);
      jest.clearAllTimers();
    });
  });

  describe('toJSON', () => {
    it.each([true, false])('Succeeds - Basic with portion flag %p', (enablePortion) => {
      const quote = createDutchQuote(
        { amountOut: '10000', filler: '0x1111111111111111111111111111111111111111' },
        'EXACT_INPUT',
        '1',
        enablePortion ? FLAT_PORTION : undefined,
        enablePortion
      ) as any;
      const result = quote.toJSON();
      expect(result).toMatchObject(enablePortion ? DUTCH_LIMIT_ORDER_JSON_WITH_PORTION : DUTCH_LIMIT_ORDER_JSON);
    });
  });

  describe('fromClassicQuote', () => {
    it.each([true, false])('Succeeds - Generates nonce on initialization with portion flag %p', (enablePortion) => {
      const classicQuote = createClassicQuote(
        (enablePortion && { portionBips: PORTION_BIPS, portionRecipient: PORTION_RECIPIENT }) || {},
        {}
      );
      const dutchQuote = createDutchQuote({}, 'EXACT_INPUT');
      const result = DutchQuoteFactory.fromClassicQuote(dutchQuote.request, classicQuote);
      const firstNonce = result.toOrder().info.nonce;
      const secondNonce = result.toOrder().info.nonce;
      expect(firstNonce).toEqual(secondNonce);

      if (enablePortion) {
        expect(result.portion?.bips).toEqual(PORTION_BIPS);
        expect(result.portion?.recipient).toEqual(PORTION_RECIPIENT);
        expect(result.portionAmountOutStart).toEqual(result.amountOutStart.mul(PORTION_BIPS).div(BPS));
        expect(result.portionAmountOutEnd).toEqual(result.amountOutEnd.mul(PORTION_BIPS).div(BPS));
      }
    });

    it.each([true, false])('applies gas adjustment to endAmount with portion flag %p', (enablePortion) => {
      const amount = '10000000000000000';
      const classicQuote = createClassicQuote(
        (enablePortion && { amount: amount, portionBips: PORTION_BIPS, portionRecipient: PORTION_RECIPIENT }) || {
          amount,
        },
        {}
      );
      const dutchQuote = createDutchQuote({ amountIn: amount }, 'EXACT_INPUT');
      const result = DutchQuoteFactory.fromClassicQuote(dutchQuote.request, classicQuote);
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

      if (enablePortion) {
        expect(result.portion?.bips).toEqual(PORTION_BIPS);
        expect(result.portion?.recipient).toEqual(PORTION_RECIPIENT);
        expect(result.portionAmountOutStart).toEqual(result.amountOutStart.mul(PORTION_BIPS).div(BPS));
        expect(result.portionAmountOutEnd).toEqual(result.amountOutEnd.mul(PORTION_BIPS).div(BPS));
      }
    });
  });

  describe('fromResponseBody (RFQ)', () => {
    it('properly appends portion order with correct output amount', () => {
      // portion is 12 bps
      const amountOut = AMOUNT;
      const dutchQuote = createDutchQuote({ amountOut }, 'EXACT_OUTPUT', '1', FLAT_PORTION, true);
      // since we add the amount to RFQ request
      const amountOutWithPortion = dutchQuote.amountOutStart.add(dutchQuote.portionAmountOutStart);
      // RFQ returns same as mock dutch quote
      const DL_QUOTE_JSON_RFQ: DutchQuoteJSON = {
        chainId: 1,
        requestId: '0xrequestId',
        quoteId: '0xquoteId',
        tokenIn: dutchQuote.tokenIn,
        amountIn: dutchQuote.amountInStart.toString(),
        tokenOut: dutchQuote.tokenOut,
        amountOut: amountOutWithPortion.toString(),
        swapper: '0x1111111111111111111111111111111111111111',
        filler: '0x1111111111111111111111111111111111111111',
      };
      expect(DL_QUOTE_JSON_RFQ.amountOut).toEqual(amountOutWithPortion.toString());

      const quote = DutchQuoteFactory.fromResponseBody(dutchQuote.request, DL_QUOTE_JSON_RFQ, '1', FLAT_PORTION);

      // expect the sum of outputs to be amountOutWithPortion,
      // but the first output to the swapper tob e amountOut, and the second output to be the portion to the recipient
      expect(quote.toJSON().orderInfo.outputs[0].startAmount).toEqual(amountOut);
      expect(quote.toJSON().orderInfo.outputs[0].endAmount).toEqual(amountOut);
      expect(quote.toJSON().orderInfo.outputs[1].startAmount).toEqual(dutchQuote.portionAmountOutStart.toString());
      expect(quote.toJSON().orderInfo.outputs[1].endAmount).toEqual(dutchQuote.portionAmountOutEnd.toString());
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
