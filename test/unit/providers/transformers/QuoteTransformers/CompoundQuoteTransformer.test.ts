import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { ethers } from 'ethers';

import {
  CompoundQuoteTransformer,
  OnlyConfiguredQuotersFilter,
  SyntheticUniswapXTransformer,
  UniswapXOrderSizeFilter,
} from '../../../../../lib/providers/transformers';
import { NoRouteBackToNativeFilter } from '../../../../../lib/providers/transformers/QuoteTransformers/NoRouteBackToNativeFilter';
import {
  createClassicQuote,
  createDutchLimitQuote,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../../../utils/fixtures';

// tests several transformers in tandem using the compound transformer
describe('CompoundQuoteTransformer', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  const transformer = new CompoundQuoteTransformer(
    [new SyntheticUniswapXTransformer(logger)],
    [
      new NoRouteBackToNativeFilter(logger),
      new UniswapXOrderSizeFilter(logger),
      new OnlyConfiguredQuotersFilter(logger),
    ]
  );

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
    expect(transformed[1].amountOut.gte(classicQuote.amountOutGasAdjusted)).toBeTruthy();
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

  it('Does not return synthetic quote with different data', async () => {
    // classic quote exists and both classic uniswapX is configured
    const dutchQuote = createDutchLimitQuote({ amountOut: ethers.utils.parseEther('2').toString() }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').sub(2000).toString(),
      },
      'EXACT_INPUT'
    );

    // random token
    classicQuote.request.info.tokenOut = '0x0000000000000000000000000000000000000000';

    const transformed = await transformer.transform([QUOTE_REQUEST_DL], [dutchQuote, classicQuote]);
    expect(transformed.length).toEqual(1);
    expect(transformed[0].routingType).toEqual(dutchQuote.routingType);
  });

  it('Filters dutch quote if output token has no route back to ETH', async () => {
    const dutchQuote = createDutchLimitQuote({ amountOut: ethers.utils.parseEther('2').toString() }, 'EXACT_INPUT');
    const classicQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').sub(2000).toString(),
      },
      'EXACT_INPUT'
    );

    const backToEthQuote = createClassicQuote(
      {
        quote: ethers.utils.parseEther('3').toString(),
        quoteGasAdjusted: ethers.utils.parseEther('3').toString(),
      },
      'EXACT_OUTPUT'
    );
    backToEthQuote.request.info.tokenIn = dutchQuote.request.info.tokenOut;
    backToEthQuote.request.info.tokenOut =
      WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(dutchQuote.request.info.tokenOutChainId)].address;

    const transformed = await transformer.transform(QUOTE_REQUEST_MULTI, [dutchQuote, classicQuote, backToEthQuote]);

    expect(transformed.length).toEqual(1);
    expect(transformed[0].routingType).toEqual(classicQuote.routingType);
  });
});
