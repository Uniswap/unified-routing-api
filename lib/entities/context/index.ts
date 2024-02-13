import { ethers } from 'ethers';

import { RoutingType } from '../../constants';
import { ClassicConfig, ClassicRequest, DutchRequest, DutchV2Request, Quote, QuoteRequest } from '../../entities';

import { Permit2Fetcher } from '../../fetchers/Permit2Fetcher';
import { SyntheticStatusProvider } from '../../providers';
import { log } from '../../util/log';

import { ClassicQuoteContext, DutchQuoteContext, DutchV2QuoteContext } from '.';

export * from './ClassicQuoteContext';
export * from './DutchQuoteContext';
export * from './DutchV2QuoteContext';

export type RequestByKey = {
  [key: string]: QuoteRequest;
};

export type QuoteByKey = {
  [key: string]: Quote;
};

export interface QuoteContext {
  routingType: RoutingType;
  // base request of the context
  request: QuoteRequest;

  dependencies(): QuoteRequest[];

  // params should be in the same order as dependencies response
  // but resolved with quotes
  // returns null if no usable quote is resolved
  resolve(dependencies: QuoteByKey): Promise<Quote | null>;
}

// handler for quote contexts and their dependencies
export class QuoteContextManager {
  constructor(public contexts: QuoteContext[]) {}

  // deduplicate dependencies
  // note this prioritizes user-defined configs first
  // then synthetic generated configs
  getRequests(): QuoteRequest[] {
    const requestMap: RequestByKey = {};
    // first add base user defined requests
    for (const context of this.contexts) {
      requestMap[context.request.key()] = context.request;
    }

    // add any extra dependency requests
    for (const context of this.contexts) {
      const dependencies = context.dependencies();
      for (const request of dependencies) {
        const requestKey = request.key();
        if (!requestMap[requestKey]) {
          requestMap[requestKey] = request;
        } else {
          requestMap[requestKey] = mergeRequests(requestMap[requestKey], request);
        }
      }
    }

    log.info({ requests: requestMap }, `Context requests`);

    return Object.values(requestMap);
  }

  // resolve quotes from quote contexts using quoted dependencies
  async resolveQuotes(quotes: Quote[]): Promise<(Quote | null)[]> {
    log.info({ quotes }, `Context quotes`);
    const allQuotes: QuoteByKey = {};
    for (const quote of quotes) {
      allQuotes[quote.request.key()] = quote;
    }

    const resolved = await Promise.all(
      this.contexts.map((context) => {
        return context.resolve(allQuotes);
      })
    );

    return resolved;
  }
}

export type QuoteContextProviders = {
  permit2Fetcher: Permit2Fetcher;
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  syntheticStatusProvider: SyntheticStatusProvider;
};

export function parseQuoteContexts(requests: QuoteRequest[], providers: QuoteContextProviders): QuoteContext[] {
  return requests.map((request) => {
    switch (request.routingType) {
      case RoutingType.DUTCH_LIMIT:
        return new DutchQuoteContext(log, request as DutchRequest, providers);
      case RoutingType.DUTCH_V2:
        return new DutchV2QuoteContext(log, request as DutchV2Request, providers);
      case RoutingType.CLASSIC:
        return new ClassicQuoteContext(log, request as ClassicRequest, providers);
      default:
        throw new Error(`Unsupported routing type: ${request.routingType}`);
    }
  });
}

export function mergeRequests(base: QuoteRequest, layer: QuoteRequest): QuoteRequest {
  if (base.routingType === RoutingType.CLASSIC && layer.routingType === RoutingType.CLASSIC) {
    const layerConfig: ClassicConfig = layer.config as ClassicConfig;
    const baseConfig: ClassicConfig = base.config as ClassicConfig;
    const config = Object.assign({}, baseConfig, {
      // if base does not specify simulation params but layer does, then we add them
      simulateFromAddress: baseConfig.simulateFromAddress ?? layerConfig.simulateFromAddress,
      deadline: baseConfig.deadline ?? layerConfig.deadline,
      recipient: baseConfig.recipient ?? layerConfig.recipient,
      // otherwise defer to base
    });
    return ClassicRequest.fromRequest(base.info, config);
  } else {
    // no special merging logic for dutch, just defer to base
    return base;
  }
}
