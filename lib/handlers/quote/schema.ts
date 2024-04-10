import Joi from 'joi';

import { FieldValidator } from '../../util/validator';

export const PostQuoteRequestBodyJoi = Joi.object({
  tokenInChainId: FieldValidator.classicChainId.required(),
  tokenOutChainId: FieldValidator.classicChainId.required(),
  tokenIn: Joi.string().alphanum().max(42).required(),
  tokenOut: Joi.string().alphanum().max(42).required(),
  amount: FieldValidator.amount.required(),
  type: FieldValidator.tradeType.required(),
  configs: Joi.array()
    .items(FieldValidator.classicConfig, FieldValidator.dutchLimitConfig, FieldValidator.dutchV2Config)
    .unique((a: any, b: any) => {
      return a.routingType === b.routingType;
    })
    .required()
    .min(1)
    .messages({
      'array.unique': 'Duplicate routingType in configs',
    }),
  swapper: FieldValidator.address.optional(),
  useUniswapX: Joi.boolean().default(false).optional(),
  sendPortionEnabled: Joi.boolean().default(false).optional(),
  intent: Joi.string().optional(),
});

export const PostQuoteResponseBodyJoi = Joi.object({
  routing: FieldValidator.routingType.required(),
  quote: FieldValidator.quoteResponse.required()
});
