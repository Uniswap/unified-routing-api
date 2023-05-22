import { TokenFetcher } from '../../../../lib/fetchers/TokenFetcher'
import * as _ from 'lodash'
import { FetcherTest } from '../../../types'
import { TOKEN_IN, USDC_ADDRESS } from '../../../constants';
import { ValidationError } from '../../../../lib/util/errors';

const tests: FetcherTest[] = [
  {
    testName: 'Succeeds - Basic',
    input: {
      chainId: 1,
      address: TOKEN_IN
    },
    output: TOKEN_IN,
  },
  {
    testName: 'Succeeds - Symbol',
    input: {
      chainId: 1,
      address: 'USDC'
    },
    output: USDC_ADDRESS,
  },
  {
    testName: 'Fails - Unkwnon Symbol',
    input: {
      chainId: 1,
      address: 'USDA'
    },
    output: {
      error: new ValidationError('Could not find token with symbol USDA')
    },
    errorType: ValidationError,
  },
]

describe.only('TokenFetcher Unit Tests', () => {
  for (const test of tests) {
    const t = test

    // eslint-disable-next-line no-restricted-properties
    const testFn = t.only ? it.only : it

    testFn(t.testName, async () => {
      const { input, output } = t

      try {
        const result = await new TokenFetcher().getTokenAddressFromList(input.chainId, input.address)
        expect(_.isEqual(result, output)).toBe(true)
      } catch (e: any) {
        expect(e).toBeInstanceOf(t.errorType)
        expect(_.isEqual(e.message, t.output.error.message)).toBe(true)
      }
  })
  }
})
