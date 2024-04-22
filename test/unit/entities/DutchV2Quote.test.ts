import Logger from 'bunyan';

import { it } from '@jest/globals';
import { DEFAULT_LABS_COSIGNER } from '../../../lib/entities';
import { ETH_IN, TOKEN_IN } from '../../constants';
import { createDutchV2QuoteWithRequest } from '../../utils/fixtures';

describe('DutchV2Quote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('toOrder', () => {
    it('should have proper json form', () => {
      const v2Quote = createDutchV2QuoteWithRequest({}, {
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
        type: 'EXACT_INPUT'
      })
      const order = v2Quote.toOrder();

      const orderJson = order.toJSON();
      expect(orderJson.input.startAmount).toEqual(v2Quote.amountIn.toString());
      expect(orderJson.outputs.length).toEqual(1);
      expect(orderJson.outputs[0].startAmount).toEqual(v2Quote.amountOut.toString());
      expect(orderJson.cosigner).toEqual(DEFAULT_LABS_COSIGNER);
    });

    it('should serialize', () => {
      const v2Quote = createDutchV2QuoteWithRequest({}, {
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
        type: 'EXACT_INPUT'
      })
      const order = v2Quote.toOrder();

      const serialized = order.serialize();
      expect(serialized).toBeDefined();
    });

    it('should hash for signing', () => {
      const v2Quote = createDutchV2QuoteWithRequest({}, {
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
        type: 'EXACT_INPUT'
      })
      const order = v2Quote.toOrder();

      const hash = order.hash();
      expect(hash).toBeDefined();
      expect(hash.length).toEqual(66);
    });
  });
});
