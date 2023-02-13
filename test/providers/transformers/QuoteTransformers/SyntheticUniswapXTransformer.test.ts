import Logger from 'bunyan';

import { HUNDRED_PERCENT } from '../../../../lib/constants';
import { Quote, RoutingType } from '../../../../lib/entities';
import { SyntheticUniswapXTransformer } from '../../../../lib/providers/transformers';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_LARGE,
  CLASSIC_QUOTE_EXACT_OUT_LARGE,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_OUT_BETTER,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_MULTI,
  QUOTE_REQUEST_MULTI_EXACT_OUT,
} from '../../../utils/fixtures';

type QuoteByRoutingType = { [key in RoutingType]?: Quote };

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
        CLASSIC_QUOTE_EXACT_IN_LARGE.amountOutGasAdjusted.mul(101).div(100)
      );
    });

    it('adds a synthetic UniswapX quote even if RFQ quote exists', async () => {
      const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [
        DL_QUOTE_EXACT_IN_BETTER,
        CLASSIC_QUOTE_EXACT_IN_LARGE,
      ]);
      expect(transformed.length).toEqual(3);

      const outStartAmount = CLASSIC_QUOTE_EXACT_IN_LARGE.amountOutGasAdjusted.mul(101).div(100);
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
  });

  describe('exactOut', () => {
    it('adds a synthetic UniswapX quote if somehow RFQ service returned no quote', async () => {
      const transformed = await transformer.transform(QUOTE_REQUEST_MULTI_EXACT_OUT, [CLASSIC_QUOTE_EXACT_OUT_LARGE]);
      expect(transformed.length).toEqual(2);
      const quoteByRoutingType: QuoteByRoutingType = {};
      transformed.forEach((quote) => (quoteByRoutingType[quote.routingType] = quote));
      expect(quoteByRoutingType[RoutingType.DUTCH_LIMIT]?.amountIn).toEqual(
        CLASSIC_QUOTE_EXACT_OUT_LARGE.amountInGasAdjusted.mul(99).div(100)
      );
    });

    it('adds a synthetic UniswapX quote even if RFQ quote exists', async () => {
      const transformed = await transformer.transform(QUOTE_REQUEST_MULTI_EXACT_OUT, [
        DL_QUOTE_EXACT_OUT_BETTER,
        CLASSIC_QUOTE_EXACT_OUT_LARGE,
      ]);
      expect(transformed.length).toEqual(3);

      const outStartAmount = CLASSIC_QUOTE_EXACT_OUT_LARGE.amountInGasAdjusted.mul(99).div(100);
      const outEndAmount = outStartAmount.mul(HUNDRED_PERCENT.add(50)).div(HUNDRED_PERCENT);
      expect(transformed[2].toJSON()).toMatchObject({
        input: {
          startAmount: outStartAmount.toString(),
          endAmount: outEndAmount.toString(),
        },
      });
    });
  });
});