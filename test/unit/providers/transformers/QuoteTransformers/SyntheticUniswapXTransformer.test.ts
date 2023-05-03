import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import {
  GOUDA_BASE_GAS,
  HUNDRED_PERCENT,
  NATIVE_ADDRESS,
  RoutingType,
  WETH_UNWRAP_GAS,
  WETH_WRAP_GAS,
} from '../../../../../lib/constants';
import {
  applyGasAdjustment,
  ClassicQuote,
  getGasAdjustment,
  getWETHGasAdjustment,
  QuoteByRoutingType,
} from '../../../../../lib/entities';
import { SyntheticUniswapXTransformer } from '../../../../../lib/providers/transformers';
import { TOKEN_IN, TOKEN_OUT } from '../../../../constants';
import {
  CLASSIC_QUOTE_DATA,
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_LARGE,
  CLASSIC_QUOTE_EXACT_IN_NATIVE,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_NATIVE_EXACT_IN_BETTER,
  makeClassicRequest,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_ETH_IN_MULTI,
  QUOTE_REQUEST_MULTI,
} from '../../../../utils/fixtures';
import { buildQuoteResponse } from '../../../../utils/quoteResponse';

describe('SyntheticUniswapXTransformer', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  const transformer = new SyntheticUniswapXTransformer(logger);

  it('does not transform if UniswapX not requested', async () => {
    const transformed = await transformer.transform([QUOTE_REQUEST_CLASSIC], [CLASSIC_QUOTE_EXACT_IN_BETTER]);
    expect(transformed.length).toEqual(1);
    expect(transformed[0]).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
  });

  describe('exactIn', () => {
    it('adds a synthetic UniswapX quote if somehow RFQ service returned no quote', async () => {
      const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [CLASSIC_QUOTE_EXACT_IN_LARGE]);
      expect(transformed.length).toEqual(2);
      const quoteByRoutingType: QuoteByRoutingType = {};
      transformed.forEach((quote) => (quoteByRoutingType[quote.routingType] = quote));
      expect(quoteByRoutingType[RoutingType.DUTCH_LIMIT]?.amountOut).toEqual(
        applyGasAdjustment(CLASSIC_QUOTE_EXACT_IN_LARGE).amountOut
      );
    });

    it('adds a synthetic UniswapX quote even if RFQ quote exists', async () => {
      const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [
        DL_QUOTE_EXACT_IN_BETTER,
        CLASSIC_QUOTE_EXACT_IN_LARGE,
      ]);
      expect(transformed.length).toEqual(3);

      const outStartAmount = applyGasAdjustment(CLASSIC_QUOTE_EXACT_IN_LARGE).amountOut;
      const outEndAmount = outStartAmount.mul(HUNDRED_PERCENT.sub(50)).div(HUNDRED_PERCENT);
      expect(transformed[2].toJSON()).toMatchObject({
        outputs: [
          {
            startAmount: outStartAmount.toString(),
            endAmount: outEndAmount.toString(),
          },
        ],
      });
    });

    it('creates the synthetic quote accouting for weth wrap costs if RFQ is ETH in', async () => {
      const transformed = await transformer.transform(QUOTE_REQUEST_ETH_IN_MULTI, [
        DL_QUOTE_NATIVE_EXACT_IN_BETTER,
        CLASSIC_QUOTE_EXACT_IN_NATIVE,
      ]);

      expect(transformed.length).toEqual(3);

      const quoteByRoutingType: QuoteByRoutingType = {};
      transformed.forEach((quote) => (quoteByRoutingType[quote.routingType] = quote));

      // No change to the RFQ quote
      expect(transformed[0].amountOut).toEqual(DL_QUOTE_NATIVE_EXACT_IN_BETTER.amountOut);

      const outStartAmount = applyGasAdjustment(CLASSIC_QUOTE_EXACT_IN_NATIVE as ClassicQuote).amountOut;
      const outEndAmount = outStartAmount.mul(HUNDRED_PERCENT.sub(50)).div(HUNDRED_PERCENT);

      expect(transformed[2].toJSON()).toMatchObject({
        outputs: [
          {
            startAmount: outStartAmount.toString(),
            endAmount: outEndAmount.toString(),
          },
        ],
      });
    });

    describe('getWETHGasAdjustment', () => {
      it('returns wrap gas if native input', async () => {
        const quote = buildQuoteResponse(
          Object.assign({}, CLASSIC_QUOTE_DATA, {
            quote: {
              ...CLASSIC_QUOTE_DATA.quote,
            },
          }),
          makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: NATIVE_ADDRESS, tokenOut: TOKEN_OUT })
        ) as ClassicQuote;

        expect(getWETHGasAdjustment(quote)).toEqual(BigNumber.from(WETH_WRAP_GAS));
      });

      it('returns wrap gas if native input', async () => {
        const quote = buildQuoteResponse(
          Object.assign({}, CLASSIC_QUOTE_DATA, {
            quote: {
              ...CLASSIC_QUOTE_DATA.quote,
            },
          }),
          makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: TOKEN_IN, tokenOut: NATIVE_ADDRESS })
        ) as ClassicQuote;

        expect(getWETHGasAdjustment(quote)).toEqual(BigNumber.from(WETH_UNWRAP_GAS));
      });

      it('returns 0 if no native', async () => {
        const quote = buildQuoteResponse(
          Object.assign({}, CLASSIC_QUOTE_DATA, {
            quote: {
              ...CLASSIC_QUOTE_DATA.quote,
            },
          }),
          makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT })
        ) as ClassicQuote;

        expect(getWETHGasAdjustment(quote)).toEqual(BigNumber.from(0));
      });
    });
  });

  describe('getGasAdjustment', () => {
    it('returns wrap gas if native input including gouda base gas', async () => {
      const quote = buildQuoteResponse(
        Object.assign({}, CLASSIC_QUOTE_DATA, {
          quote: {
            ...CLASSIC_QUOTE_DATA.quote,
          },
        }),
        makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: NATIVE_ADDRESS, tokenOut: TOKEN_OUT })
      ) as ClassicQuote;

      expect(getGasAdjustment(quote)).toEqual(BigNumber.from(WETH_WRAP_GAS).add(GOUDA_BASE_GAS));
    });

    it('returns wrap gas if native input including gouda base gas', async () => {
      const quote = buildQuoteResponse(
        Object.assign({}, CLASSIC_QUOTE_DATA, {
          quote: {
            ...CLASSIC_QUOTE_DATA.quote,
          },
        }),
        makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: TOKEN_IN, tokenOut: NATIVE_ADDRESS })
      ) as ClassicQuote;

      expect(getGasAdjustment(quote)).toEqual(BigNumber.from(WETH_UNWRAP_GAS).add(GOUDA_BASE_GAS));
    });

    it('returns 0 if no native including gouda base gas', async () => {
      const quote = buildQuoteResponse(
        Object.assign({}, CLASSIC_QUOTE_DATA, {
          quote: {
            ...CLASSIC_QUOTE_DATA.quote,
          },
        }),
        makeClassicRequest({ type: 'EXACT_INPUT', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT })
      ) as ClassicQuote;

      expect(getGasAdjustment(quote)).toEqual(BigNumber.from(GOUDA_BASE_GAS));
    });
  });
});

