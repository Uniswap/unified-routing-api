import Logger from 'bunyan';
import { ethers } from 'ethers';

import {
  CompoundQuoteTransformer,
  OnlyConfiguredQuotersFilter,
  SyntheticUniswapXTransformer,
  UniswapXOrderSizeFilter,
} from '../../../../lib/providers/transformers';
import {
  createClassicQuote,
  createDutchLimitQuote,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../../utils/fixtures';

describe('Quote Transformers Integration', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new CompoundQuoteTransformer([
    new SyntheticUniswapXTransformer(logger),
    new UniswapXOrderSizeFilter(logger),
    new OnlyConfiguredQuotersFilter(logger),
  ]);

  it('creates a winning uniswpaX order from routingAPI data', async () => {
    // classic quote exists and both classic uniswapX is configured
    const dutchQuote = createDutchLimitQuote({ amountOut: ethers.utils.parseEther('2').toString() }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').sub(2000).toString(),
      },
      'EXACT_INPUT'
    );

    const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [dutchQuote, classicQuote]);
    expect(transformed.length).toEqual(3);
    expect(transformed[0].routingType).toEqual(dutchQuote.routingType);
    expect(transformed[1].routingType).toEqual(classicQuote.routingType);
    expect(transformed[2].routingType).toEqual(dutchQuote.routingType);
    expect(transformed[2].amountOut.gt(dutchQuote.amountOut)).toBeTruthy();
  });

  it('Filters out original dutch quote if too small', async () => {
    // classic quote exists and both classic uniswapX is configured
    const dutchQuote = createDutchLimitQuote({ amountOut: '10000' }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').sub(200000).toString(),
      },
      'EXACT_INPUT'
    );

    const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [dutchQuote, classicQuote]);
    expect(transformed.length).toEqual(2);
    expect(transformed[0].routingType).toEqual(classicQuote.routingType);
    expect(transformed[1].routingType).toEqual(dutchQuote.routingType);
    expect(transformed[1].amountOut.gt(dutchQuote.amountOut)).toBeTruthy();
  });

  it('Filters out both dutch quotes if too small', async () => {
    // classic quote exists and both classic uniswapX is configured
    const dutchQuote = createDutchLimitQuote({ amountOut: '10000' }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: '100000',
        quoteGasAdjusted: '80000',
      },
      'EXACT_INPUT'
    );

    const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [dutchQuote, classicQuote]);
    expect(transformed.length).toEqual(1);
    expect(transformed[0].routingType).toEqual(classicQuote.routingType);
  });

  it('Filters classic quotes if not requested', async () => {
    // classic quote exists and both classic uniswapX is configured
    const dutchQuote = createDutchLimitQuote({ amountOut: ethers.utils.parseEther('2').toString() }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').sub(2000).toString(),
      },
      'EXACT_INPUT'
    );

    const transformed = await transformer.transform([QUOTE_REQUEST_DL], [dutchQuote, classicQuote]);
    expect(transformed.length).toEqual(2);
    expect(transformed[0].routingType).toEqual(dutchQuote.routingType);
    expect(transformed[1].routingType).toEqual(dutchQuote.routingType);
    expect(transformed[1].amountOut.gt(classicQuote.amountOut)).toBeTruthy();
  });

  it('Filters dutch quotes if not requested', async () => {
    // classic quote exists and both classic uniswapX is configured
    const dutchQuote = createDutchLimitQuote({ amountOut: ethers.utils.parseEther('2').toString() }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').sub(2000).toString(),
      },
      'EXACT_INPUT'
    );

    const transformed = await transformer.transform([QUOTE_REQUEST_CLASSIC], [dutchQuote, classicQuote]);
    expect(transformed.length).toEqual(1);
    expect(transformed[0].routingType).toEqual(classicQuote.routingType);
  });
});
