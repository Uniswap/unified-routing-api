import * as _ from 'lodash';
import { NATIVE_ADDRESS } from '../../../../lib/constants';
import { TokenFetcher } from '../../../../lib/fetchers/TokenFetcher';
import { ValidationError } from '../../../../lib/util/errors';
import { TOKEN_IN, USDC_ADDRESS, USDC_ADDRESS_POLYGON } from '../../../constants';
import { FetcherTest } from '../../../types';

const tests: FetcherTest[] = [
  {
    testName: 'Succeeds - Basic',
    input: {
      chainId: 1,
      address: TOKEN_IN,
    },
    output: TOKEN_IN,
  },
  {
    testName: 'Succeeds - Symbol',
    input: {
      chainId: 1,
      address: 'USDC',
    },
    output: USDC_ADDRESS,
  },
  {
    testName: 'Succeeds - ETH',
    input: {
      chainId: 1,
      address: 'ETH',
    },
    output: NATIVE_ADDRESS,
  },
  {
    testName: 'Succeeds - MATIC',
    input: {
      chainId: 137,
      address: 'MATIC',
    },
    output: NATIVE_ADDRESS,
  },
  {
    testName: 'Succeeds - Symbol Polygon',
    input: {
      chainId: 137,
      address: 'USDC',
    },
    output: USDC_ADDRESS_POLYGON,
  },
  {
    testName: 'Fails - Unknown Symbol',
    input: {
      chainId: 1,
      address: 'USDA',
    },
    output: {
      error: new ValidationError('Could not find token with symbol USDA'),
    },
    errorType: ValidationError,
  },
];

describe('TokenFetcher Unit Tests', () => {
  for (const test of tests) {
    const t = test;

    // eslint-disable-next-line no-restricted-properties
    const testFn = t.only ? it.only : it;

    testFn(t.testName, async () => {
      const { input, output } = t;

      try {
        const result = await new TokenFetcher().resolveTokenAddress(input.chainId, input.address);
        expect(_.isEqual(result, output)).toBe(true);
      } catch (e: any) {
        expect(e).toBeInstanceOf(t.errorType);
        expect(_.isEqual(e.message, t.output.error.message)).toBe(true);
      }
    });
  }
});
