import { createClassicQuote } from '../../../utils/fixtures';
import { getQuoteSizeEstimateUSD } from '../../../../lib/util/quoteMath';
import { BigNumber as BN } from 'bignumber.js';

describe('quoteMath', () => {
  describe('getQuoteSizeEstimateUSD', () => {
    it('should derive quote size from gas parameters of classic quote', () => {
      const quote = createClassicQuote({}, { type: 'EXACT_INPUT' });
      /*
       * gasPriceWei: 10000
       * gasUseEstimate: 100
       * gasUseEstimateUSD: 100
       * quote: 1000000000000000000
       * gasUseEstimateQuote: 100
       * 
       * quoteSizeUSD = (multiple of gas-cost-equivalent quote token) * (gas cost in USD)
       *               = (quote / gasUseEstimateQuote) * gasUseEstimateUSD
       *               = (1000000000000000000 / 100) * 100
      */
      expect(getQuoteSizeEstimateUSD(quote)).toStrictEqual(new BN('1000000000000000000'));
    })
  })
});