// TODO: enable once we add back support for EXACT_OUTPUT UniX quote
// describe('exactOut', () => {
//   it('adds a synthetic UniswapX quote if somehow RFQ service returned no quote', async () => {
//     const transformed = await transformer.transform(QUOTE_REQUEST_MULTI_EXACT_OUT, [CLASSIC_QUOTE_EXACT_OUT_LARGE]);
//     expect(transformed.length).toEqual(2);
//     const quoteByRoutingType: QuoteByRoutingType = {};
//     transformed.forEach((quote) => (quoteByRoutingType[quote.routingType] = quote));
//     expect(quoteByRoutingType[RoutingType.DUTCH_LIMIT]?.amountIn).toEqual(
//       CLASSIC_QUOTE_EXACT_OUT_LARGE.amountInGasAdjusted.mul(DutchLimitQuote.improvementExactOut).div(HUNDRED_PERCENT)
//     );
//   });

//   it('adds a synthetic UniswapX quote even if RFQ quote exists', async () => {
//     const transformed = await transformer.transform(QUOTE_REQUEST_MULTI_EXACT_OUT, [
//       DL_QUOTE_EXACT_OUT_BETTER,
//       CLASSIC_QUOTE_EXACT_OUT_LARGE,
//     ]);
//     expect(transformed.length).toEqual(3);

//     const outStartAmount = CLASSIC_QUOTE_EXACT_OUT_LARGE.amountInGasAdjusted
//       .mul(DutchLimitQuote.improvementExactOut)
//       .div(HUNDRED_PERCENT);
//     const outEndAmount = outStartAmount.mul(HUNDRED_PERCENT.add(50)).div(HUNDRED_PERCENT);
//     expect(transformed[2].toJSON()).toMatchObject({
//       input: {
//         startAmount: outStartAmount.toString(),
//         endAmount: outEndAmount.toString(),
//       },
//     });
//   });
// });
// });
