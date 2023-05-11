import Logger from 'bunyan';

import { RoutingType } from '../../constants';
import { ClassicRequest, DutchLimitRequest, Quote, QuoteRequest } from '../../entities';

import { ClassicQuoteContext } from './ClassicQuoteContext';
import { DutchQuoteContext } from './DutchQuoteContext';

export * from './ClassicQuoteContext';
export * from './DutchQuoteContext';

export interface QuoteContext {
  // base request of the context
  request: QuoteRequest;

  dependencies(): QuoteRequest[];

  // params should be in the same order as dependencies response
  // but resolved with quotes
  // returns null if no usable quote is resolved
  resolve(dependencies: (Quote | null)[]): Quote | null;
}

// handler for quote contexts and their dependencies
export class QuoteContextHandler {
  // dependencies for each quote context
  private dependencies: QuoteRequest[][];

  constructor(public log: Logger, public contexts: QuoteContext[]) {
    this.dependencies = [];
    for (const context of contexts) {
      this.dependencies.push(context.dependencies());
    }
  }

  // deduplicate dependencies
  // note this prioritizes user-defined configs first
  // then synthetic generated configs
  getRequests(): QuoteRequest[] {
    const allRequests = [];
    // first add base user defined requests
    for (const context of this.contexts) {
      allRequests.push(context.request);
    }

    // add any extra dependency requests
    for (const dependency of this.dependencies) {
      for (const request of dependency) {
        allRequests.push(request);
      }
    }

    const requestSet = new Set<string>();
    const result: QuoteRequest[] = [];

    // add and deduplicate requests
    for (const request of allRequests) {
      const key = getRequestKey(request);
      // dont duplicate the same request
      if (requestSet.has(key)) continue;

      requestSet.add(key);
      result.push(request);
    }
    this.log.info({ requests: result }, `Context requests`);

    return result;
  }

  // resolve quotes from quote contexts using quoted dependencies
  resolveQuotes(quotes: Quote[]): Quote[] {
    this.log.info({ quotes }, `Context quotes`);
    const quoteMap: { [key: string]: Quote } = {};
    for (const quote of quotes) {
      quoteMap[getRequestKey(quote.request)] = quote;
    }

    this.log.info({ deps: this.dependencies }, `deps`);
    return this.contexts
      .map((context, i) => {
        const deps = [context.request, ...this.dependencies[i]].map((dep) => {
          const key = getRequestKey(dep);
          return quoteMap[key] ?? null;
        });

        return context.resolve(deps);
      })
      .filter((quote) => quote !== null) as Quote[];
  }
}

// TODO: maybe have key as getter on request
// so diff request types can specify their own key
export function getRequestKey(request: QuoteRequest): string {
  // specify request key as the shared info and routing type
  // so we make have multiple requests with different configs
  return JSON.stringify({
    ...request.info,
    routingType: request.routingType,
    // overwrite request id which is irrelevant to deduplication
    requestId: '',
  });
}

export function parseQuoteContexts(log: Logger, requests: QuoteRequest[]): QuoteContext[] {
  return requests.map((request) => {
    switch (request.routingType) {
      case RoutingType.DUTCH_LIMIT:
        return new DutchQuoteContext(log, request as DutchLimitRequest);
      case RoutingType.CLASSIC:
        return new ClassicQuoteContext(log, request as ClassicRequest);
      default:
        throw new Error(`Unsupported routing type: ${request.routingType}`);
    }
  });
}
