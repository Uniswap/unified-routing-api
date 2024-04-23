import { ChainId } from "@uniswap/sdk-core";
import { ChainConfigManager } from "../../../../lib/config/ChainConfigManager";
import { BPS, NATIVE_ADDRESS, QuoteType, RoutingType } from "../../../../lib/constants";
import { SyntheticStatusProvider } from "../../../../lib/providers";
import { AMOUNT_LARGE, AMOUNT_LARGE_GAS_ADJUSTED } from "../../../constants";
import { makeDutchRequest, createClassicQuote, createDutchQuote, makeDutchV2Request, makeRelayRequest, createDutchV2QuoteWithRequest, createDutchQuoteWithRequest, createRelayQuoteWithRequest } from "../../../utils/fixtures";
import { DutchQuote, DutchQuoteContext, RelayQuoteContext } from "../../../../lib/entities";
import Logger from "bunyan";
import { Erc20__factory } from "../../../../lib/types/ext";
import { BigNumber } from "ethers";
import { DutchV1Quote } from "../../../../lib/entities/quote/DutchV1Quote";


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

    function makeProviders(syntheticEnabled: boolean) {
        return {
            rpcProvider: provider,
            syntheticStatusProvider: SyntheticStatusProviderMock(syntheticEnabled),
        };
    }

    describe('ChainConfigManager interface', () => {
        it('getChainIds returns all chains', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [],
                    alarmEnabled: false
                    },
                    [ChainId.OPTIMISM_GOERLI]: {
                    routingTypes: [],
                    alarmEnabled: false
                    }
                }
            });
            const chainIds = ChainConfigManager.getChainIds();
            expect(chainIds.length == 2).toBeTruthy();
            expect(chainIds.includes(ChainId.MAINNET)).toBeTruthy();
            expect(chainIds.includes(ChainId.OPTIMISM_GOERLI)).toBeTruthy();
        });

        it('getChainIdsByRoutingType returns all chains by routing type', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                          routingType: RoutingType.CLASSIC
                        },
                        {
                          routingType: RoutingType.DUTCH_LIMIT
                        },
                    ],
                    alarmEnabled: false
                    },
                    [ChainId.OPTIMISM_GOERLI]: {
                    routingTypes: [
                        {
                          routingType: RoutingType.DUTCH_LIMIT
                        },
                    ],
                    alarmEnabled: false
                    }
                }
            });
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

        it('getChainIdsByAlarmSetting returns all chains by alarm setting', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [],
                    alarmEnabled: true
                    },
                    [ChainId.OPTIMISM_GOERLI]: {
                    routingTypes: [],
                    alarmEnabled: false
                    }
                }
            });
            let chainIds = ChainConfigManager.getChainIdsByAlarmSetting(true);
            expect(chainIds.length == 1).toBeTruthy();
            expect(chainIds.includes(ChainId.MAINNET)).toBeTruthy();

            chainIds = ChainConfigManager.getChainIdsByAlarmSetting(false);
            expect(chainIds.length == 1).toBeTruthy();
            expect(chainIds.includes(ChainId.OPTIMISM_GOERLI)).toBeTruthy();
        });

        it('chainSupportsRoutingType returns true when chainId support routingType', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                          routingType: RoutingType.CLASSIC
                        },
                        {
                          routingType: RoutingType.DUTCH_LIMIT
                        }
                    ],
                    alarmEnabled: false
                    },
                    [ChainId.OPTIMISM_GOERLI]: {
                    routingTypes: [],
                    alarmEnabled: false
                    }
                }
            });
            expect(ChainConfigManager.chainSupportsRoutingType(ChainId.MAINNET, RoutingType.CLASSIC)).toBeTruthy();
            expect(ChainConfigManager.chainSupportsRoutingType(ChainId.MAINNET, RoutingType.DUTCH_LIMIT)).toBeTruthy();
            expect(ChainConfigManager.chainSupportsRoutingType(ChainId.MAINNET, RoutingType.DUTCH_V2)).toBeFalsy();
            expect(ChainConfigManager.chainSupportsRoutingType(ChainId.OPTIMISM_GOERLI, RoutingType.CLASSIC)).toBeFalsy();
            expect(ChainConfigManager.chainSupportsRoutingType(ChainId.OPTIMISM, RoutingType.CLASSIC)).toBeFalsy();
        });

        it('getQuoteConfig returns the QuoteConfig for the provided chainId and routingType', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
                { value: 
                    {
                        [ChainId.MAINNET]: {
                            routingTypes: [
                                {
                                    routingType: RoutingType.CLASSIC,
                                    stdAuctionPeriodSecs: 99
                                },
                                {
                                    routingType: RoutingType.DUTCH_LIMIT
                                }
                            ],
                            alarmEnabled: false
                        },
                        [ChainId.OPTIMISM_GOERLI]: {
                            routingTypes: [],
                            alarmEnabled: false
                        }
                    }
                });
            let quoteConfig = ChainConfigManager.getQuoteConfig(ChainId.MAINNET, RoutingType.CLASSIC);
            expect(quoteConfig.stdAuctionPeriodSecs).toEqual(99);
            quoteConfig = ChainConfigManager.getQuoteConfig(ChainId.MAINNET, RoutingType.DUTCH_LIMIT);
            expect(quoteConfig.stdAuctionPeriodSecs).toEqual(undefined);
            expect(() => {ChainConfigManager.getQuoteConfig(ChainId.OPTIMISM_GOERLI, RoutingType.DUTCH_LIMIT)}).toThrow(`Routing type ${RoutingType.DUTCH_LIMIT} not supported on chain ${ChainId.OPTIMISM_GOERLI}`);
            expect(() => {ChainConfigManager.getQuoteConfig(ChainId.BLAST, RoutingType.DUTCH_LIMIT)}).toThrow(`Unexpected chainId ${ChainId.BLAST}`);
        });
    });

    describe('ChainConfigManager in URA', () => {
        it('Missing chainId cannot be used', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            let req = makeDutchRequest({ tokenInChainId: ChainId.OPTIMISM, tokenOutChainId: ChainId.OPTIMISM }, { useSyntheticQuotes: true });
            expect(req).toBeUndefined();
            req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
            expect(req).toBeDefined();
        });

        it('Missing routingType cannot be used with chain', () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [],
                    alarmEnabled: false
                    }
                }
            });
            let req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
            expect(req).toBeUndefined();
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
            expect(req).toBeDefined();
        });

        it('skipRFQ prevents RFQ from running', async () => {
            // First show that RFQ is used by default
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            const req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
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
            let quote = await context.resolve({
                [req.key()]: rfqQuote,
                [context.classicKey]: classicQuote,
              });
              if (quote?.routingType != RoutingType.DUTCH_LIMIT) {
                  throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
              }
              expect(quote.quoteType).toEqual(QuoteType.RFQ);

            // Now show that the Synthetic quote is used
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            skipRFQ: true
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            quote = await context.resolve({
              [req.key()]: rfqQuote,
              [context.classicKey]: classicQuote,
            });
            if (quote?.routingType != RoutingType.DUTCH_LIMIT) {
                throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
            }
            expect(quote.quoteType).toEqual(QuoteType.SYNTHETIC);
        });

        it('skipRFQ forces synthetic quote', async () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            skipRFQ: true
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            // Setting useSyntheticQuotes: false should be overridden by skipRFQ
            const req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: false });
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
            let quote = await context.resolve({
                [req.key()]: rfqQuote,
                [context.classicKey]: classicQuote,
              });
              if (quote?.routingType != RoutingType.DUTCH_LIMIT) {
                  throw new Error(`Unexpected routing type in quote ${quote?.routingType}`);
              }
              expect(quote.quoteType).toEqual(QuoteType.SYNTHETIC);
        });

        it('BPS override is used when set', async () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            priceImprovementBps: 1,
                            skipRFQ: true
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            // Force synthetic
            const req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
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
            const firstQuote = await context.resolve({
                [req.key()]: rfqQuote,
                [context.classicKey]: classicQuote,
              });
            if (firstQuote?.routingType != RoutingType.DUTCH_LIMIT) {
                throw new Error(`Unexpected routing type in quote ${firstQuote?.routingType}`);
            }
            expect(firstQuote.quoteType).toEqual(QuoteType.SYNTHETIC);

            // Now get a second quote with custom price improvement
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            priceImprovementBps: 10,
                            skipRFQ: true
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });

            const secQuote = await context.resolve({
                [req.key()]: rfqQuote,
                [context.classicKey]: classicQuote,
              });
            if (secQuote?.routingType != RoutingType.DUTCH_LIMIT) {
                throw new Error(`Unexpected routing type in quote ${secQuote?.routingType}`);
            }
            expect(secQuote.quoteType).toEqual(QuoteType.SYNTHETIC);
            expect(secQuote.amountOutStart.gt(firstQuote.amountOutStart)).toBeTruthy();
        });

        it('Default BPS is used when BPS override is not present', async () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            skipRFQ: true
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });
            // Force synthetic
            const req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
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
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            stdAuctionPeriodSecs: 9999
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });

            const req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
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

        it('DutchLimit lrgAuctionPeriodSecs is used only for large orders', async () => {
            Object.defineProperty(ChainConfigManager, 'chainConfigs', 
            { value: 
                {
                    [ChainId.MAINNET]: {
                    routingTypes: [
                        {
                            routingType: RoutingType.DUTCH_LIMIT,
                            stdAuctionPeriodSecs: 1,
                            lrgAuctionPeriodSecs: 9999
                        }
                    ],
                    alarmEnabled: false
                    }
                }
            });

            const req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true });
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
                Object.defineProperty(ChainConfigManager, 'chainConfigs', 
                { value: 
                    {
                        [ChainId.MAINNET]: {
                        routingTypes: [
                            {
                                routingType: routingType,
                                deadlineBufferSecs: 9999,
                                skipRFQ: true
                            }
                        ],
                        alarmEnabled: false
                        }
                    }
                });

                let req, context, rfqQuote;
                switch (routingType) {
                    case RoutingType.DUTCH_LIMIT: {
                        req = makeDutchRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true, deadlineBufferSecs: undefined });
                        context = new DutchQuoteContext(logger, req, makeProviders(false));
                        rfqQuote = createDutchQuoteWithRequest(
                            { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
                            req
                        );
                        break;
                    }
                    case RoutingType.DUTCH_V2: {
                        req = makeDutchV2Request({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { useSyntheticQuotes: true, deadlineBufferSecs: undefined });
                        context = new DutchQuoteContext(logger, req, makeProviders(false));
                        rfqQuote = createDutchV2QuoteWithRequest(
                            { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
                            req
                        );
                        break;
                    }
                    case RoutingType.RELAY: {
                        req = makeRelayRequest({ tokenInChainId: ChainId.MAINNET, tokenOutChainId: ChainId.MAINNET }, { deadlineBufferSecs: undefined });
                        context = new RelayQuoteContext(logger, req, makeProviders(false));
                        rfqQuote = createRelayQuoteWithRequest(
                            { amountOut: AMOUNT_LARGE, tokenIn: NATIVE_ADDRESS, tokenOut: NATIVE_ADDRESS, chainId: ChainId.MAINNET },
                            req
                        );
                        break;
                    }
                    default:
                        throw new Error("Unknown routing type");
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