import Logger from 'bunyan';

import { RoutingType } from '../../../../../lib/constants';
import {
  ClassicConfig,
  mergeRequests,
  Quote,
  QuoteByKey,
  QuoteContext,
  QuoteContextManager,
  QuoteRequest,
} from '../../../../../lib/entities';
import {
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  DL_QUOTE_EXACT_IN_BETTER,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_DL_EXACT_OUT,
  QUOTE_REQUEST_DL_NATIVE_IN,
  QUOTE_REQUEST_DL_NATIVE_OUT,
  QUOTE_REQUEST_RELAY,
  QUOTE_REQUEST_RELAY_EXACT_OUT,
  RELAY_QUOTE_EXACT_IN_BETTER,
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

    it('returns base request from single relay context', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_RELAY);
      const handler = new QuoteContextManager([context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(1);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_RELAY);
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

    it('returns dependency requests from a single context - relay', () => {
      const context = new MockQuoteContext(QUOTE_REQUEST_RELAY);
      context.setDependencies([QUOTE_REQUEST_CLASSIC]);
      const handler = new QuoteContextManager([context]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(2);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_RELAY);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
    });

    it('returns dependency requests from multiple contexts in the correct order', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([QUOTE_REQUEST_DL_NATIVE_IN]);
      const context3 = new MockQuoteContext(QUOTE_REQUEST_RELAY);
      context3.setDependencies([QUOTE_REQUEST_RELAY_EXACT_OUT]);
      const handler = new QuoteContextManager([context1, context2, context3]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(6);
      // user defined requests go first
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_RELAY);
      expect(requests[3]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
      expect(requests[4]).toMatchObject(QUOTE_REQUEST_DL_NATIVE_IN);
      expect(requests[5]).toMatchObject(QUOTE_REQUEST_RELAY_EXACT_OUT);
    });

    it('deduplicates quote requests on info / type', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context2.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT, QUOTE_REQUEST_DL_EXACT_OUT]);
      const context3 = new MockQuoteContext(QUOTE_REQUEST_RELAY);
      context3.setDependencies([QUOTE_REQUEST_CLASSIC]);
      const handler = new QuoteContextManager([context1, context2, context3]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(4);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_RELAY);
      expect(requests[3]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
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

    it('merges simulateFromAddress on classic requests', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_DL);
      context1.setDependencies([QUOTE_REQUEST_DL_EXACT_OUT, QUOTE_REQUEST_CLASSIC]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      const simulateFromAddress = '0x1111111111111111111111111111111111111111';
      context2.setDependencies([
        Object.assign({}, QUOTE_REQUEST_CLASSIC, {
          config: {
            routingType: RoutingType.CLASSIC,
            protocols: ['v3'],
            simulateFromAddress,
          },
          key: QUOTE_REQUEST_CLASSIC.key,
        }),
      ]);
      const handler = new QuoteContextManager([context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(3);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_DL);
      // injects simulateFromAddress into the classic request
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect((requests[1].config as ClassicConfig).simulateFromAddress).toEqual(simulateFromAddress);
      expect(requests[2]).toMatchObject(QUOTE_REQUEST_DL_EXACT_OUT);
    });

    it('merges gasToken on classic requests', () => {
      const context1 = new MockQuoteContext(QUOTE_REQUEST_CLASSIC);
      context1.setDependencies([]);
      const context2 = new MockQuoteContext(QUOTE_REQUEST_RELAY);
      const gasToken = '0x1111111111111111111111111111111111111111';
      context2.setDependencies([
        Object.assign({}, QUOTE_REQUEST_CLASSIC, {
          config: {
            routingType: RoutingType.CLASSIC,
            protocols: ['v3'],
            gasToken,
          },
          key: QUOTE_REQUEST_CLASSIC.key,
        }),
      ]);
      const handler = new QuoteContextManager([context1, context2]);
      const requests = handler.getRequests();
      expect(requests.length).toEqual(2);
      expect(requests[0]).toMatchObject(QUOTE_REQUEST_CLASSIC);
      // injects simulateFromAddress into the classic request
      expect((requests[0].config as ClassicConfig).gasToken).toEqual(gasToken);
      expect(requests[1]).toMatchObject(QUOTE_REQUEST_RELAY);
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
      const context2 = new MockQuoteContext(QUOTE_REQUEST_RELAY);
      context2.setDependencies([RELAY_QUOTE_EXACT_IN_BETTER.request]);
      const handler = new QuoteContextManager([context, context2]);
      await handler.resolveQuotes([
        DL_QUOTE_EXACT_IN_BETTER,
        CLASSIC_QUOTE_EXACT_IN_BETTER,
        RELAY_QUOTE_EXACT_IN_BETTER,
      ]);
      expect(context._quoteDependencies).toEqual({
        [DL_QUOTE_EXACT_IN_BETTER.request.key()]: DL_QUOTE_EXACT_IN_BETTER,
        [CLASSIC_QUOTE_EXACT_IN_BETTER.request.key()]: CLASSIC_QUOTE_EXACT_IN_BETTER,
        [RELAY_QUOTE_EXACT_IN_BETTER.request.key()]: RELAY_QUOTE_EXACT_IN_BETTER,
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

  describe('mergeRequests', () => {
    it('just returns the base for dutch', () => {
      expect(mergeRequests(QUOTE_REQUEST_DL, QUOTE_REQUEST_DL_NATIVE_OUT)).toMatchObject(QUOTE_REQUEST_DL);
      expect(mergeRequests(QUOTE_REQUEST_DL, QUOTE_REQUEST_CLASSIC)).toMatchObject(QUOTE_REQUEST_DL);
      expect(mergeRequests(QUOTE_REQUEST_DL, QUOTE_REQUEST_DL_EXACT_OUT)).toMatchObject(QUOTE_REQUEST_DL);
      expect(mergeRequests(QUOTE_REQUEST_DL_EXACT_OUT, QUOTE_REQUEST_DL_NATIVE_OUT)).toMatchObject(
        QUOTE_REQUEST_DL_EXACT_OUT
      );
    });

    it('keeps base for classic', () => {
      expect(mergeRequests(QUOTE_REQUEST_CLASSIC, QUOTE_REQUEST_DL)).toMatchObject(QUOTE_REQUEST_CLASSIC);
    });

    it('keeps simulateFromAddress if defined in base', () => {
      const baseSimulateAddress = '0x1111111111111111111111111111111111111111';
      const layerSimulateAddress = '0x2222222222222222222222222222222222222222';
      const base = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          simulateFromAddress: baseSimulateAddress,
        },
      });

      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          simulateFromAddress: layerSimulateAddress,
        },
      });

      const merged = mergeRequests(base, layer);
      expect(merged).toMatchObject(base);
      expect((merged.config as ClassicConfig).simulateFromAddress).toEqual(baseSimulateAddress);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('keeps deadline if defined in base', () => {
      const baseDeadline = 1000;
      const layerDeadline = 2000;
      const base = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          deadline: baseDeadline,
        },
      });

      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          deadline: layerDeadline,
        },
      });

      const merged = mergeRequests(base, layer);
      expect(merged).toMatchObject(base);
      expect((merged.config as ClassicConfig).deadline).toEqual(baseDeadline);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('keeps recipient if defined in base', () => {
      const baseRecipient = '0x1111111111111111111111111111111111111111';
      const layerRecipient = '0x2222222222222222222222222222222222222222';
      const base = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          recipient: baseRecipient,
        },
      });

      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          recipient: layerRecipient,
        },
      });

      const merged = mergeRequests(base, layer);
      expect(merged).toMatchObject(base);
      expect((merged.config as ClassicConfig).recipient).toEqual(baseRecipient);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('keeps gasToken if defined in base', () => {
      const baseGasToken = '0x1111111111111111111111111111111111111111';
      const layerGastoken = '0x2222222222222222222222222222222222222222';
      const base = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          gasToken: baseGasToken,
        },
      });

      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          gasToken: layerGastoken,
        },
      });

      const merged = mergeRequests(base, layer);
      expect(merged).toMatchObject(base);
      expect((merged.config as ClassicConfig).gasToken).toEqual(baseGasToken);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('sets simulateFromAddress if defined in layer', () => {
      const layerSimulateAddress = '0x2222222222222222222222222222222222222222';
      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          simulateFromAddress: layerSimulateAddress,
        },
      });

      const merged = mergeRequests(QUOTE_REQUEST_CLASSIC, layer);
      expect(merged).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect((merged.config as ClassicConfig).simulateFromAddress).toEqual(layerSimulateAddress);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('sets deadline if defined in layer', () => {
      const layerDeadline = 10000;
      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          deadline: layerDeadline,
        },
      });

      const merged = mergeRequests(QUOTE_REQUEST_CLASSIC, layer);
      expect(merged).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect((merged.config as ClassicConfig).deadline).toEqual(layerDeadline);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('sets recipient if defined in layer', () => {
      const layerRecipient = '0x2222222222222222222222222222222222222222';
      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          recipient: layerRecipient,
        },
      });

      const merged = mergeRequests(QUOTE_REQUEST_CLASSIC, layer);
      expect(merged).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect((merged.config as ClassicConfig).recipient).toEqual(layerRecipient);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });

    it('sets gasToken if defined in layer', () => {
      const layerGasToken = '0x2222222222222222222222222222222222222222';
      const layer = Object.assign({}, QUOTE_REQUEST_CLASSIC, {
        config: {
          routingType: RoutingType.CLASSIC,
          protocols: ['v3'],
          gasToken: layerGasToken,
        },
      });

      const merged = mergeRequests(QUOTE_REQUEST_CLASSIC, layer);
      expect(merged).toMatchObject(QUOTE_REQUEST_CLASSIC);
      expect((merged.config as ClassicConfig).gasToken).toEqual(layerGasToken);
      expect(merged.key()).toEqual(QUOTE_REQUEST_CLASSIC.key());
    });
  });
});
