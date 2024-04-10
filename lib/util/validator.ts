import { BigNumber, ethers } from 'ethers';
import Joi, { CustomHelpers } from 'joi';

import { SUPPORTED_CHAINS } from '../config/chains';

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
    .valid(...SUPPORTED_CHAINS.CLASSIC);

  public static readonly dutchChainId = Joi.number()
    .integer()
    .valid(...SUPPORTED_CHAINS.DUTCH_LIMIT);

  public static readonly tradeType = Joi.string().valid('EXACT_INPUT', 'EXACT_OUTPUT');

  public static readonly routingType = Joi.string().valid('CLASSIC', 'DUTCH_LIMIT', 'DUTCH_V2').messages({
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

  public static readonly forceCrossProtocol = Joi.boolean();

  public static readonly forceMixedRoutes = Joi.boolean();

  public static readonly positiveNumber = Joi.number().greater(0);

  public static readonly quoteSpeed = Joi.string().valid('fast', 'standard');

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
    forceCrossProtocol: FieldValidator.forceCrossProtocol.optional(),
    forceMixedRoutes: FieldValidator.forceMixedRoutes.optional(),
    slippageTolerance: FieldValidator.slippageTolerance.optional(),
    algorithm: FieldValidator.algorithm.optional(),
    quoteSpeed: FieldValidator.quoteSpeed.optional(),
    enableFeeOnTransferFeeFetching: Joi.boolean().optional(),
  });

  public static readonly dutchLimitConfig = Joi.object({
    routingType: Joi.string().valid('DUTCH_LIMIT'),
    swapper: FieldValidator.address.optional(),
    exclusivityOverrideBps: FieldValidator.positiveNumber.optional(),
    startTimeBufferSecs: FieldValidator.positiveNumber.optional(),
    auctionPeriodSecs: FieldValidator.positiveNumber.optional(),
    deadlineBufferSecs: FieldValidator.positiveNumber.optional(),
    slippageTolerance: FieldValidator.slippageTolerance.optional(),
    useSyntheticQuotes: Joi.boolean().optional(),
  });

  public static readonly dutchV2Config = Joi.object({
    routingType: Joi.string().valid('DUTCH_V2'),
    swapper: FieldValidator.address.optional(),
    deadlineBufferSecs: FieldValidator.positiveNumber.optional(),
    useSyntheticQuotes: Joi.boolean().optional(),
  });

  // quote response jois

  public static readonly classicQuoteResponse = Joi.object({
    requestId: Joi.string().required(),
    quoteId: Joi.string().required(),
    amount: Joi.string().required(),
    amountDecimals: Joi.string().required(),
    quote: Joi.string().required(),
    quoteDecimals: Joi.string().required(),
      quoteGasAdjusted: Joi.string().required(),
      quoteGasAdjustedDecimals: Joi.string().required(),
      gasUseEstimate: Joi.string().required(),
      gasUseEstimateQuote: Joi.string().required(),
      gasUseEstimateQuoteDecimals: Joi.string().required(),
      gasUseEstimateGasToken: Joi.string().optional(),
      gasUseEstimateGasTokenDecimals: Joi.string().optional(),
      gasUseEstimateUSD: Joi.string().required(),
      simulationError: Joi.boolean().optional(),
      simulationStatus: Joi.string().required(),
      gasPriceWei: Joi.string().required(),
      blockNumber: Joi.string().required(),
      route: Joi.array().items(Joi.array().items(Joi.object())).required(),
      routeString: Joi.string().required(),
      methodParameters: Joi.object().optional(),
      permitData: Joi.object().optional(),
      tradeType: Joi.string().required(),
      slippage: Joi.number().required(),
      portionBips: Joi.number().optional(),
      portionRecipient: Joi.string().optional(),
      portionAmount: Joi.string().optional(),
      portionAmountDecimals: Joi.string().optional(),
      quoteGasAndPortionAdjusted: Joi.string().optional(),
      quoteGasAndPortionAdjustedDecimals: Joi.string().optional(),
  })

  // shared quote response fields for off chain orders
  private static readonly _sharedOrderQuoteResponse = Joi.object({
    quoteId: Joi.string().required(),
    requestId: Joi.string().required(),
    encodedOrder: Joi.string().required(),
    orderHash: Joi.string().required(),
    slippageTolerance: Joi.string().required()
  })

  public static readonly dutchQuoteResponse = this._sharedOrderQuoteResponse.concat(Joi.object({
    orderInfo: Joi.object().required(),
    // these fields have default values that must be set
    startTimeBufferSecs: FieldValidator.positiveNumber.required(),
    auctionPeriodSecs: FieldValidator.positiveNumber.required(),
    deadlineBufferSecs: FieldValidator.positiveNumber.required(),
    permitData: Joi.object().required(),
    // optional response fields
    portionBips: Joi.number().optional(),
    portionAmount: Joi.string().optional(),
    portionRecipient: Joi.string().optional(),
  }))

  public static readonly dutchV2QuoteResponse = this._sharedOrderQuoteResponse.concat(Joi.object({
    orderInfo: Joi.object().required(),
    // these fields have default values that must be set
    deadlineBufferSecs: FieldValidator.positiveNumber.required(),
    permitData: Joi.object().required(),
    // optional response fields
    portionBips: Joi.number().optional(),
    portionAmount: Joi.string().optional(),
    portionRecipient: Joi.string().optional(),
  }))

  public static readonly relayQuoteResponse = this._sharedOrderQuoteResponse.concat(Joi.object({
    orderInfo: Joi.object().required(),
    // these fields have default values that must be set
    startTimeBufferSecs: FieldValidator.positiveNumber.required(),
    auctionPeriodSecs: FieldValidator.positiveNumber.required(),
    deadlineBufferSecs: FieldValidator.positiveNumber.required(),
    permitData: Joi.object().required(),
    classicQuoteData: this.classicQuoteResponse.required(),    
  }))

  public static readonly quoteResponse = Joi.valid(
    this.classicQuoteResponse,
    this.dutchQuoteResponse,
    this.dutchV2QuoteResponse,
    this.relayQuoteResponse
  )
}
