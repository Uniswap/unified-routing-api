import Logger from 'bunyan';

import { RoutingType } from '../../../../../lib/constants';
import { Quote, QuoteByKey, QuoteContext, QuoteContextManager, QuoteRequest } from '../../../../../lib/entities';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  DL_QUOTE_EXACT_IN_BETTER,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_DL_EXACT_OUT,
  QUOTE_REQUEST_DL_NATIVE_IN,
} from '../../../../utils/fixtures';

class MockQuoteContext implements QuoteContext {
  routingType: RoutingType.CLASSIC;
  private _dependencies: QuoteRequest[];
  private _quote: Quote | null;
  public _quoteDependencies: QuoteByKey;

  constructor(public request: QuoteRequest) {
    this._dependencies = [];
    this._quote = null;
  }

  dependencies(): QuoteRequest[] {
    return this._dependencies;
  }

  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    this._quoteDependencies = dependencies;
    return this._quote;
  }

  setDependencies(dependencies: QuoteRequest[]) {
    this._dependencies = dependencies;
  }
}

describe('QuoteContextManager', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('getRequests', () => {
    it('returns base request from single dutch context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      const handler = new QuoteContextManager([context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(1);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
    });

    it('returns base request from single classic context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      const handler = new QuoteContextManager([context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(1);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_CLASSIC);
    });

    it('returns dependency requests from a single context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([QUOTE_REQUEST_CLASSIC, QUOTE_REQUEST_DL_EXACT_OUT]);
      const handler = new QuoteContextManager([context]);
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
      context2.setDependencies([QUOTE_REQUEST_DL_NATIVE_IN]);
      const handler = new QuoteContextManager([context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(4);
      // user defined requests go first
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
      expect(requests[3]).toMatchObject(QUOTE_REQUEST_DL_NATIVE_IN);
    });

    it('deduplicates quote requests on info / type', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT, QUOTE_REQUEST_DL_EXACT_OUT]);
      const handler = new QuoteContextManager([context1, context2]);
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
          key: QUOTE_REQUEST_DL_EXACT_OUT.key,
        }),
      ]);
      const handler = new QuoteContextManager([context1, context2]);
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
          key: QUOTE_REQUEST_DL_EXACT_OUT.key,
        }),
      ]);
      const handler = new QuoteContextManager([context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });

    it('deduplicates even with differing slippage', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([
        Object.assign({}, QUOTE_REQUEST_DL_EXACT_OUT, {
          slippage: 'different',
          key: QUOTE_REQUEST_DL_EXACT_OUT.key,
        }),
      ]);
      const handler = new QuoteContextManager([context1, context2]);
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
        key: QUOTE_REQUEST_DL_EXACT_OUT.key,
      });
      context2.setDependencies([secondExactOut]);
      const handler = new QuoteContextManager([context1, context2]);
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
        key: QUOTE_REQUEST_DL_EXACT_OUT.key,
      });
      context2.setDependencies([secondExactOut]);
      const handler = new QuoteContextManager([context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });
  });

  describe('resolveQuotes', () => {
    it('passes null if no matching quote', async () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([QUOTE_REQUEST_CLASSIC]);
      const handler = new QuoteContextManager([context]);
      expect(await handler.resolveQuotes([])).toEqual([null]);
      expect(context._quoteDependencies).toEqual({});
    });

    it('passes matching dependencies', async () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextManager([context]);
      await handler.resolveQuotes([DL_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual({
        [DL_QUOTE_EXACT_IN_BETTER.request.key()]: DL_QUOTE_EXACT_IN_BETTER,
        [CLASSIC_QUOTE_EXACT_IN_BETTER.request.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
      });
    });

    it('passes matching dependencies in the proper order', async () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([DL_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextManager([context]);
      await handler.resolveQuotes([CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual({
        [DL_QUOTE_EXACT_IN_BETTER.request.key()]: DL_QUOTE_EXACT_IN_BETTER,
        [DL_QUOTE_EXACT_IN_BETTER.request.key()]: DL_QUOTE_EXACT_IN_BETTER,
        [CLASSIC_QUOTE_EXACT_IN_BETTER.request.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
      });
    });

    it('passes one matching and one not matching', async () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_DL);
      context.setDependencies([DL_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextManager([context]);
      await handler.resolveQuotes([CLASSIC_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_IN_BETTER]);
      expect(context._quoteDependencies).toEqual({
        [DL_QUOTE_EXACT_IN_BETTER.request.key()]: DL_QUOTE_EXACT_IN_BETTER,
        [CLASSIC_QUOTE_EXACT_OUT_WORSE.request.key()]: CLASSIC_QUOTE_EXACT_OUT_WORSE,
      });
    });
  });
});
