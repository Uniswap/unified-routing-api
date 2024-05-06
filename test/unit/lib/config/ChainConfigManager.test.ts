import { ChainId } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import { ChainConfigManager, ChainConfigMap, DependencyMap } from '../../../../lib/config/ChainConfigManager';
import { BPS, NATIVE_ADDRESS, QuoteType, RoutingType } from '../../../../lib/constants';
import { DutchQuote, DutchQuoteContext, RelayQuoteContext } from '../../../../lib/entities';
import { DutchV1Quote } from '../../../../lib/entities/quote/DutchV1Quote';
import { SyntheticStatusProvider } from '../../../../lib/providers';
import { Erc20__factory } from '../../../../lib/types/ext';
import { AMOUNT_LARGE, AMOUNT_LARGE_GAS_ADJUSTED } from '../../../constants';
import {
  createClassicQuote,
  createDutchQuote,
  createDutchQuoteWithRequest,
  createDutchV2QuoteWithRequest,
  createRelayQuoteWithRequest,
  makeClassicRequest,
  makeDutchRequest,
  makeDutchV2Request,
  makeRelayRequest,
} from '../../../utils/fixtures';

describe('ChainConfigManager', () => {
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);
  let provider: any;

  const SyntheticStatusProviderMock = (syntheticEnabled: boolean): SyntheticStatusProvider => {
    const provider = {
      getStatus: jest.fn(),
    };

    provider.getStatus.mockResolvedValue({ syntheticEnabled });
    return provider as unknown as SyntheticStatusProvider;
  };

  beforeAll(() => {
    jest.resetModules(); // Most important - it clears the cache

    jest.mock('../../../../lib/types/ext/factories/Erc20__factory');
    Erc20__factory.connect = jest.fn().mockImplementation(() => {
      return {
        allowance: () => ({ gte: () => true }),
      };
    });
    provider = jest.fn();
  });

  beforeEach(() => {
    setChainConfigManager();
  });

  // Reset ChainConfigManager lazy loading to test changes for each test case
  // Necessary whenever we're changing _chainConfigs or _routeDependencies
  function setChainConfigManager(chainConfigs?: ChainConfigMap, routeDependencies?: DependencyMap) {
    Object.defineProperty(ChainConfigManager, '_chainsByRoutingType', { value: undefined });
    Object.defineProperty(ChainConfigManager, '_performedDependencyCheck', { value: false });
    if (chainConfigs) {
      Object.defineProperty(ChainConfigManager, '_chainConfigs', { value: chainConfigs });
    }
    if (routeDependencies) {
      Object.defineProperty(ChainConfigManager, '_routeDependencies', { value: routeDependencies });
    }
  }

  function makeProviders(syntheticEnabled: boolean) {
    return {
      rpcProvider: provider,
      syntheticStatusProvider: SyntheticStatusProviderMock(syntheticEnabled),
    };
  }

  describe('ChainConfigManager interface', () => {
    it('getChainIds returns all chains that have some routingTypes', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
          },
          alarmEnabled: false,
        },
        [ChainId.OPTIMISM_GOERLI]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
          },
          alarmEnabled: false,
        },
        [ChainId.ROOTSTOCK]: {
          routingTypes: {},
          alarmEnabled: false,
        },
      });
      const chainIds = ChainConfigManager.getChainIds();
      expect(chainIds.length == 2).toBeTruthy();
      expect(chainIds.includes(ChainId.MAINNET)).toBeTruthy();
      expect(chainIds.includes(ChainId.OPTIMISM_GOERLI)).toBeTruthy();
    });

    it('getChainIdsByRoutingType throws an error if routeDependencies are not present', () => {
      setChainConfigManager(
        {
          [ChainId.MAINNET]: {
            routingTypes: {
              [RoutingType.DUTCH_V2]: {},
            },
            alarmEnabled: false,
          },
        },
        {
          [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
        }
      );
      // chainConfigs doesn't contain Classic but its listed as a dependency
      expect(() => {
        ChainConfigManager.getChainIdsByRoutingType(RoutingType.CLASSIC);
      }).toThrow(
        `ChainId ${ChainId.MAINNET} has routingType ${RoutingType.DUTCH_V2} but missing dependency ${RoutingType.CLASSIC}`
      );
    });

    it('getChainIdsByRoutingType returns all chains by routing type', () => {
      setChainConfigManager(
        {
          [ChainId.MAINNET]: {
            routingTypes: {
              [RoutingType.CLASSIC]: {},
              [RoutingType.DUTCH_LIMIT]: {},
            },
            alarmEnabled: false,
          },
          [ChainId.OPTIMISM_GOERLI]: {
            routingTypes: {
              [RoutingType.DUTCH_LIMIT]: {},
            },
            alarmEnabled: false,
          },
        },
        {
          // no dependencies
        }
      );
      let chainIds = ChainConfigManager.getChainIdsByRoutingType(RoutingType.CLASSIC);
      expect(chainIds.length == 1).toBeTruthy();
      expect(chainIds.includes(ChainId.MAINNET)).toBeTruthy();

      chainIds = ChainConfigManager.getChainIdsByRoutingType(RoutingType.DUTCH_LIMIT);
      expect(chainIds.length == 2).toBeTruthy();
      expect(chainIds.includes(ChainId.MAINNET)).toBeTruthy();
      expect(chainIds.includes(ChainId.OPTIMISM_GOERLI)).toBeTruthy();

      chainIds = ChainConfigManager.getChainIdsByRoutingType(RoutingType.DUTCH_V2);
      expect(chainIds.length == 0).toBeTruthy();
    });

    it('getAlarmedChainIds returns all chains by alarm setting', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {},
          alarmEnabled: true,
        },
        [ChainId.OPTIMISM_GOERLI]: {
          routingTypes: {},
          alarmEnabled: false,
        },
      });
      const chainIds = ChainConfigManager.getAlarmedChainIds();
      expect(chainIds.length == 1).toBeTruthy();
      expect(chainIds.includes(ChainId.MAINNET)).toBeTruthy();
    });

    it('chainSupportsRoutingType returns true when chainId support routingType', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
            [RoutingType.DUTCH_LIMIT]: {},
          },
          alarmEnabled: false,
        },
        [ChainId.OPTIMISM_GOERLI]: {
          routingTypes: {},
          alarmEnabled: false,
        },
      });
      expect(ChainConfigManager.chainSupportsRoutingType(ChainId.MAINNET, RoutingType.CLASSIC)).toBeTruthy();
      expect(ChainConfigManager.chainSupportsRoutingType(ChainId.MAINNET, RoutingType.DUTCH_LIMIT)).toBeTruthy();
      expect(ChainConfigManager.chainSupportsRoutingType(ChainId.MAINNET, RoutingType.DUTCH_V2)).toBeFalsy();
      expect(ChainConfigManager.chainSupportsRoutingType(ChainId.OPTIMISM_GOERLI, RoutingType.CLASSIC)).toBeFalsy();
      expect(ChainConfigManager.chainSupportsRoutingType(ChainId.OPTIMISM, RoutingType.CLASSIC)).toBeFalsy();
    });

    it('getQuoteConfig returns the QuoteConfig for the provided chainId and routingType', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
            [RoutingType.DUTCH_V2]: {
              stdAuctionPeriodSecs: 99,
            },
            [RoutingType.DUTCH_LIMIT]: {},
          },
          alarmEnabled: false,
        },
        [ChainId.OPTIMISM_GOERLI]: {
          routingTypes: {},
          alarmEnabled: false,
        },
      });
      let quoteConfig = ChainConfigManager.getQuoteConfig(ChainId.MAINNET, RoutingType.DUTCH_V2);
      expect(quoteConfig.stdAuctionPeriodSecs).toEqual(99);
      quoteConfig = ChainConfigManager.getQuoteConfig(ChainId.MAINNET, RoutingType.DUTCH_LIMIT);
      expect(quoteConfig.stdAuctionPeriodSecs).toEqual(undefined);
      expect(() => {
        ChainConfigManager.getQuoteConfig(ChainId.OPTIMISM_GOERLI, RoutingType.DUTCH_LIMIT);
      }).toThrow(`Routing type ${RoutingType.DUTCH_LIMIT} not supported on chain ${ChainId.OPTIMISM_GOERLI}`);
      expect(() => {
        ChainConfigManager.getQuoteConfig(ChainId.BLAST, RoutingType.DUTCH_LIMIT);
      }).toThrow(`Unexpected chainId ${ChainId.BLAST}`);
    });
  });

  describe('ChainConfigManager in URA', () => {
    it('Missing chainId cannot be used with Classic', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
          },
          alarmEnabled: false,
        },
      });
      let req = makeClassicRequest({ tokenInChainId: ChainId.OPTIMISM, tokenOutChainId: ChainId.OPTIMISM });
      expect(req).toBeUndefined();
      req = makeClassicRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET });
      expect(req).toBeDefined();
    });

    it('Missing chainId cannot be used with Dutch', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
            [RoutingType.DUTCH_LIMIT]: {},
          },
          alarmEnabled: false,
        },
      });
      let req = makeDutchRequest(
        { tokenInChainId: ChainId.OPTIMISM, tokenOutChainId: ChainId.OPTIMISM },
        { useSyntheticQuotes: true }
      );
      expect(req).toBeUndefined();
      req = makeDutchRequest(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      expect(req).toBeDefined();
    });

    it('Missing chainId cannot be used with Dutchv2', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.CLASSIC]: {},
            [RoutingType.DUTCH_V2]: {},
          },
          alarmEnabled: false,
        },
      });
      let req = makeDutchV2Request(
        { tokenInChainId: ChainId.OPTIMISM, tokenOutChainId: ChainId.OPTIMISM },
        { useSyntheticQuotes: true }
      );
      expect(req).toBeUndefined();
      req = makeDutchV2Request(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      expect(req).toBeDefined();
    });

    it('Missing chainId cannot be used with Relay', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.RELAY]: {},
          },
          alarmEnabled: false,
        },
      });
      let req = makeRelayRequest({ tokenInChainId: ChainId.OPTIMISM, tokenOutChainId: ChainId.OPTIMISM });
      expect(req).toBeUndefined();
      req = makeRelayRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET });
      expect(req).toBeDefined();
    });

    it('Missing routingType cannot be used with chain', () => {
      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {},
          alarmEnabled: false,
        },
      });
      let req = makeDutchRequest(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      expect(req).toBeUndefined();

      setChainConfigManager({
        [ChainId.MAINNET]: {
          routingTypes: {
            [RoutingType.DUTCH_LIMIT]: {},
          },
          alarmEnabled: false,
        },
      });
      req = makeDutchRequest(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      expect(req).toBeDefined();
    });

    it('skipRFQ prevents RFQ from running', async () => {
      const routingTypes = [RoutingType.DUTCH_LIMIT, RoutingType.DUTCH_V2];
      for (const routingType of routingTypes) {
        // First show that RFQ is used by default
        setChainConfigManager(
          {
            [ChainId.MAINNET]: {
              routingTypes: {
                [RoutingType.CLASSIC]: {},
                [routingType]: {},
              },
              alarmEnabled: false,
            },
          },
          {
            [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
            [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
          }
        );

        let req, context, rfqQuote;
        switch (routingType) {
          case RoutingType.DUTCH_LIMIT: {
            req = makeDutchRequest(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: false, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchQuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          case RoutingType.DUTCH_V2: {
            req = makeDutchV2Request(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: false, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchV2QuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          default:
            throw new Error('Unknown routing type');
        }

        const classicQuote = createClassicQuote(
          { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
          { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
        );
        let quote = await context.resolve({
          [req.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
        });
        if (quote?.routingType != routingType) {
          throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
        }
        expect(quote.quoteType).toEqual(QuoteType.RFQ);

        // Now show that the Synthetic quote is used
        setChainConfigManager(
          {
            [ChainId.MAINNET]: {
              routingTypes: {
                [RoutingType.CLASSIC]: {},
                [routingType]: {
                  skipRFQ: true,
                },
              },
              alarmEnabled: false,
            },
          },
          {
            [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
            [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
          }
        );
        quote = await context.resolve({
          [req.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
        });
        if (quote?.routingType != routingType) {
          throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
        }
        expect(quote.quoteType).toEqual(QuoteType.SYNTHETIC);
      }
    });

    it('skipRFQ forces synthetic quote', async () => {
      const routingTypes = [RoutingType.DUTCH_LIMIT, RoutingType.DUTCH_V2];
      for (const routingType of routingTypes) {
        setChainConfigManager(
          {
            [ChainId.MAINNET]: {
              routingTypes: {
                [RoutingType.CLASSIC]: {},
                [routingType]: {
                  skipRFQ: true,
                },
              },
              alarmEnabled: false,
            },
          },
          {
            [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
            [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
          }
        );
        // Setting useSyntheticQuotes: false should be overridden by skipRFQ
        let req, context, rfqQuote;
        switch (routingType) {
          case RoutingType.DUTCH_LIMIT: {
            req = makeDutchRequest(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: true, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchQuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          case RoutingType.DUTCH_V2: {
            req = makeDutchV2Request(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: true, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchV2QuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          default:
            throw new Error('Unknown routing type');
        }

        const classicQuote = createClassicQuote(
          { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
          { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
        );
        const quote = await context.resolve({
          [req.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
        });
        if (quote?.routingType != routingType) {
          throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
        }
        expect(quote.quoteType).toEqual(QuoteType.SYNTHETIC);
      }
    });

    it('BPS override is used when set', async () => {
      const routingTypes = [RoutingType.DUTCH_LIMIT, RoutingType.DUTCH_V2];
      for (const routingType of routingTypes) {
        setChainConfigManager(
          {
            [ChainId.MAINNET]: {
              routingTypes: {
                [RoutingType.CLASSIC]: {},
                [routingType]: {
                  priceImprovementBps: 1,
                  skipRFQ: true,
                },
              },
              alarmEnabled: false,
            },
          },
          {
            [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
            [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
          }
        );

        let req, context, rfqQuote;
        switch (routingType) {
          case RoutingType.DUTCH_LIMIT: {
            req = makeDutchRequest(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: true, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchQuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          case RoutingType.DUTCH_V2: {
            req = makeDutchV2Request(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: true, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchV2QuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          default:
            throw new Error('Unknown routing type');
        }

        const classicQuote = createClassicQuote(
          { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
          { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
        );
        const firstQuote = await context.resolve({
          [req.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
        });
        if (firstQuote?.routingType != routingType) {
          throw new Error(`Unexpected routing type in quote ${firstQuote?.routingType}`);
        }

        expect(firstQuote.quoteType).toEqual(QuoteType.SYNTHETIC);

        // Now get a second quote with custom price improvement
        setChainConfigManager(
          {
            [ChainId.MAINNET]: {
              routingTypes: {
                [RoutingType.CLASSIC]: {},
                [routingType]: {
                  priceImprovementBps: 10,
                  skipRFQ: true,
                },
              },
              alarmEnabled: false,
            },
          },
          {
            [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
            [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
          }
        );

        const secQuote = await context.resolve({
          [req.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
        });
        if (secQuote?.routingType != routingType) {
          throw new Error(`Unexpected routing type in quote ${secQuote?.routingType}`);
        }
        expect(secQuote.quoteType).toEqual(QuoteType.SYNTHETIC);
        expect(secQuote.amountOutStart.gt(firstQuote.amountOutStart)).toBeTruthy();
      }
    });

    it('Default BPS is used when BPS override is not present', async () => {
      setChainConfigManager(
        {
          [ChainId.MAINNET]: {
            routingTypes: {
              [RoutingType.CLASSIC]: {},
              [RoutingType.DUTCH_LIMIT]: {
                skipRFQ: true,
              },
            },
            alarmEnabled: false,
          },
        },
        {
          [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
          [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
        }
      );
      // Force synthetic
      const req = makeDutchRequest(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      const context = new DutchQuoteContext(logger, req, makeProviders(false));
      const rfqQuote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
        'EXACT_INPUT',
        '1'
      );
      const classicQuote = createClassicQuote(
        { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
        { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
      );
      const quote = await context.resolve({
        [req.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      if (quote?.routingType != RoutingType.DUTCH_LIMIT) {
        throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
      }
      expect(quote.quoteType).toEqual(QuoteType.SYNTHETIC);
      const amountOutImprovementExactIn = BigNumber.from(BPS).add(DutchQuote.defaultPriceImprovementBps);
      const expectedOut = BigNumber.from(AMOUNT_LARGE_GAS_ADJUSTED).mul(amountOutImprovementExactIn).div(BPS);
      expect(quote.amountOutStart).toEqual(expectedOut);
    });

    it('stdAuctionPeriodSecs is used when set', async () => {
      setChainConfigManager(
        {
          [ChainId.MAINNET]: {
            routingTypes: {
              [RoutingType.CLASSIC]: {},
              [RoutingType.DUTCH_LIMIT]: {
                stdAuctionPeriodSecs: 9999,
              },
            },
            alarmEnabled: false,
          },
        },
        {
          [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
          [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
        }
      );

      const req = makeDutchRequest(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      const context = new DutchQuoteContext(logger, req, makeProviders(false));
      const rfqQuote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
        'EXACT_INPUT',
        '1'
      );
      const classicQuote = createClassicQuote(
        { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
        { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
      );
      const quote = await context.resolve({
        [req.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      if (quote?.routingType != RoutingType.DUTCH_LIMIT) {
        throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
      }
      expect((quote as DutchV1Quote).auctionPeriodSecs).toEqual(9999);
    });

    it('DutchLimit largeAuctionPeriodSecs is used only for large orders', async () => {
      setChainConfigManager(
        {
          [ChainId.MAINNET]: {
            routingTypes: {
              [RoutingType.CLASSIC]: {},
              [RoutingType.DUTCH_LIMIT]: {
                stdAuctionPeriodSecs: 1,
                largeAuctionPeriodSecs: 9999,
              },
            },
            alarmEnabled: false,
          },
        },
        {
          [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
          [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
        }
      );

      const req = makeDutchRequest(
        { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
        { useSyntheticQuotes: true }
      );
      const context = new DutchQuoteContext(logger, req, makeProviders(false));

      // Make a large order
      const rfqQuote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
        'EXACT_INPUT',
        '1'
      );
      const classicQuote = createClassicQuote(
        { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
        { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
      );
      const quote = await context.resolve({
        [req.key()]: rfqQuote,
        [context.classicKey]: classicQuote,
      });
      if (quote?.routingType != RoutingType.DUTCH_LIMIT) {
        throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
      }
      expect((quote as DutchV1Quote).auctionPeriodSecs).toEqual(9999);

      // Make a smol order (set the USD value to 0 by using gasUseEstimateUSD: '0')
      const smolRfqQuote = createDutchQuote(
        { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
        'EXACT_INPUT',
        '1'
      );
      const smolClassicQuote = createClassicQuote(
        { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED, gasUseEstimateUSD: '0' },
        { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
      );
      const smolQuote = await context.resolve({
        [req.key()]: smolRfqQuote,
        [context.classicKey]: smolClassicQuote,
      });
      if (smolQuote?.routingType != RoutingType.DUTCH_LIMIT) {
        throw new Error(`Unexpected routing type in quote ${smolQuote?.routingType}`);
      }

      expect((smolQuote as DutchV1Quote).auctionPeriodSecs).toEqual(1);
    });

    it('deadlineBufferSecs is used when set', async () => {
      const routingTypes = [RoutingType.DUTCH_LIMIT, RoutingType.DUTCH_V2, RoutingType.RELAY];
      for (const routingType of routingTypes) {
        setChainConfigManager(
          {
            [ChainId.MAINNET]: {
              routingTypes: {
                [RoutingType.CLASSIC]: {},
                [routingType]: {
                  deadlineBufferSecs: 9999,
                  skipRFQ: true,
                },
              },
              alarmEnabled: false,
            },
          },
          {
            [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
            [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
          }
        );

        let req, context, rfqQuote;
        switch (routingType) {
          case RoutingType.DUTCH_LIMIT: {
            req = makeDutchRequest(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: true, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchQuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          case RoutingType.DUTCH_V2: {
            req = makeDutchV2Request(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { useSyntheticQuotes: true, deadlineBufferSecs: undefined }
            );
            context = new DutchQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createDutchV2QuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          case RoutingType.RELAY: {
            req = makeRelayRequest(
              { tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET },
              { deadlineBufferSecs: undefined }
            );
            context = new RelayQuoteContext(logger, req, makeProviders(false));
            rfqQuote = createRelayQuoteWithRequest(
              { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
              req
            );
            break;
          }
          default:
            throw new Error('Unknown routing type');
        }

        const classicQuote = createClassicQuote(
          { quote: AMOUNT_LARGE, quoteGasAdjusted: AMOUNT_LARGE_GAS_ADJUSTED },
          { type: 'EXACT_INPUT', tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }
        );
        const quote = await context.resolve({
          [req.key()]: rfqQuote,
          [context.classicKey]: classicQuote,
        });
        if (quote?.routingType != routingType) {
          throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
        }
        expect(quote.deadlineBufferSecs).toEqual(9999);
      }
    });
  });
});
