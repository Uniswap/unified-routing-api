import { MaxSigDeadline, MaxUint160 } from '@uniswap/permit2-sdk';
import { PERMIT2, PERMIT2_USED, PERMIT_DETAILS } from '../../constants';
import { UtilityTest } from '../../types';
import { createClassicQuote } from '../../utils/fixtures';

const tests: UtilityTest[] = [
  {
    testName: 'Succeeds - No Permit',
    input: {
      quote: createClassicQuote({}, { type: 'EXACT_INPUT' }),
      permitDetails: {
        ...PERMIT_DETAILS,
        amount: MaxUint160,
        expiration: MaxSigDeadline,
      },
    },
    output: {
      permit: undefined,
    },
  },
  {
    testName: 'Succeeds - No Offerer',
    input: {
      quote: createClassicQuote({}, { type: 'EXACT_INPUT', offerer: undefined }),
      permitDetails: PERMIT_DETAILS,
    },
    output: {
      permit: undefined,
    },
  },
  {
    testName: 'Succeeds - No Permit',
    input: {
      quote: createClassicQuote({}, { type: 'EXACT_INPUT' }),
      permitDetails: null,
    },
    output: {
      permit: PERMIT2,
    },
  },
  {
    testName: 'Succeeds - Permit Not Enough',
    input: {
      quote: createClassicQuote({}, { type: 'EXACT_INPUT' }),
      permitDetails: {
        ...PERMIT_DETAILS,
        amount: '0',
      },
    },
    output: {
      permit: PERMIT2_USED,
    },
  },
  {
    testName: 'Succeeds - Permit Expired',
    input: {
      quote: createClassicQuote({}, { type: 'EXACT_INPUT' }),
      permitDetails: {
        ...PERMIT_DETAILS,
        expiration: '0',
      },
    },
    output: {
      permit: PERMIT2_USED,
    },
  },
];

describe('ClassicQuote Unit Tests', () => {
  for (const test of tests) {
    const t = test;

    // eslint-disable-next-line no-restricted-properties
    const testFn = t.only ? it.only : it;

    testFn(t.testName, async () => {
      const { input, output } = t;
      jest.useFakeTimers({
        now: 0,
      });

      input.quote.setAllowanceData(input.permitDetails);
      const result = input.quote.getPermitData();

      if (!output.permit) {
        expect(result).toBeUndefined();
      } else {
        expect(result).toMatchObject(output.permit);
      }
      jest.clearAllTimers();
    });
  }
});
