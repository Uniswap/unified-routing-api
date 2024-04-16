import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ChainId, Token } from '@uniswap/sdk-core';
import {
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  ID_TO_NETWORK_NAME,
  NATIVE_CURRENCY,
  USDB_BLAST,
} from '@uniswap/smart-order-router';
import { fail } from 'assert';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import _ from 'lodash';
import { ChainConfigManager } from '../../lib/config/chains';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON } from '../../lib/entities/quote';
import { QuoteRequestBodyJSON } from '../../lib/entities/request';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { DAI_ON, getAmount, getAmountFromToken, USDC_ON, WNATIVE_ON } from '../utils/tokens';
import { BaseIntegrationTestSuite, call, callAndExpectFail } from './base.test';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const SLIPPAGE = '5';

describe('quote', function () {
  let baseTest: BaseIntegrationTestSuite;

  let alice: SignerWithAddress;

  this.timeout(40000);

  before(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice] = await baseTest.before();
    // Do any custom setup here for this test suite

    // Help with test flakiness by retrying.
    this.retries(3);
  });

  for (const algorithm of ['alpha']) {
    for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
      describe(`${ID_TO_NETWORK_NAME(1)} ${algorithm} ${type} 4xx`, () => {
        it(`field is missing in body`, async () => {
          const quoteReq: Partial<QuoteRequestBodyJSON> = {
            requestId: 'id',
            tokenOut: 'USDT',
            tokenInChainId: 1,
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: '"tokenIn" is required',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        it.skip(`amount is too big to find route`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'UNI',
            tokenInChainId: 1,
            tokenOut: 'KNC',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'UNI', 'KNC', '9999999999999999999999999999999999999999999999999'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                recipient: '0x88fc765949a27405480F374Aa49E20dcCD3fCfb8',
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: 'No route found',
              errorCode: 'NO_ROUTE',
            },
          });
        });

        it(`amount is too big for uint256`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: await getAmount(
              1,
              type,
              'USDC',
              'USDT',
              '100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
            ),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: 'Invalid amount: larger than UINT256_MAX',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        it(`amount is negative`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: '-10000000000',
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: 'Invalid amount: negative number',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        it(`amount is decimal`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: '1000000000.25',
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: 'Invalid amount',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        // TODO: improve handling here by checking locally or rethrowing errors from routing-api
        it(`symbol doesnt exist`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'NONEXISTANTTOKEN',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: 'Could not find token with symbol NONEXISTANTTOKEN',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        // TODO: improve handling here by checking locally or rethrowing errors from routing-api
        it(`tokens are the same symbol`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDT',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 404,
            data: {
              detail: 'No quotes available',
              errorCode: 'QUOTE_ERROR',
            },
          });
        });

        // TODO: improve handling here by checking locally or rethrowing errors from routing-api
        it(`tokens are the same symbol and address`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDT',
            tokenInChainId: 1,
            tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDT', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 404,
            data: {
              detail: 'No quotes available',
              errorCode: 'QUOTE_ERROR',
            },
          });
        });

        // TODO: improve handling here by checking locally or rethrowing errors from routing-api
        it(`tokens are the same address`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            tokenInChainId: 1,
            tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDT', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };
          await callAndExpectFail(quoteReq, {
            status: 404,
            data: {
              detail: 'No quotes available',
              errorCode: 'QUOTE_ERROR',
            },
          });
        });

        // TODO: improve handling here by checking locally or rethrowing errors from routing-api
        it(`tokens are the same address`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            tokenInChainId: 1,
            tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDT', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };
          await callAndExpectFail(quoteReq, {
            status: 404,
            data: {
              detail: 'No quotes available',
              errorCode: 'QUOTE_ERROR',
            },
          });
        });

        it(`recipient is an invalid address`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDT',
            tokenInChainId: 1,
            tokenOut: 'USDC',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDT', 'USDC', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aZZZZZZZ',
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: `"configs[0]" does not match any of the allowed types`,
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        it(`unsupported chain`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 70,
            tokenOut: 'USDT',
            tokenOutChainId: 70,
            amount: '10000000000',
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2'],
                recipient: alice.address,
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          const chains = ChainConfigManager.getChainIdsByRoutingType(RoutingType.CLASSIC);
          const chainStr = [...chains].toString().split(',').join(', ');

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: `"tokenInChainId" must be one of [${chainStr}]`,
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });
      });
    }
  }

  const TEST_ERC20_1: { [chainId in ChainId]: null | Token } = {
    [ChainId.MAINNET]: USDC_ON(1),
    [ChainId.OPTIMISM]: USDC_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: USDC_ON(ChainId.OPTIMISM_GOERLI),
    [ChainId.OPTIMISM_SEPOLIA]: null,
    [ChainId.ARBITRUM_ONE]: USDC_ON(ChainId.ARBITRUM_ONE),
    [ChainId.POLYGON]: USDC_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: USDC_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.BNB]: USDC_ON(ChainId.BNB),
    [ChainId.AVALANCHE]: USDC_ON(ChainId.AVALANCHE),
    [ChainId.GOERLI]: USDC_ON(ChainId.GOERLI),
    [ChainId.SEPOLIA]: USDC_ON(ChainId.SEPOLIA),
    [ChainId.CELO]: CUSD_CELO,
    [ChainId.CELO_ALFAJORES]: CUSD_CELO_ALFAJORES,
    [ChainId.MOONBEAM]: null,
    [ChainId.GNOSIS]: null,
    [ChainId.ARBITRUM_GOERLI]: null,
    [ChainId.ARBITRUM_SEPOLIA]: null,
    [ChainId.BASE_GOERLI]: USDC_ON(ChainId.BASE_GOERLI),
    [ChainId.BASE]: USDC_ON(ChainId.BASE),
    [ChainId.ZORA]: null,
    [ChainId.ZORA_SEPOLIA]: null,
    [ChainId.ROOTSTOCK]: null,
    [ChainId.BLAST]: USDB_BLAST,
  };

  const TEST_ERC20_2: { [chainId in ChainId]: Token | null } = {
    [ChainId.MAINNET]: DAI_ON(1),
    [ChainId.OPTIMISM]: DAI_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: DAI_ON(ChainId.OPTIMISM_GOERLI),
    [ChainId.OPTIMISM_SEPOLIA]: null,
    [ChainId.ARBITRUM_ONE]: DAI_ON(ChainId.ARBITRUM_ONE),
    [ChainId.POLYGON]: DAI_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: DAI_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.BNB]: DAI_ON(ChainId.BNB),
    [ChainId.AVALANCHE]: DAI_ON(ChainId.AVALANCHE),
    [ChainId.GOERLI]: DAI_ON(ChainId.GOERLI),
    [ChainId.SEPOLIA]: DAI_ON(ChainId.SEPOLIA),
    [ChainId.CELO]: CEUR_CELO,
    [ChainId.CELO_ALFAJORES]: CEUR_CELO_ALFAJORES,
    [ChainId.MOONBEAM]: null,
    [ChainId.GNOSIS]: null,
    [ChainId.ARBITRUM_GOERLI]: null,
    [ChainId.ARBITRUM_SEPOLIA]: null,
    [ChainId.BASE_GOERLI]: WNATIVE_ON(ChainId.BASE_GOERLI),
    [ChainId.BASE]: WNATIVE_ON(ChainId.BASE),
    [ChainId.ZORA]: null,
    [ChainId.ZORA_SEPOLIA]: null,
    [ChainId.ROOTSTOCK]: null,
    [ChainId.BLAST]: WNATIVE_ON(ChainId.BLAST),
  };

  // TODO: Find valid pools/tokens on optimistic kovan and polygon mumbai. We skip those tests for now.
  for (const chain of _.filter(
    ChainConfigManager.getChainIdsByRoutingType(RoutingType.CLASSIC),
    (c) =>
      c !== ChainId.POLYGON_MUMBAI &&
      c !== ChainId.ARBITRUM_GOERLI &&
      c !== ChainId.ARBITRUM_SEPOLIA &&
      c !== ChainId.CELO_ALFAJORES &&
      c !== ChainId.GOERLI &&
      c !== ChainId.SEPOLIA &&
      c !== ChainId.OPTIMISM_GOERLI &&
      c != ChainId.OPTIMISM_SEPOLIA &&
      c !== ChainId.BASE &&
      c !== ChainId.BASE_GOERLI &&
      // We will follow up supporting ZORA and ROOTSTOCK
      c !== ChainId.ZORA &&
      c !== ChainId.ZORA_SEPOLIA &&
      c !== ChainId.ROOTSTOCK
  )) {
    for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
      const erc1 = TEST_ERC20_1[chain];
      const erc2 = TEST_ERC20_2[chain];

      // This is for Gnosis and Moonbeam which we don't have RPC Providers yet
      if (erc1 == null || erc2 == null) continue;

      describe(`${ID_TO_NETWORK_NAME(chain)} ${type} 2xx`, function () {
        // Help with test flakiness by retrying.
        this.retries(3);
        const wrappedNative = WNATIVE_ON(chain);

        it(`${wrappedNative.symbol} -> erc20`, async () => {
          // Current WETH/USDB pool (https://blastscan.io/address/0xf52b4b69123cbcf07798ae8265642793b2e8990c) has low WETH amount
          const amount = type === 'EXACT_OUTPUT' && chain === ChainId.BLAST ? '0.002' : '1';

          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: wrappedNative.address,
            tokenInChainId: chain,
            tokenOut: erc1.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, wrappedNative, erc1, amount),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                enableUniversalRouter: true,
              },
            ],
            // actual classic-only quote doesn't pass in swapper,
            // but we need it to ensure it can hit
            // https://github.com/Uniswap/unified-routing-api/blob/78f72f971601a5c2b53b34d3c50222e06c0b8cf2/lib/entities/context/ClassicQuoteContext.ts#L34
            swapper: alice.address,
          };

          try {
            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const { status } = response;

            expect(status).to.equal(200);
          } catch (err: any) {
            fail(JSON.stringify(err.response.data));
          }
        });

        it(`erc20 -> erc20`, async () => {
          // Current WETH/USDB pool (https://blastscan.io/address/0xf52b4b69123cbcf07798ae8265642793b2e8990c) has low WETH amount
          const amount = type === 'EXACT_OUTPUT' && chain === ChainId.BLAST ? '0.002' : '1';

          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: erc1.address,
            tokenInChainId: chain,
            tokenOut: erc2.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, erc1, erc2, amount),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
              },
            ],
            // actual classic-only quote doesn't pass in swapper,
            // but we need it to ensure it can hit
            // https://github.com/Uniswap/unified-routing-api/blob/78f72f971601a5c2b53b34d3c50222e06c0b8cf2/lib/entities/context/ClassicQuoteContext.ts#L34
            swapper: alice.address,
          };

          try {
            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const { status } = response;

            expect(status).to.equal(200);
          } catch (err: any) {
            fail(JSON.stringify(err.response.data));
          }
        });
        const native = NATIVE_CURRENCY[chain];
        it(`${native} -> erc20`, async () => {
          if (chain === ChainId.BLAST) {
            // Blast doesn't have DAI or USDC yet
            return;
          }

          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: native,
            tokenInChainId: chain,
            tokenOut: erc2.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, WNATIVE_ON(chain), erc2, '1'),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                enableUniversalRouter: true,
              },
            ],
          };

          try {
            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const { status } = response;

            expect(status).to.equal(200, JSON.stringify(response.data));
          } catch (err: any) {
            fail(JSON.stringify(err.response.data));
          }
        });
        it(`has quoteGasAdjusted values`, async () => {
          // Current WETH/USDB pool (https://blastscan.io/address/0xf52b4b69123cbcf07798ae8265642793b2e8990c) has low WETH amount
          const amount = type === 'EXACT_OUTPUT' && chain === ChainId.BLAST ? '0.002' : '1';

          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: erc1.address,
            tokenInChainId: chain,
            tokenOut: erc2.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, erc1, erc2, amount),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
              },
            ],
            // actual classic-only quote doesn't pass in swapper,
            // but we need it to ensure it can hit
            // https://github.com/Uniswap/unified-routing-api/blob/78f72f971601a5c2b53b34d3c50222e06c0b8cf2/lib/entities/context/ClassicQuoteContext.ts#L34
            swapper: alice.address,
          };

          try {
            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const {
              data: { quote: quoteJSON },
              status,
            } = response;
            const { quoteDecimals, quoteGasAdjustedDecimals } = quoteJSON as ClassicQuoteDataJSON;

            expect(status).to.equal(200);

            // check for quotes to be gas adjusted
            if (type == 'EXACT_INPUT') {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
            } else {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
            }
          } catch (err: any) {
            fail(JSON.stringify(err.response.data));
          }
        });
      });
    }
  }
});
