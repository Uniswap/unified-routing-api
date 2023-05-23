import * as _ from 'lodash'

import { createClassicQuote } from '../../utils/fixtures';
import { UtilityTest } from '../../types';
import { PERMIT2, PERMIT_DETAILS } from '../../constants';
import { MaxUint160, MaxSigDeadline } from '@uniswap/permit2-sdk'

const tests: UtilityTest[] = [{
    testName: 'Succeeds - No Permit',
    input: {
        quote: createClassicQuote({}, 'EXACT_INPUT'),
        permitDetails: {
            ...PERMIT_DETAILS,
            amount: MaxUint160,
            expiration: MaxSigDeadline,
        },
    },
    output: {
        permit: null,
    },
},
{
    testName: 'Succeeds - No Permit',
    input: {
        quote: createClassicQuote({}, 'EXACT_INPUT'),
        permitDetails: null,
    },
    output: {
        permit: PERMIT2,
    },
}, {
    testName: 'Succeeds - Permit Not Enough',
    input: {
        quote: createClassicQuote({}, 'EXACT_INPUT'),
        permitDetails: {
            ...PERMIT_DETAILS,
            amount: '0',
        },
    },
    output: {
        permit: PERMIT2,
    },
},
{
    testName: 'Succeeds - Permit Expired',
    input: {
        quote: createClassicQuote({}, 'EXACT_INPUT'),
        permitDetails: {
            ...PERMIT_DETAILS,
            expiration: '0',
        },
    },
    output: {
        permit: PERMIT2,
    },
}
]

describe('ClassicQuote Unit Tests', () => {
    for (const test of tests) {
        const t = test

        // eslint-disable-next-line no-restricted-properties
        const testFn = t.only ? it.only : it

        testFn(t.testName, async () => {
            const { input, output } = t
            jest.useFakeTimers({
                now: 0
            })

            const result = input.quote.getPermit(input.permitDetails);
            expect(_.isEqual(result, output.permit)).toBe(true)
            jest.clearAllTimers()
        })
    }
})
