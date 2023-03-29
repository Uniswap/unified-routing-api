import { DutchLimitOrderInfoJSON } from '@uniswap/gouda-sdk';
import { TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';

import { QuoteRequest } from '..';
import { SUPPORTED_CHAINS } from '../../config/chains';
import { BPS, GAS_PROPORTION_THRESHOLD_BPS } from '../../constants';
import { compareQuotes, QuoterByRoutingType } from '../../handlers/quote';
import { ClassicQuoteInserter, RouteBackToNativeInserter } from '../../providers/transformers';
import { RoutingType } from '../../util/types';
import { ClassicRequest, DutchLimitRequest, RequestsByRoutingType } from '../request';
import { ClassicQuote, ClassicQuoteDataJSON } from './ClassicQuote';
import { DutchLimitQuote } from './DutchLimitQuote';

export * from './ClassicQuote';
export * from './DutchLimitQuote';

export type QuoteJSON = (DutchLimitOrderInfoJSON & { quoteId: string }) | ClassicQuoteDataJSON;

export type QuotesByRoutingType = {
  CLASSIC: {
    original?: ClassicQuote;
    synthetic?: ClassicQuote;
    backToNative?: ClassicQuote;
  };
  DUTCH_LIMIT: {
    original?: DutchLimitQuote;
    synthetic?: DutchLimitQuote;
  };
};

export type LogJSON = {
  quoteId: string;
  requestId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  endAmountIn: string;
  endAmountOut: string;
  amountInGasAdjusted?: string;
  amountOutGasAdjusted?: string;
  tokenInChainId: number;
  tokenOutChainId: number;
  offerer: string;
  routing: string;
  createdAt: string;
  slippage: number;
  filler?: string;
  gasPriceWei?: string;
};

export interface Quote {
  routingType: RoutingType;
  amountOut: BigNumber;
  amountIn: BigNumber;
  toJSON(): QuoteJSON;
  request: QuoteRequest;
  toLog(): LogJSON;
}

export interface QuoteSessionData {
  tradeType: TradeType;
  estimatedGasUsage: BigNumber;
  requestsByRoutingType: RequestsByRoutingType;
  quotesByRoutingType: QuotesByRoutingType;
}

export class QuoteSession implements QuoteSessionData {
  private _estimatedGasUsage: BigNumber;
  public readonly uniswapXRequested: boolean;
  public readonly classicRequested: boolean;
  public readonly tradeType: TradeType;
  public readonly tokenInChainId: number;
  public readonly tokenOutChainId: number;
  public readonly requestsByRoutingType: RequestsByRoutingType;
  public readonly quotesByRoutingType: QuotesByRoutingType;
  public log: Logger;

  constructor(requests: QuoteRequest[], log: Logger) {
    this.requestsByRoutingType = { DUTCH_LIMIT: {}, CLASSIC: {} };
    this.quotesByRoutingType = { DUTCH_LIMIT: {}, CLASSIC: {} };
    requests.forEach((request) => {
      if (request.routingType === RoutingType.CLASSIC) {
        if (this.requestsByRoutingType.CLASSIC.original != null) {
          throw new Error('Multiple classic requests not supported');
        }
        this.requestsByRoutingType.CLASSIC.original = request as ClassicRequest;
      } else if (request.routingType === RoutingType.DUTCH_LIMIT) {
        if (this.requestsByRoutingType.DUTCH_LIMIT.original != null) {
          throw new Error('Multiple dutch limit requests not supported');
        }
        this.requestsByRoutingType.DUTCH_LIMIT.original = request as DutchLimitRequest;
      }
    });

    this.log = log;
    this.uniswapXRequested = this.requestsByRoutingType.DUTCH_LIMIT.original != null;
    this.classicRequested = this.requestsByRoutingType.CLASSIC.original != null;
    if (!this.uniswapXRequested && !this.classicRequested) {
      throw new Error('No requests provided');
    }
    this.tradeType = (this.requestsByRoutingType.CLASSIC.original?.info.type ??
      this.requestsByRoutingType.DUTCH_LIMIT.original?.info.type) as TradeType;

    this.tokenInChainId = (this.requestsByRoutingType.CLASSIC.original?.info.tokenInChainId ??
      this.requestsByRoutingType.DUTCH_LIMIT.original?.info.tokenInChainId) as number;

    this.tokenOutChainId = this.tokenInChainId;
  }

  public preprocess() {
    if (this.uniswapXRequested) {
      const backToNativeTransformer = new RouteBackToNativeInserter(this.log);
      backToNativeTransformer.transform(this.requestsByRoutingType);

      if (!this.classicRequested) {
        const classicInserter = new ClassicQuoteInserter(this.log);
        classicInserter.transform(this.requestsByRoutingType);
      }
    }
  }

  public async getQuotes(quoterByRoutingType: QuoterByRoutingType) {
    const classicRequests = [
      this.requestsByRoutingType.CLASSIC.original,
      this.requestsByRoutingType.CLASSIC.synthetic,
      this.requestsByRoutingType.CLASSIC.backToNative,
    ];
    const dutchLimitRequests = [
      this.requestsByRoutingType.DUTCH_LIMIT.original,
      this.requestsByRoutingType.DUTCH_LIMIT.synthetic,
    ];
    const quotes = await Promise.all(
      [...classicRequests, ...dutchLimitRequests].flatMap((request) => {
        if (!request) {
          return undefined;
        }
        const quoter = quoterByRoutingType[request.routingType as RoutingType];
        if (!quoter) {
          return undefined;
        }
        return quoter.quote(request);
      })
    );

    // Promise.all preserves ordering so should be
    // [classic original, classic synthetic, classic backToNative, dutch limit original, dutch limit synthetic]
    this.quotesByRoutingType.CLASSIC.original = quotes[0] as ClassicQuote;
    this.quotesByRoutingType.CLASSIC.synthetic = quotes[1] as ClassicQuote;
    this.quotesByRoutingType.CLASSIC.backToNative = quotes[2] as ClassicQuote;
    this.quotesByRoutingType.DUTCH_LIMIT.original = quotes[3] as DutchLimitQuote;
    this.quotesByRoutingType.DUTCH_LIMIT.synthetic = quotes[4] as DutchLimitQuote;
  }

  public postprocess() {
    if (this.quotesByRoutingType.CLASSIC.original || this.quotesByRoutingType.CLASSIC.synthetic) {
      const classicQuote =
        this.quotesByRoutingType.CLASSIC.original ?? (this.quotesByRoutingType.CLASSIC.synthetic as ClassicQuote);

      // sets auto router quote as the end amount
      if (this.uniswapXRequested) {
        Object.keys(this.quotesByRoutingType.DUTCH_LIMIT).forEach((key) => {
          const quote = this.quotesByRoutingType.DUTCH_LIMIT[key as keyof typeof this.quotesByRoutingType.DUTCH_LIMIT];
          if (quote) {
            quote.endAmountIn =
              this.tradeType === TradeType.EXACT_INPUT ? quote.amountIn : classicQuote.amountInGasAdjusted;

            quote.endAmountOut =
              this.tradeType === TradeType.EXACT_INPUT ? classicQuote.amountOutGasAdjusted : quote.amountOut;
          }
        });
      }

      // quote - quoteGasAdjusted = gas adjustement in output token if exactInput (gasAdjustment is less output)
      // quoteGasAdjusted - quote = gas adjustement in input token if exactOutput (gasAdjustment is more input)
      this._estimatedGasUsage =
        this.tradeType === TradeType.EXACT_INPUT
          ? classicQuote.amountOut.sub(classicQuote.amountOutGasAdjusted)
          : classicQuote.amountInGasAdjusted.sub(classicQuote.amountIn);
    } else {
      this.log.info('No classic quote found');
      this._estimatedGasUsage = BigNumber.from(0);
    }
  }

  public async getAndValidateQuotes(quoterByRoutingType: QuoterByRoutingType): Promise<Quote[]> {
    this.preprocess();
    await this.getQuotes(quoterByRoutingType);
    this.postprocess();

    const validQuotes: Quote[] = [];

    this.addDutchLimitQuotes(validQuotes);

    if (this.classicRequested && this.quotesByRoutingType.CLASSIC.original) {
      validQuotes.push(this.quotesByRoutingType.CLASSIC.original);
    }
    if (this.classicRequested && this.quotesByRoutingType.CLASSIC.synthetic) {
      validQuotes.push(this.quotesByRoutingType.CLASSIC.synthetic);
    }
    this.log.info({ validQuotes: validQuotes }, 'validQuotes');
    return validQuotes;
  }

  public async getBestQuote(quoterByRoutingType: QuoterByRoutingType): Promise<Quote | null> {
    const validQuotes = await this.getAndValidateQuotes(quoterByRoutingType);
    return validQuotes.reduce((bestQuote: Quote | null, quote: Quote) => {
      // log all valid quotes, so that we capture auto router prices at request time
      // skip logging in only classic requested
      if (this.uniswapXRequested) {
        this.log.info({
          eventType: 'UnifiedRoutingQuoteResponse',
          body: {
            ...quote.toLog(),
          },
        });
      }
      if (!bestQuote || compareQuotes(quote, bestQuote, quote.request.info.type)) {
        return quote;
      }
      return bestQuote;
    }, null);
  }

  public hasRouteBackToNative() {
    const backToNativeQuote = this.quotesByRoutingType.CLASSIC.backToNative;
    if (!backToNativeQuote || backToNativeQuote.amountIn.eq(backToNativeQuote.amountInGasAdjusted)) {
      this.log.info('no route back to native');
      return false;
    }
    return true;
  }

  public gasUsageTooHigh() {
    const uniXQuote = this.quotesByRoutingType.DUTCH_LIMIT.original ?? this.quotesByRoutingType.DUTCH_LIMIT.synthetic;
    if (!uniXQuote) {
      return true;
    }
    if (this.estimatedGasUsage.eq(0)) {
      this.log.info('no gas estimate for quote; not filtering');
      return false;
    }
    const quoted = this.tradeType === TradeType.EXACT_INPUT ? uniXQuote.amountOut : uniXQuote.amountIn;
    const quoteGasThreshold = quoted.mul(GAS_PROPORTION_THRESHOLD_BPS).div(BPS);
    if (this.estimatedGasUsage.gte(quoteGasThreshold)) {
      this.log.info({ uniXQuote: quoted, estimatedGasUsage: this.estimatedGasUsage }, 'gas usage too high');
      return true;
    }
    return false;
  }

  private addDutchLimitQuotes(validQuotes: Quote[]): void {
    if (this.uniswapXRequested && !this.gasUsageTooHigh() && this.hasRouteBackToNative()) {
      if (this.quotesByRoutingType.DUTCH_LIMIT.original) {
        validQuotes.push(this.quotesByRoutingType.DUTCH_LIMIT.original);
      }
      // adds synthetic DL quote
      if (
        !this.quotesByRoutingType.DUTCH_LIMIT.original &&
        SUPPORTED_CHAINS[RoutingType.DUTCH_LIMIT].includes(this.tokenInChainId) &&
        SUPPORTED_CHAINS[RoutingType.DUTCH_LIMIT].includes(this.tokenOutChainId) &&
        (this.quotesByRoutingType.CLASSIC.original || this.quotesByRoutingType.CLASSIC.synthetic)
      ) {
        this.quotesByRoutingType.DUTCH_LIMIT.synthetic = DutchLimitQuote.fromClassicQuote(
          this.requestsByRoutingType.DUTCH_LIMIT.original as DutchLimitRequest,
          (this.quotesByRoutingType.CLASSIC.original ?? this.quotesByRoutingType.CLASSIC.synthetic) as ClassicQuote
        );
        validQuotes.push(this.quotesByRoutingType.DUTCH_LIMIT.synthetic);
      }
    }
  }

  get estimatedGasUsage() {
    return this._estimatedGasUsage;
  }
}
