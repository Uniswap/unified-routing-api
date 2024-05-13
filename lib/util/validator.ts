import { BigNumber, ethers } from 'ethers';
import Joi, { CustomHelpers } from 'joi';

import { ChainConfigManager } from '../config/ChainConfigManager';
import { BPS, RoutingType } from '../constants';
import { DutchConfigJSON, DutchV2ConfigJSON } from '../entities';

export class FieldValidator {
  public static readonly address = Joi.string().custom((value: string, helpers: CustomHelpers<string>) => {
    if (!ethers.utils.isAddress(value)) {
      return helpers.message({ custom: 'Invalid address' });
    }
    return ethers.utils.getAddress(value);
  });

  public static readonly amount = Joi.string().custom((value: string, helpers: CustomHelpers<string>) => {
    try {
      const result = BigNumber.from(value);
      if (result.lt(0)) {
        return helpers.message({ custom: 'Invalid amount: negative number' });
      } else if (result.gt(ethers.constants.MaxUint256)) {
        return helpers.message({ custom: 'Invalid amount: larger than UINT256_MAX' });
      }
    } catch {
      // bignumber error is a little ugly for API response so rethrow our own
      return helpers.message({ custom: 'Invalid amount' });
    }
    return value;
  });

  public static readonly uuid = Joi.string().uuid({ version: 'uuidv4' });

  public static readonly classicChainId = Joi.number()
    .integer()
    .valid(...ChainConfigManager.getChainIdsByRoutingType(RoutingType.CLASSIC));

  public static readonly dutchChainId = Joi.number()
    .integer()
    .valid(...ChainConfigManager.getChainIdsByRoutingType(RoutingType.DUTCH_LIMIT));

  public static readonly tradeType = Joi.string().valid('EXACT_INPUT', 'EXACT_OUTPUT');

  public static readonly routingType = Joi.string().valid('CLASSIC', 'DUTCH_LIMIT', 'DUTCH_V2', 'RELAY').messages({
    'any.only': 'Invalid routingType',
  });

  public static readonly algorithm = Joi.string().valid('alpha', 'legacy');

  public static readonly protocol = Joi.string().valid('v2', 'v3', 'mixed', 'V2', 'V3', 'MIXED');

  public static readonly protocols = Joi.array().items(FieldValidator.protocol);

  public static readonly gasPriceWei = Joi.string()
    .pattern(/^[0-9]+$/)
    .max(30);

  public static readonly permitSignature = Joi.string();

  public static readonly permitNonce = Joi.string();

  public static readonly enableUniversalRouter = Joi.boolean();

  public static readonly slippageTolerance = Joi.number().min(0).max(20); // 20%

  public static readonly exclusivityOverrideBps = Joi.number().min(0).max(10000); // 0 to 100%

  public static readonly deadline = Joi.number().greater(0).max(10800); // 180 mins, same as interface max;

  public static readonly minSplits = Joi.number().max(7);

  public static readonly maxSplits = Joi.number().max(7);

  public static readonly forceCrossProtocol = Joi.boolean();

  public static readonly forceMixedRoutes = Joi.boolean();

  public static readonly positiveNumber = Joi.number().greater(0);

  public static readonly quoteSpeed = Joi.string().valid('fast', 'standard');

  public static readonly bps = Joi.number().greater(0).max(BPS);

  public static readonly classicConfig = Joi.object({
    routingType: Joi.string().valid('CLASSIC'),
    protocols: FieldValidator.protocols.required(),
    gasPriceWei: FieldValidator.gasPriceWei.optional(),
    simulateFromAddress: FieldValidator.address.optional(),
    recipient: FieldValidator.address.optional(),
    permitSignature: FieldValidator.permitSignature.optional(),
    permitNonce: FieldValidator.permitNonce.optional(),
    permitExpiration: FieldValidator.positiveNumber.optional(),
    permitAmount: FieldValidator.amount.optional(),
    permitSigDeadline: FieldValidator.positiveNumber.optional(),
    enableUniversalRouter: FieldValidator.enableUniversalRouter.optional(),
    deadline: FieldValidator.deadline.optional(),
    minSplits: FieldValidator.minSplits.optional(),
    maxSplits: FieldValidator.maxSplits.optional(),
    forceCrossProtocol: FieldValidator.forceCrossProtocol.optional(),
    forceMixedRoutes: FieldValidator.forceMixedRoutes.optional(),
    algorithm: FieldValidator.algorithm.optional(),
    quoteSpeed: FieldValidator.quoteSpeed.optional(),
    enableFeeOnTransferFeeFetching: Joi.boolean().optional(),
  });

  public static readonly dutchLimitConfig = Joi.object<DutchConfigJSON>({
    routingType: Joi.string().valid('DUTCH_LIMIT'),
    swapper: FieldValidator.address.optional(),
    exclusivityOverrideBps: FieldValidator.positiveNumber.optional(),
    startTimeBufferSecs: FieldValidator.positiveNumber.optional(),
    auctionPeriodSecs: FieldValidator.positiveNumber.optional(),
    deadlineBufferSecs: FieldValidator.positiveNumber.optional(),
    useSyntheticQuotes: Joi.boolean().optional(),
    gasAdjustmentBps: FieldValidator.bps.optional(),
  });

  // extends a classic request config, but requires a gasToken and has optional parameters for the fee auction
  public static readonly relayConfig = this.classicConfig.keys({
    routingType: Joi.string().valid('RELAY'),
    gasToken: FieldValidator.address.required(),
    swapper: FieldValidator.address.optional(),
    startTimeBufferSecs: FieldValidator.positiveNumber.optional(),
    auctionPeriodSecs: FieldValidator.positiveNumber.optional(),
    deadlineBufferSecs: FieldValidator.positiveNumber.optional(),
    slippageTolerance: FieldValidator.slippageTolerance.optional(),
    amountInGasTokenStartOverride: FieldValidator.amount.optional(),
  });

  public static readonly dutchV2Config = Joi.object<DutchV2ConfigJSON>({
    routingType: Joi.string().valid('DUTCH_V2'),
    swapper: FieldValidator.address.optional(),
    deadlineBufferSecs: FieldValidator.positiveNumber.optional(),
    useSyntheticQuotes: Joi.boolean().optional(),
    gasAdjustmentBps: FieldValidator.bps.optional(),
  });
}
