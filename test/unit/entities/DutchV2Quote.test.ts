import Logger from 'bunyan';

import { it } from '@jest/globals';
import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import { BPS } from '../../../lib/constants';
import { DEFAULT_LABS_COSIGNER, DutchQuote } from '../../../lib/entities';
import { AMOUNT, ETH_IN, SWAPPER, TOKEN_IN } from '../../constants';
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

    it('buffer is subtracted from the output amounts for EXACT_INPUT', async () => {
      const amount = BigNumber.from(AMOUNT);
      const input = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const output = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const { input: bufferedInput, output: bufferedOutput } = DutchQuote.applyBufferToInputOutput(
        input,
        output,
        TradeType.EXACT_INPUT,
        10
      );
      expect(bufferedInput.startAmount).toEqual(amount);
      expect(bufferedInput.endAmount).toEqual(amount);
      expect(bufferedOutput.startAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS - 10)
          .div(BPS)
      );
      expect(bufferedOutput.endAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS - 10)
          .div(BPS)
      );
    });

    it('neg buffer is added to the output amounts for EXACT_INPUT', async () => {
      const amount = BigNumber.from(AMOUNT);
      const input = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const output = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const { input: bufferedInput, output: bufferedOutput } = DutchQuote.applyBufferToInputOutput(
        input,
        output,
        TradeType.EXACT_INPUT,
        -10
      );
      expect(bufferedInput.startAmount).toEqual(amount);
      expect(bufferedInput.endAmount).toEqual(amount);
      expect(bufferedOutput.startAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS + 10)
          .div(BPS)
      );
      expect(bufferedOutput.endAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS + 10)
          .div(BPS)
      );
    });

    it('buffer is added to the input amounts for EXACT_OUTPUT', async () => {
      const amount = BigNumber.from(AMOUNT);
      const input = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const output = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const { input: bufferedInput, output: bufferedOutput } = DutchQuote.applyBufferToInputOutput(
        input,
        output,
        TradeType.EXACT_OUTPUT,
        10
      );
      expect(bufferedOutput.startAmount).toEqual(amount);
      expect(bufferedOutput.endAmount).toEqual(amount);
      expect(bufferedInput.startAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS + 10)
          .div(BPS)
      );
      expect(bufferedInput.endAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS + 10)
          .div(BPS)
      );
    });

    it('neg buffer is subtracted from the input amounts for EXACT_OUTPUT', async () => {
      const amount = BigNumber.from(AMOUNT);
      const input = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const output = {
        token: TOKEN_IN,
        startAmount: amount,
        endAmount: amount,
        recipient: SWAPPER,
      };
      const { input: bufferedInput, output: bufferedOutput } = DutchQuote.applyBufferToInputOutput(
        input,
        output,
        TradeType.EXACT_OUTPUT,
        -10
      );
      expect(bufferedOutput.startAmount).toEqual(amount);
      expect(bufferedOutput.endAmount).toEqual(amount);
      expect(bufferedInput.startAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS - 10)
          .div(BPS)
      );
      expect(bufferedInput.endAmount).toEqual(
        BigNumber.from(amount)
          .mul(BPS - 10)
          .div(BPS)
      );
    });
  });
});
