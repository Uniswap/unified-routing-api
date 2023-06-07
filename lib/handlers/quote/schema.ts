import Joi from 'joi';

import { FieldValidator } from '../../util/validator';

export const PostQuoteRequestBodyJoi = Joi.object({
  tokenInChainId: FieldValidator.classicChainId.required(),
  tokenOutChainId: FieldValidator.classicChainId.required(),

  // TODO: consider that routing-api accepts token names if it can resolve them
  // dutch limit flow should probably do the same
  tokenIn: Joi.string().alphanum().max(42).required(),
  tokenOut: Joi.string().alphanum().max(42).required(),
  amount: FieldValidator.amount.required(),
  type: FieldValidator.tradeType.required(),
  configs: Joi.array()
    .items(FieldValidator.classicConfig, FieldValidator.dutchLimitConfig)
    .unique((a: any, b: any) => {
      return a.routingType === b.routingType;
    })
    .required()
    .min(1)
    .messages({
      'array.unique': 'Duplicate routingType in configs',
    }),
  offerer: FieldValidator.address.optional(),
});
