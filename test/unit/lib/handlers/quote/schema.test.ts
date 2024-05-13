import { PostQuoteRequestBodyJoi } from '../../../../../lib/handlers/quote';
import { FieldValidator } from '../../../../../lib/util/validator';
import {
  AMOUNT,
  CHAIN_IN_ID,
  CHAIN_OUT_ID,
  CLASSIC_CONFIG,
  DL_CONFIG,
  DUTCH_V2_CONFIG,
  RELAY_CONFIG,
  TOKEN_IN,
  TOKEN_OUT,
} from '../../../../constants';

const DL_CONFIG_JSON = {
  ...DL_CONFIG,
  routingType: 'DUTCH_LIMIT',
};

const DUTCH_V2_CONFIG_JSON = {
  ...DUTCH_V2_CONFIG,
  routingType: 'DUTCH_V2',
};

const CLASSIC_CONFIG_JSON = {
  ...CLASSIC_CONFIG,
  routingType: 'CLASSIC',
};

const RELAY_CONFIG_JSON = {
  ...RELAY_CONFIG,
  routingType: 'RELAY',
};

const BASE_REQUEST_BODY = {
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT,
  type: 'EXACT_INPUT',
  configs: [DL_CONFIG_JSON, RELAY_CONFIG_JSON, CLASSIC_CONFIG_JSON],
};

describe('Post quote request validation', () => {
  describe('config validation', () => {
    it('should validate dutch limit config', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate(DL_CONFIG_JSON);
      expect(error).toBeUndefined();
    });

    it('should validate dutch v2 config', () => {
      const { error } = FieldValidator.dutchV2Config.validate(DUTCH_V2_CONFIG_JSON);
      expect(error).toBeUndefined();
    });

    it('should reject dutch v2 config as dutch v1', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate(DUTCH_V2_CONFIG_JSON);
      expect(error).toBeDefined();
      expect(error?.message).toEqual('"routingType" must be [DUTCH_LIMIT]');
    });

    it('should reject invalid routingType', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate({
        ...DL_CONFIG_JSON,
        routingType: 'INVALID',
      });
      expect(error).toBeDefined();
      expect(error?.message).toEqual('"routingType" must be [DUTCH_LIMIT]');
    });

    it('should reject invalid gasAdjustmentBps', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate({
        ...DL_CONFIG_JSON,
        gasAdjustmentBps: -1,
      });
      expect(error).toBeDefined();
      expect(error?.message).toEqual('"gasAdjustmentBps" must be greater than 0');
    });

    it('should reject invalid gasAdjustmentBps for v2', () => {
      const { error } = FieldValidator.dutchV2Config.validate({
        ...DUTCH_V2_CONFIG_JSON,
        gasAdjustmentBps: -1,
      });
      expect(error).toBeDefined();
      expect(error?.message).toEqual('"gasAdjustmentBps" must be greater than 0');
    });

    it('should reject invalid slippage', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate({
        ...DL_CONFIG_JSON,
        slippage: -1,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid deadline', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate({
        ...DL_CONFIG_JSON,
        deadline: -1,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid recipient', () => {
      const { error } = FieldValidator.dutchLimitConfig.validate({
        ...DL_CONFIG_JSON,
        recipient: '0x',
      });
      expect(error).toBeDefined();
    });

    it('should validate classic config', () => {
      const { error } = FieldValidator.classicConfig.validate(CLASSIC_CONFIG_JSON);
      expect(error).toBeUndefined();
    });

    it('should validate relay config', () => {
      const { error } = FieldValidator.relayConfig.validate(RELAY_CONFIG_JSON);
      expect(error).toBeUndefined();
    });

    it('should reject invalid gasToken', () => {
      const { error } = FieldValidator.relayConfig.validate({
        ...RELAY_CONFIG_JSON,
        gasToken: '0x',
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid routingType', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        routingType: 'INVALID',
      });
      expect(error).toBeDefined();
      expect(error?.message).toEqual('"routingType" must be [CLASSIC]');
    });

    it('should reject invalid protocols', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        protocols: ['INVALID'],
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid gasPriceWei', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        gasPriceWei: '-1',
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid simulateFromAddress', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        simulateFromAddress: '0x',
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid permitExpiration', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        permitExpiration: -1,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid permitAmount', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        permitAmount: '-1',
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid permitSigDeadline', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        permitSigDeadline: -1,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid deadline', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        deadline: 20000,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid minSplits', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        minSplits: 8,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid maxSplits', () => {
      const { error } = FieldValidator.classicConfig.validate({
        ...CLASSIC_CONFIG_JSON,
        maxSplits: 8,
      });
      expect(error).toBeDefined();
    });
  });

  it('should validate a complete request', () => {
    const { error } = PostQuoteRequestBodyJoi.validate(BASE_REQUEST_BODY);
    expect(error).toBeUndefined();
  });

  it('should reject invalid tokenInChainId', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      tokenInChainId: 0,
    });
    expect(error).toBeDefined();
  });

  it('should reject invalid tokenOutChainId', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      tokenOutChainId: 0,
    });
    expect(error).toBeDefined();
  });

  it('should reject invalid tokenIn', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      tokenIn: '0xzzz#',
    });
    expect(error).toBeDefined();
  });

  it('should reject invalid tokenOut', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      tokenOut: '0xzzz#',
    });
    expect(error).toBeDefined();
  });

  it('should reject invalid amount', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      amount: '-1',
    });
    expect(error).toBeDefined();
  });

  it('should reject invalid exclusivity', () => {
    let { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      exclusivityOverrideBps: 10001,
    });
    expect(error).toBeDefined();

    ({ error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      exclusivityOverrideBps: -1,
    }));
    expect(error).toBeDefined();
  });

  it('should reject invalid type', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      type: 'INVALID',
    });
    expect(error).toBeDefined();
  });

  it('should reject missing tokenIn', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      tokenInChainId: CHAIN_IN_ID,
      tokenOutChainId: CHAIN_OUT_ID,
      tokenOut: TOKEN_OUT,
      amount: AMOUNT,
      type: 'EXACT_INPUT',
      configs: [DL_CONFIG_JSON, CLASSIC_CONFIG_JSON],
    });
    expect(error).toBeDefined();
    expect(error?.details[0].message).toEqual('"tokenIn" is required');
  });

  it('should reject no configs', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      configs: [],
    });
    expect(error).toBeDefined();
  });

  it('should reject duplicate configs of same routingType', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      configs: [
        {
          ...CLASSIC_CONFIG_JSON,
        },
        {
          ...DL_CONFIG_JSON,
        },
        {
          ...CLASSIC_CONFIG_JSON,
          protocols: ['V2'],
        },
      ],
    });
    expect(error).toBeDefined();
    expect(error?.message).toEqual('Duplicate routingType in configs');
  });

  it('should reject a malformed config among multiple', () => {
    const { error } = PostQuoteRequestBodyJoi.validate({
      ...BASE_REQUEST_BODY,
      configs: [
        {
          ...CLASSIC_CONFIG_JSON,
        },
        {
          ...DL_CONFIG_JSON,
          auctionPeriodSeconds: -1,
        },
      ],
    });
    expect(error).toBeDefined();
    expect(error?.message).toEqual('"configs[1]" does not match any of the allowed types');
  });
});
