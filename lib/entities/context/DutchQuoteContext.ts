import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { BigNumber, ethers } from 'ethers';
import { QuoteContext } from '.';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  ClassicRequest,
  DutchLimitQuote,
  DutchLimitRequest,
  Quote,
  QuoteRequest,
} from '../../entities';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
// TODO: lower threshold after bug bash
const GAS_PROPORTION_THRESHOLD_BPS = 1000;
const BPS = 10000;

// manages context around a single top level classic quote request
export class DutchQuoteContext implements QuoteContext {
  private log: Logger;

  constructor(_log: Logger, public request: DutchLimitRequest) {
    this.log = _log.child({ transformer: 'DutchQuoteContext' });
  }

  // Dutch quotes have three external dependencies:
  // - Dutch RFQ request
  // - classic request to compare with
  // - classic request to check for route back to ETH
  dependencies(): QuoteRequest[] {
    const classicRequest = new ClassicRequest(this.request.info, {
      protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
    });
    this.log.info({ classicRequest: classicRequest.info }, 'Adding synthetic classic request');

    const native = WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(this.request.info.tokenOutChainId)].address;
    const routeBackToNativeRequest = new ClassicRequest(
      {
        ...this.request.info,
        type: TradeType.EXACT_OUTPUT,
        tokenIn: this.request.info.tokenOut,
        amount: ethers.utils.parseEther('1'),
        tokenOut: native,
      },
      {
        protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
      }
    );

    this.log.info(
      { routeBackToNativeRequest: routeBackToNativeRequest.info },
      'Adding synthetic back to native classic request'
    );

    return [classicRequest, routeBackToNativeRequest];
  }

  // return either the rfq quote or a synthetic quote from the classic dependency
  resolve(dependencies: (Quote | null)[]): Quote | null {
    if (dependencies.length !== 3) {
      throw new Error(`Invalid quote result: ${dependencies}`);
    }

    const [quote, classicQuote, routeBackToNative] = dependencies;
    const syntheticQuote = this.getSyntheticQuote(classicQuote, routeBackToNative);

    // handle cases where we only either have RFQ or synthetic
    if (quote === null && syntheticQuote === null) {
      this.log.warn('No quote or synthetic quote available');
      return null;
    } else if (quote === null) {
      return syntheticQuote;
    } else if (syntheticQuote === null) {
      return quote;
    }

    // return the better of the two
    if (this.request.info.type === TradeType.EXACT_INPUT) {
      return quote;
    } else {
      return quote.amountIn.lte(syntheticQuote.amountIn) ? quote : syntheticQuote;
    }
  }

  // transform a classic quote into a synthetic dutch quote
  // if it makes sense to do so
  getSyntheticQuote(
    classicQuote: Quote | null,
    routeBackToNative: Quote | null
  ): DutchLimitQuote | null {
    // no classic quote to build synthetic from
    if (classicQuote === null) {
      this.log.info('No classic quote, skipping synthetic');
      return null;
    }

    // no route back to eth; classic quote not usable
    if (routeBackToNative === null) {
      this.log.info('No route to native quote, skipping synthetic');
      return null;
    }

    // order too small; classic quote not usable
    if (!this.hasOrderSizeForSynthetic(this.log, classicQuote)) {
      this.log.info('Order size too small, skipping synthetic');
      return null;
    }

    return DutchLimitQuote.fromClassicQuote(this.request, classicQuote as ClassicQuote);
  }

  hasOrderSizeForSynthetic(log: Logger, classicQuote: Quote): boolean {
    const classicQuoteData = classicQuote.toJSON() as ClassicQuoteDataJSON;

    const routingApiQuote = BigNumber.from(classicQuoteData.quote);
    const routingApiQuoteGasAdjusted = BigNumber.from(classicQuoteData.quoteGasAdjusted);
    // quote - quoteGasAdjusted = gas adjustement in output token if exactInput (gasAdjustment is less output)
    // quoteGasAdjusted - quote = gas adjustement in input token if exactOutput (gasAdjustment is more input)
    const gasUsedQuote =
      classicQuote.request.info.type === TradeType.EXACT_INPUT
        ? routingApiQuote.sub(routingApiQuoteGasAdjusted)
        : routingApiQuoteGasAdjusted.sub(routingApiQuote);

    if (gasUsedQuote.eq(0)) {
      log.info('No gas estimate for quote, not filtering', classicQuote);
      return true;
    }

    const quoteGasThreshold = routingApiQuote.mul(GAS_PROPORTION_THRESHOLD_BPS).div(BPS);
    if (gasUsedQuote.gte(quoteGasThreshold)) {
      log.info(
        { routingApiQuote: routingApiQuote.toString(), gasUsedQuote: gasUsedQuote.toString() },
        'Removing UniswapX quote due to gas cost'
      );
      return false;
    }
    return true;
  }
}
