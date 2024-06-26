import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { ChainConfigManager } from '../../config/ChainConfigManager';
import { NATIVE_ADDRESS, QuoteType, RoutingType } from '../../constants';
import { Portion } from '../../fetchers/PortionFetcher';
import { log } from '../../util/log';
import { generateRandomNonce } from '../../util/nonce';
import { currentTimestampInMs } from '../../util/time';
import { DutchQuoteRequest, DutchV1Request, DutchV2Request } from '../request';
import { ClassicQuote } from './ClassicQuote';
import { DutchQuote, DutchQuoteConstructorArgs, DutchQuoteJSON, ParameterizationOptions } from './DutchQuote';
import { DutchV1Quote } from './DutchV1Quote';
import { DutchV2Quote } from './DutchV2Quote';

export class DutchQuoteFactory {
  // build a dutch quote from an RFQ response
  public static fromResponseBody(
    request: DutchQuoteRequest,
    body: DutchQuoteJSON,
    nonce?: string,
    portion?: Portion
  ): DutchQuote<DutchQuoteRequest> {
    // if it's exact out, we will explicitly define the amount out start to be the swapper's requested amount
    const amountOutStart =
      request.info.type === TradeType.EXACT_OUTPUT ? request.info.amount : BigNumber.from(body.amountOut);
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(
      { amountIn: BigNumber.from(body.amountIn), amountOut: amountOutStart },
      request
    );
    const args: DutchQuoteConstructorArgs = {
      createdAtMs: currentTimestampInMs(),
      request,
      tokenInChainId: body.chainId,
      tokenOutChainId: body.chainId,
      requestId: body.requestId,
      quoteId: body.quoteId,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amountInStart: BigNumber.from(body.amountIn),
      amountInEnd,
      amountOutStart,
      amountOutEnd,
      swapper: body.swapper,
      quoteType: QuoteType.RFQ,
      filler: body.filler,
      nonce,
      portion,
    };
    if (request instanceof DutchV1Request) {
      return new DutchV1Quote(args);
    }
    if (request instanceof DutchV2Request) {
      return new DutchV2Quote(args);
    }
    throw new Error(`Unexpected request type ${typeof request}`);
  }

  // build a synthetic dutch quote from a classic quote
  public static fromClassicQuote(request: DutchQuoteRequest, quote: ClassicQuote): DutchQuote<DutchQuoteRequest> {
    const chainId = request.info.tokenInChainId;
    const quoteConfig = ChainConfigManager.getQuoteConfig(chainId, request.routingType);
    const priceImprovedStartAmounts = DutchQuote.applyPriceImprovement(
      { amountIn: quote.amountInGasAdjusted, amountOut: quote.amountOutGasAdjusted },
      request.info.type,
      request.config.priceImprovementBps ?? quoteConfig.priceImprovementBps
    );
    const startAmounts = DutchQuote.applyPreSwapGasAdjustment(priceImprovedStartAmounts, quote);

    const gasAdjustedAmounts = DutchQuote.applyGasAdjustment(startAmounts, quote);
    const endAmounts = DutchQuote.applySlippage(gasAdjustedAmounts, request);

    log.info('Synthetic quote parameterization', {
      priceImprovedAmountIn: priceImprovedStartAmounts.amountIn.toString(),
      priceImprovedAmountOut: priceImprovedStartAmounts.amountOut.toString(),
      startAmountIn: startAmounts.amountIn.toString(),
      startAmountOut: startAmounts.amountOut.toString(),
      gasAdjustedAmountIn: gasAdjustedAmounts.amountIn.toString(),
      gasAdjustedAmountOut: gasAdjustedAmounts.amountOut.toString(),
      slippageAdjustedAmountIn: endAmounts.amountIn.toString(),
      slippageAdjustedAmountOut: endAmounts.amountOut.toString(),
    });

    const args: DutchQuoteConstructorArgs = {
      createdAtMs: quote.createdAtMs,
      request,
      tokenInChainId: request.info.tokenInChainId,
      tokenOutChainId: request.info.tokenInChainId,
      requestId: request.info.requestId,
      quoteId: uuidv4(), // synthetic quote doesn't receive a quoteId from RFQ api, so generate one
      tokenIn: request.info.tokenIn,
      tokenOut: quote.request.info.tokenOut,
      amountInStart: startAmounts.amountIn,
      amountInEnd: endAmounts.amountIn,
      amountOutStart: startAmounts.amountOut,
      amountOutEnd: endAmounts.amountOut,
      swapper: request.config.swapper,
      quoteType: QuoteType.SYNTHETIC,
      filler: NATIVE_ADDRESS, // synthetic quote has no filler
      nonce: generateRandomNonce(), // synthetic quote has no nonce
      portion: quote.portion,
    };
    if (request.routingType == RoutingType.DUTCH_LIMIT) {
      return new DutchV1Quote(args);
    }
    if (request.routingType == RoutingType.DUTCH_V2) {
      return new DutchV2Quote(args);
    }
    throw new Error(`Unexpected request type ${typeof request}`);
  }

  // reparameterize an RFQ quote with awareness of classic
  public static reparameterize(
    quote: DutchQuote<DutchQuoteRequest>,
    classic?: ClassicQuote,
    options?: ParameterizationOptions
  ): DutchQuote<DutchQuoteRequest> {
    if (!classic) return quote;

    const { amountIn: amountInStart, amountOut: amountOutStart } = DutchQuote.applyPreSwapGasAdjustment(
      { amountIn: quote.amountInStart, amountOut: quote.amountOutStart },
      classic,
      options
    );

    const classicAmounts = DutchQuote.applyGasAdjustment(
      { amountIn: classic.amountInGasAdjusted, amountOut: classic.amountOutGasAdjusted },
      classic,
      quote.request.config.gasAdjustmentBps
    );
    const { amountIn: amountInEnd, amountOut: amountOutEnd } = DutchQuote.applySlippage(classicAmounts, quote.request);

    log.info('RFQ quote parameterization', {
      startAmountIn: amountInStart.toString(),
      startAmountOut: amountOutStart.toString(),
      gasAdjustedClassicAmountIn: classicAmounts.amountIn.toString(),
      gasAdjustedClassicAmountOut: classicAmounts.amountOut.toString(),
      slippageAdjustedClassicAmountIn: amountInEnd.toString(),
      slippageAdjustedClassicAmountOut: amountOutEnd.toString(),
    });

    const args: DutchQuoteConstructorArgs = {
      ...quote,
      tokenInChainId: quote.chainId,
      tokenOutChainId: quote.chainId,
      amountInStart,
      amountInEnd,
      amountOutStart,
      amountOutEnd,
      portion: quote.portion ?? classic.portion,
      derived: {
        largeTrade: options?.largeTrade ?? false,
      },
    };
    if (quote.request.routingType == RoutingType.DUTCH_LIMIT) {
      return new DutchV1Quote(args);
    }
    if (quote.request.routingType == RoutingType.DUTCH_V2) {
      return new DutchV2Quote(args);
    }
    throw new Error(`Unexpected request type ${typeof quote.request}`);
  }
}
