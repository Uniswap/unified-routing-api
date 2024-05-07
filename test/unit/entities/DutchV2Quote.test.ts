import Logger from 'bunyan';

import { it } from '@jest/globals';
import { BigNumber } from 'ethers';
import { BPS } from '../../../lib/constants';
import { DEFAULT_LABS_COSIGNER } from '../../../lib/entities';
import { AMOUNT, ETH_IN, TOKEN_IN } from '../../constants';
import { createDutchV2QuoteWithRequestOverrides } from '../../utils/fixtures';

describe('DutchV2Quote', () => {
  //setChainConfigManager();
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('toOrder', () => {
    it('should have proper json form', () => {
      const v2Quote = createDutchV2QuoteWithRequestOverrides(
        {},
        {
          tokenIn: ETH_IN,
          tokenOut: TOKEN_IN,
          type: 'EXACT_INPUT',
        }
      );
      const order = v2Quote.toOrder();

      const orderJson = order.toJSON();
      expect(orderJson.input.startAmount).toEqual(v2Quote.amountIn.toString());
      expect(orderJson.outputs.length).toEqual(1);
      expect(orderJson.outputs[0].startAmount).toEqual(
        BigNumber.from(AMOUNT) // Default starting amount out in createDutchV2QuoteWithRequestOverrides
          .mul(BPS - 10)
          .div(BPS)
          .toString()
      );
      expect(orderJson.cosigner).toEqual(DEFAULT_LABS_COSIGNER);
    });

    it('should serialize', () => {
      const v2Quote = createDutchV2QuoteWithRequestOverrides(
        {},
        {
          tokenIn: ETH_IN,
          tokenOut: TOKEN_IN,
          type: 'EXACT_INPUT',
        }
      );
      const order = v2Quote.toOrder();

      const serialized = order.serialize();
      expect(serialized).toBeDefined();
    });

    it('should hash for signing', () => {
      const v2Quote = createDutchV2QuoteWithRequestOverrides(
        {},
        {
          tokenIn: ETH_IN,
          tokenOut: TOKEN_IN,
          type: 'EXACT_INPUT',
        }
      );
      const order = v2Quote.toOrder();

      const hash = order.hash();
      expect(hash).toBeDefined();
      expect(hash.length).toEqual(66);
    });
  });
});
