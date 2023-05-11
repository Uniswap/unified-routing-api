import Logger from 'bunyan';

import { Quote, QuoteContext, QuoteContextHandler, QuoteRequest } from '../../../../../lib/entities';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  DL_QUOTE_EXACT_IN_BETTER,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_DL_EXACT_OUT,
  QUOTE_REQUEST_DL_ONE_SYMBOL,
} from '../../../../utils/fixtures';

class MockQuoteContext implements QuoteContext {
  private _dependencies: QuoteRequest[];
  private _quote: Quote | null;
  public _quoteDependencies: (Quote | null)[];

  constructor(public request: QuoteRequest) {
    this._dependencies = [];
    this._quote = null;
  }

  dependencies(): QuoteRequest[] {
    return this._dependencies;
  }

  resolve(dependencies: (Quote | null)[]): Quote | null {
    this._quoteDependencies = dependencies;
    return this._quote;
  }

  setDependencies(dependencies: QuoteRequest[]) {
    this._dependencies = dependencies;
  }
}

describe('QuoteContextHandler', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('getRequests', () => {
    it('returns base request from single dutch context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      const handler = new QuoteContextHandler(logger, [context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(1);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
    });

    it('returns base request from single classic context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      const handler = new QuoteContextHandler(logger, [context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(1);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_CLASSIC);
    });

    it('returns dependency requests from a single context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([QUOTE_REQUEST_CLASSIC, QUOTE_REQUEST_DL_EXACT_OUT]);
      const handler = new QuoteContextHandler(logger, [context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });

    it('returns dependency requests from multiple contexts in the correct order', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([QUOTE_REQUEST_DL_ONE_SYMBOL]);
      const handler = new QuoteContextHandler(logger, [context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(4);
      // user defined requests go first
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
      expect(requests[3]).toMatchObject(QUOTE_REQUEST_DL_ONE_SYMBOL);
    });

    it('deduplicates quote requests on info / type', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT, QUOTE_REQUEST_DL_EXACT_OUT]);
      const handler = new QuoteContextHandler(logger, [context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });

    it('deduplicates even with differing configs', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([
        Object.assign({}, QUOTE_REQUEST_DL_EXACT_OUT, {
          configs: [],
        }),
      ]);
      const handler = new QuoteContextHandler(logger, [context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });

    it('deduplicates even with differing requestIds', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([
        Object.assign({}, QUOTE_REQUEST_DL_EXACT_OUT, {
          requestId: 'different',
        }),
      ]);
      const handler = new QuoteContextHandler(logger, [context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });

    it('does not deduplicate with different info', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      const secondExactOut = Object.assign({}, QUOTE_REQUEST_DL_EXACT_OUT, {
        info: {
          ...QUOTE_REQUEST_DL_EXACT_OUT.info,
          tokenIn: 'different',
        },
      });
      context2.setDependencies([secondExactOut]);
      const handler = new QuoteContextHandler(logger, [context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(4);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
      expect(requests[3]).toMatchObject(secondExactOut);
    });

    it('does not overwrite user defined requests', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      const secondExactOut = Object.assign({}, QUOTE_REQUEST_DL, {
        configs: [],
      });
      context2.setDependencies([secondExactOut]);
      const handler = new QuoteContextHandler(logger, [context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });
  });

  describe('resolveQuotes', () => {
    it('passes null if no matching quote', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([QUOTE_REQUEST_CLASSIC]);
      const handler = new QuoteContextHandler(logger, [context]);
      handler.resolveQuotes([]);
      expect(context._quoteDependencies).toEqual([null, null]);
    });

    it('passes matching dependencies', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextHandler(logger, [context]);
      handler.resolveQuotes([DL_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual([DL_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_BETTER]);
    });

    it('passes matching dependencies in the proper order', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([DL_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextHandler(logger, [context]);
      handler.resolveQuotes([CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual([
        DL_QUOTE_EXACT_IN_BETTER,
        DL_QUOTE_EXACT_IN_BETTER,
        CLASSIC_QUOTE_EXACT_IN_BETTER,
      ]);
    });

    it('passes one matching and one not matching', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([DL_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextHandler(logger, [context]);
      handler.resolveQuotes([CLASSIC_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual([DL_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_BETTER, null]);
    });

    it('passes if base not matching', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([DL_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextHandler(logger, [context]);
      handler.resolveQuotes([CLASSIC_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual([null, null, CLASSIC_QUOTE_EXACT_IN_BETTER]);
    });
  });
});
