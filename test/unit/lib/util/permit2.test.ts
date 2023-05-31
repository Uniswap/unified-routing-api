import { createPermitData } from '../../../../lib/util/permit2'
import * as _ from 'lodash'
import { UtilityTest } from '../../../types'
import { PERMIT2, PERMIT2_POLYGON, TOKEN_IN } from '../../../constants'

const tests: UtilityTest[] = [{
  testName: 'Succeeds - Basic',
  input: {
    token: TOKEN_IN,
    chainId: 1,
    nonce: '0'
  },
  output: {
    permit: PERMIT2
  },
},
{
  testName: 'Succeeds - Basic Polygon',
  input: {
    token: TOKEN_IN,
    chainId: 137,
    nonce: '0'
  },
  output: {
    permit: PERMIT2_POLYGON
  },
}
]

describe('permit2 Unit Tests', () => {
    for (const test of tests) {
      const t = test
  
      // eslint-disable-next-line no-restricted-properties
      const testFn = t.only ? it.only : it
  
      testFn(t.testName, async () => {
        const { input, output } = t
        jest.useFakeTimers({
          now: 0
        })
  
        try {
          const result = createPermitData(input.token, input.chainId, input.nonce)
          expect(_.isEqual(result, output.permit)).toBe(true)
        } catch (e: any) {
          expect(e).toBeInstanceOf(t.errorType)
          expect(_.isEqual(e.message, t.output.error.message)).toBe(true)
        }
        jest.clearAllTimers()
    })
    }
  })
