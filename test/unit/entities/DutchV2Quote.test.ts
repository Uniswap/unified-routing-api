import Logger from 'bunyan';

import { it } from '@jest/globals';
import { RoutingType } from '../../../lib/constants';
import { DutchV2Quote, LABS_COSIGNER } from '../../../lib/entities';
import { ETH_IN, TOKEN_IN } from '../../constants';
import { createDutchQuote, makeDutchV2Request } from '../../utils/fixtures';

describe('DutchV2Quote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('fromV1Quote', () => {
    it('should create a v2 quote from a v1 quote', () => {
      const request = makeDutchV2Request({
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
      });
      const v1Quote = createDutchQuote({}, 'EXACT_INPUT', '1');
      const v2Quote = DutchV2Quote.fromV1Quote(request, v1Quote);
      expect(v2Quote).toBeDefined();
      expect(v2Quote.routingType).toEqual(RoutingType.DUTCH_V2);
      expect(v2Quote.amountOut).toEqual(v1Quote.amountOut);
      expect(v2Quote.amountIn).toEqual(v1Quote.amountIn);
    });
  });

  describe('toOrder', () => {
    it('should have proper json form', () => {
      const request = makeDutchV2Request({
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
      });
      const v1Quote = createDutchQuote({}, 'EXACT_INPUT', '1');
      const v2Quote = DutchV2Quote.fromV1Quote(request, v1Quote);
      const order = v2Quote.toOrder();

      const orderJson = order.toJSON();
      expect(orderJson.baseInput.startAmount).toEqual(v2Quote.amountIn.toString());
      expect(orderJson.baseOutputs.length).toEqual(1);
      expect(orderJson.baseOutputs[0].startAmount).toEqual(v2Quote.amountOut.toString());
      expect(orderJson.cosigner).toEqual(LABS_COSIGNER);
    });

    it('should serialize', () => {
      const request = makeDutchV2Request({
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
      });
      const v1Quote = createDutchQuote({}, 'EXACT_INPUT', '1');
      const v2Quote = DutchV2Quote.fromV1Quote(request, v1Quote);
      const order = v2Quote.toOrder();

      const serialized = order.serialize();
      expect(serialized).toBeDefined();
    });

    it('should hash for signing', () => {
      const request = makeDutchV2Request({
        tokenIn: ETH_IN,
        tokenOut: TOKEN_IN,
      });
      const v1Quote = createDutchQuote({}, 'EXACT_INPUT', '1');
      const v2Quote = DutchV2Quote.fromV1Quote(request, v1Quote);
      const order = v2Quote.toOrder();

      const hash = order.hash();
      expect(hash).toBeDefined();
      expect(hash.length).toEqual(66);
    });
  });
});
