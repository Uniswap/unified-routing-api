import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { AllowanceTransfer, PermitSingle } from '@uniswap/permit2-sdk';
import { ChainId, CurrencyAmount, Ether, Fraction, Token, WETH9 } from '@uniswap/sdk-core';
import {
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  NATIVE_CURRENCY,
  parseAmount,
  SWAP_ROUTER_02_ADDRESSES,
  USDC_MAINNET,
  USDT_MAINNET,
} from '@uniswap/smart-order-router';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS as UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN,
} from '@uniswap/universal-router-sdk';
import { fail } from 'assert';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { BigNumber, Wallet } from 'ethers';
import _ from 'lodash';
import { SUPPORTED_CHAINS } from '../../lib/config/chains';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON, V2PoolInRouteJSON } from '../../lib/entities/quote';
import { QuoteRequestBodyJSON } from '../../lib/entities/request';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { FLAT_PORTION, getTestAmount, GREENLIST_STABLE_TO_STABLE_PAIRS, GREENLIST_TOKEN_PAIRS } from '../constants';
import {
  BULLET,
  BULLET_WHT_FOT_TAX,
  DAI_ON,
  getAmount,
  getAmountFromToken,
  UNI_MAINNET,
  USDC_ON,
  WNATIVE_ON,
} from '../utils/tokens';
import {
  BaseIntegrationTestSuite,
  call,
  callAndExpectFail,
  checkPortionRecipientToken,
  checkQuoteToken,
  isTesterPKEnvironmentSet,
} from './base.test';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const UNIVERSAL_ROUTER_ADDRESS = UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN(1);

const SLIPPAGE = '5';
const LARGE_SLIPPAGE = '10';

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
      describe(`${ID_TO_NETWORK_NAME(1)} ${algorithm} ${type} 2xx`, () => {
        describe(`+ Execute Swap`, () => {
          it(`erc20 -> erc20`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'USDT',
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

            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const {
              data: { quote: quoteJSON },
              status,
            } = response;
            const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters } =
              quoteJSON as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
            expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

            if (type == 'EXACT_INPUT') {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
            } else {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
            }

            expect(methodParameters).to.not.be.undefined;
            expect(methodParameters?.to).to.equal(UNIVERSAL_ROUTER_ADDRESS);

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              methodParameters!,
              USDC_MAINNET,
              USDT_MAINNET
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
              checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
            }
          });

          it(`erc20 -> erc20 swaprouter02`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'USDT',
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
                },
              ],
            };

            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const {
              data: { quote: quoteJSON },
              status,
            } = response;
            const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters } =
              quoteJSON as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
            expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

            if (type == 'EXACT_INPUT') {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
            } else {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
            }

            expect(methodParameters).to.not.be.undefined;
            expect(methodParameters?.to).to.equal(SWAP_ROUTER_02_ADDRESSES(ChainId.MAINNET));

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              methodParameters!,
              USDC_MAINNET,
              USDT_MAINNET
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
              checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
            }
          });

          it(`erc20 -> erc20 with permit`, async () => {
            const amount = await getAmount(1, type, 'USDC', 'USDT', '10');

            const nonce = baseTest.nextPermitNonce();

            const permit: PermitSingle = {
              details: {
                token: USDC_MAINNET.address,
                amount: '15000000', // For exact out we don't know the exact amount needed to permit, so just specify a large amount.
                expiration: Math.floor(new Date().getTime() / 1000 + 10000000).toString(),
                nonce,
              },
              spender: UNIVERSAL_ROUTER_ADDRESS,
              sigDeadline: Math.floor(new Date().getTime() / 1000 + 10000000).toString(),
            };

            const { domain, types, values } = AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, 1);

            const signature = await alice._signTypedData(domain, types, values);

            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'USDT',
              tokenOutChainId: 1,
              amount,
              type,
              slippageTolerance: SLIPPAGE,
              configs: [
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['V2', 'V3', 'MIXED'],
                  recipient: alice.address,
                  deadline: 360,
                  algorithm,
                  permitSignature: signature,
                  permitAmount: permit.details.amount.toString(),
                  permitExpiration: permit.details.expiration.toString(),
                  permitSigDeadline: permit.sigDeadline.toString(),
                  permitNonce: permit.details.nonce.toString(),
                  enableUniversalRouter: true,
                },
              ],
            };

            const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
            const {
              data: { quote: quoteJSON },
              status,
            } = response;
            const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters } =
              quoteJSON as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(parseFloat(quoteDecimals)).to.be.greaterThan(9);
            expect(parseFloat(quoteDecimals)).to.be.lessThan(11);

            if (type == 'EXACT_INPUT') {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
            } else {
              expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
            }

            expect(methodParameters).to.not.be.undefined;
            expect(methodParameters?.to).to.equal(UNIVERSAL_ROUTER_ADDRESS);

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              methodParameters!,
              USDC_MAINNET,
              USDT_MAINNET,
              true
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('10');
              checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('10');
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
            }
          });

          it(`erc20 -> eth`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'ETH',
              tokenOutChainId: 1,
              amount: await getAmount(1, type, 'USDC', 'ETH', type == 'EXACT_INPUT' ? '1000000' : '10'),
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

            const response = await call(quoteReq);
            const {
              data: { quote: quoteJSON },
              status,
            } = response;
            const { quote, methodParameters } = quoteJSON as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(methodParameters).to.not.be.undefined;

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              methodParameters!,
              USDC_MAINNET,
              Ether.onChain(1)
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1000000');
              checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(Ether.onChain(1), quote));
            } else {
              // Hard to test ETH balance due to gas costs for approval and swap. Just check tokenIn changes
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
            }
          });

          it(`erc20 -> eth large trade`, async () => {
            // Trade of this size almost always results in splits.
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'ETH',
              tokenOutChainId: 1,
              amount:
                type == 'EXACT_INPUT'
                  ? await getAmount(1, type, 'USDC', 'ETH', '1000000')
                  : await getAmount(1, type, 'USDC', 'ETH', '100'),
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

            const response = await call(quoteReq);
            const { data, status } = response;
            const quoteJSON = data.quote as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(quoteJSON.methodParameters).to.not.be.undefined;

            expect(quoteJSON.route).to.not.be.undefined;

            const amountInEdgesTotal = _(quoteJSON.route)
              .flatMap((route) => route[0]!)
              .filter((pool) => !!pool.amountIn)
              .map((pool) => BigNumber.from(pool.amountIn))
              .reduce((cur, total) => total.add(cur), BigNumber.from(0));
            const amountIn = BigNumber.from(quoteJSON.quote);
            expect(amountIn.eq(amountInEdgesTotal));

            const amountOutEdgesTotal = _(quoteJSON.route)
              .flatMap((route) => route[0]!)
              .filter((pool) => !!pool.amountOut)
              .map((pool) => BigNumber.from(pool.amountOut))
              .reduce((cur, total) => total.add(cur), BigNumber.from(0));
            const amountOut = BigNumber.from(quoteJSON.quote);
            expect(amountOut.eq(amountOutEdgesTotal));

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              quoteJSON.methodParameters!,
              USDC_MAINNET,
              Ether.onChain(1)
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1000000');
              checkQuoteToken(
                tokenOutBefore,
                tokenOutAfter,
                CurrencyAmount.fromRawAmount(Ether.onChain(1), quoteJSON.quote)
              );
            } else {
              // Hard to test ETH balance due to gas costs for approval and swap. Just check tokenIn changes
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quoteJSON.quote));
            }
          });

          it(`erc20 -> eth large trade with permit`, async () => {
            const nonce = baseTest.nextPermitNonce();

            const amount =
              type == 'EXACT_INPUT'
                ? await getAmount(1, type, 'USDC', 'ETH', '1000000')
                : await getAmount(1, type, 'USDC', 'ETH', '100');

            const permit: PermitSingle = {
              details: {
                token: USDC_MAINNET.address,
                amount: '1500000000000', // For exact out we don't know the exact amount needed to permit, so just specify a large amount.
                expiration: Math.floor(new Date().getTime() / 1000 + 10000000).toString(),
                nonce,
              },
              spender: UNIVERSAL_ROUTER_ADDRESS,
              sigDeadline: Math.floor(new Date().getTime() / 1000 + 10000000).toString(),
            };

            const { domain, types, values } = AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, 1);

            const signature = await alice._signTypedData(domain, types, values);

            // Trade of this size almost always results in splits.
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'ETH',
              tokenOutChainId: 1,
              amount,
              type,
              slippageTolerance: SLIPPAGE,
              configs: [
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['V2', 'V3', 'MIXED'],
                  recipient: alice.address,
                  deadline: 360,
                  algorithm,
                  permitSignature: signature,
                  permitAmount: permit.details.amount.toString(),
                  permitExpiration: permit.details.expiration.toString(),
                  permitSigDeadline: permit.sigDeadline.toString(),
                  permitNonce: permit.details.nonce.toString(),
                  enableUniversalRouter: true,
                },
              ],
            };

            const response = await call(quoteReq);
            const { data, status } = response;
            const quoteJSON = data.quote as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(quoteJSON.methodParameters).to.not.be.undefined;
            expect(quoteJSON.route).to.not.be.undefined;

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              quoteJSON.methodParameters!,
              USDC_MAINNET,
              Ether.onChain(1),
              true
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1000000');
              checkQuoteToken(
                tokenOutBefore,
                tokenOutAfter,
                CurrencyAmount.fromRawAmount(Ether.onChain(1), quoteJSON.quote)
              );
            } else {
              // Hard to test ETH balance due to gas costs for approval and swap. Just check tokenIn changes
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quoteJSON.quote));
            }
          });

          it(`eth -> erc20`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'ETH',
              tokenInChainId: 1,
              tokenOut: 'UNI',
              tokenOutChainId: 1,
              amount:
                type == 'EXACT_INPUT'
                  ? await getAmount(1, type, 'ETH', 'UNI', '10')
                  : await getAmount(1, type, 'ETH', 'UNI', '10000'),
              type,
              slippageTolerance: type == 'EXACT_OUTPUT' ? LARGE_SLIPPAGE : SLIPPAGE, // for exact out somehow the liquidity wasn't sufficient, hence higher slippage
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

            const response = await call(quoteReq);
            const { data, status } = response;
            const quoteJSON = data.quote as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(quoteJSON.methodParameters).to.not.be.undefined;

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              quoteJSON.methodParameters!,
              Ether.onChain(1),
              UNI_MAINNET
            );

            if (type == 'EXACT_INPUT') {
              // We've swapped 10 ETH + gas costs
              expect(tokenInBefore.subtract(tokenInAfter).greaterThan(parseAmount('10', Ether.onChain(1)))).to.be.true;
              checkQuoteToken(
                tokenOutBefore,
                tokenOutAfter,
                CurrencyAmount.fromRawAmount(UNI_MAINNET, quoteJSON.quote)
              );
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('10000');
              // Can't easily check slippage for ETH due to gas costs effecting ETH balance.
            }
          });

          // TODO: this test is flaky and blocking the build, re-enable after investigating more.
          xit(`eth -> erc20 swaprouter02`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'ETH',
              tokenInChainId: 1,
              tokenOut: 'UNI',
              tokenOutChainId: 1,
              amount:
                type == 'EXACT_INPUT'
                  ? await getAmount(1, type, 'ETH', 'UNI', '1')
                  : await getAmount(1, type, 'ETH', 'UNI', '100'),
              type,
              slippageTolerance: type == 'EXACT_OUTPUT' ? LARGE_SLIPPAGE : SLIPPAGE, // for exact out somehow the liquidity wasn't sufficient, hence higher slippage
              configs: [
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['V2', 'V3', 'MIXED'],
                  recipient: alice.address,
                  deadline: 360,
                  algorithm,
                  enableUniversalRouter: false,
                },
              ],
            };

            const response = await call(quoteReq);
            const { data, status } = response;
            const quoteJSON = data.quote as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(quoteJSON.methodParameters).to.not.be.undefined;
            expect(quoteJSON.methodParameters?.to).to.equal(SWAP_ROUTER_02_ADDRESSES(ChainId.MAINNET));

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              quoteJSON.methodParameters!,
              Ether.onChain(1),
              UNI_MAINNET
            );

            if (type == 'EXACT_INPUT') {
              // We've swapped 10 ETH + gas costs
              expect(tokenInBefore.subtract(tokenInAfter).greaterThan(parseAmount('1', Ether.onChain(1)))).to.be.true;
              checkQuoteToken(
                tokenOutBefore,
                tokenOutAfter,
                CurrencyAmount.fromRawAmount(UNI_MAINNET, quoteJSON.quote)
              );
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
              // Can't easily check slippage for ETH due to gas costs effecting ETH balance.
            }
          });

          it(`weth -> erc20`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'WETH',
              tokenInChainId: 1,
              tokenOut: 'DAI',
              tokenOutChainId: 1,
              amount: await getAmount(1, type, 'WETH', 'DAI', '100'),
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

            const response = await call(quoteReq);
            const { data, status } = response;
            const quoteJSON = data.quote as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(quoteJSON.methodParameters).to.not.be.undefined;

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              quoteJSON.methodParameters!,
              WETH9[1]!,
              DAI_MAINNET
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
              checkQuoteToken(
                tokenOutBefore,
                tokenOutAfter,
                CurrencyAmount.fromRawAmount(DAI_MAINNET, quoteJSON.quote)
              );
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(WETH9[1]!, quoteJSON.quote));
            }
          });

          it(`erc20 -> weth`, async () => {
            const quoteReq: QuoteRequestBodyJSON = {
              requestId: 'id',
              tokenIn: 'USDC',
              tokenInChainId: 1,
              tokenOut: 'WETH',
              tokenOutChainId: 1,
              amount: await getAmount(1, type, 'USDC', 'WETH', '100'),
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

            const response = await call(quoteReq);
            const { data, status } = response;
            const quoteJSON = data.quote as ClassicQuoteDataJSON;

            expect(status).to.equal(200);
            expect(quoteJSON.methodParameters).to.not.be.undefined;

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
              alice,
              quoteJSON.methodParameters!,
              USDC_MAINNET,
              WETH9[1]!
            );

            if (type == 'EXACT_INPUT') {
              expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
              checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(WETH9[1], quoteJSON.quote));
            } else {
              expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
              checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quoteJSON.quote));
            }
          });

          if (algorithm == 'alpha') {
            it(`erc20 -> erc20 v3 only`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'USDT',
                tokenOutChainId: 1,
                amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
                type,
                slippageTolerance: SLIPPAGE,
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V3'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm: 'alpha',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
              const {
                data: { quote: quoteJSON },
                status,
              } = response;
              const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters, route } =
                quoteJSON as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
              expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

              if (type == 'EXACT_INPUT') {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
              } else {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
              }

              expect(methodParameters).to.not.be.undefined;

              for (const r of route) {
                for (const pool of r) {
                  expect(pool.type).to.equal('v3-pool');
                }
              }

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                methodParameters!,
                USDC_MAINNET,
                USDT_MAINNET!
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
              }
            });

            // TODO: this test is flaky and blocking the build, re-enable after investigating more.
            xit(`erc20 -> erc20 v2 only`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
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
                    algorithm: 'alpha',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
              const {
                data: { quote: quoteJSON },
                status,
              } = response;
              const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters, route } =
                quoteJSON as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
              expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

              if (type == 'EXACT_INPUT') {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
              } else {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
              }

              expect(methodParameters).to.not.be.undefined;

              for (const r of route) {
                for (const pool of r) {
                  expect(pool.type).to.equal('v2-pool');
                }
              }

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                methodParameters!,
                USDC_MAINNET,
                USDT_MAINNET!
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
              }
            });

            it(`erc20 -> erc20 forceCrossProtocol`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'USDT',
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
                    algorithm: 'alpha',
                    forceCrossProtocol: true,
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
              const {
                data: { quote: quoteJSON },
                status,
              } = response;
              const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters, route } =
                quoteJSON as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
              expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

              if (type == 'EXACT_INPUT') {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
              } else {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
              }

              expect(methodParameters).to.not.be.undefined;

              let hasV3Pool = false;
              let hasV2Pool = false;
              for (const r of route) {
                for (const pool of r) {
                  if (pool.type == 'v3-pool') {
                    hasV3Pool = true;
                  }
                  if (pool.type == 'v2-pool') {
                    hasV2Pool = true;
                  }
                }
              }

              expect(hasV3Pool && hasV2Pool).to.be.true;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                methodParameters!,
                USDC_MAINNET,
                USDT_MAINNET!
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
              }
            });

            if (type === 'EXACT_INPUT') {
              // TODO: reenable when mixed routes become stable, currently flaky
              xit(`erc20 -> erc20 forceMixedRoutes returns mixed route`, async () => {
                const quoteReq: QuoteRequestBodyJSON = {
                  requestId: 'id',
                  tokenIn: 'USDC',
                  tokenInChainId: 1,
                  tokenOut: 'DAI',
                  tokenOutChainId: 1,
                  amount: await getAmount(1, type, 'USDC', 'DAI', '1000'),
                  type,
                  slippageTolerance: SLIPPAGE,
                  configs: [
                    {
                      routingType: RoutingType.CLASSIC,
                      protocols: ['V2', 'V3', 'MIXED'],
                      recipient: alice.address,
                      deadline: 360,
                      algorithm: 'alpha',
                      forceMixedRoutes: true,
                      enableUniversalRouter: true,
                    },
                  ],
                };

                const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
                const {
                  data: { quote: quoteJSON },
                  status,
                } = response;
                const { methodParameters, route, routeString } = quoteJSON as ClassicQuoteDataJSON;

                expect(status).to.equal(200);

                expect(methodParameters).to.not.be.undefined;
                expect(routeString.includes('[V2 + V3]'));

                let hasV3Pool = false;
                let hasV2Pool = false;
                for (const r of route) {
                  for (const pool of r) {
                    if (pool.type == 'v3-pool') {
                      hasV3Pool = true;
                    }
                    if (pool.type == 'v2-pool') {
                      hasV2Pool = true;
                    }
                  }
                }

                expect(hasV3Pool && hasV2Pool).to.be.true;
              });
            }
          }
        });

        /* TODO: temporarily disable for an incident hot-fix
        if (algorithm == 'alpha') {
          describe(`+ Simulate Swap + Execute Swap`, () => {
            it(`erc20 -> erc20`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'USDT',
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
                    simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
              const {
                data: { quote: quoteJSON },
                status,
              } = response;
              const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters, simulationError } =
                quoteJSON as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(simulationError).to.equal(false);
              expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
              expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

              if (type == 'EXACT_INPUT') {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
              } else {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
              }

              expect(methodParameters).to.not.be.undefined;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                methodParameters!,
                USDC_MAINNET,
                USDT_MAINNET
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
              }
            });

            it(`erc20 -> erc20 swaprouter02`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'USDT',
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
                    simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                  },
                ],
              };

              const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
              const {
                data: { quote: quoteJSON },
                status,
              } = response;
              const { quote, quoteDecimals, quoteGasAdjustedDecimals, methodParameters, simulationError } =
                quoteJSON as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(simulationError).to.equal(false);
              expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
              expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

              if (type == 'EXACT_INPUT') {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
              } else {
                expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
              }

              expect(methodParameters).to.not.be.undefined;
              expect(methodParameters!.to).to.equal(SWAP_ROUTER_02_ADDRESSES(ChainId.MAINNET));

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                methodParameters!,
                USDC_MAINNET,
                USDT_MAINNET
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
              }
            });

            if (isTesterPKEnvironmentSet()) {
              it(`erc20 -> erc20 with permit with tester pk`, async () => {
                // This test requires a private key with at least 10 USDC
                // at FORK_BLOCK time.
                const amount = await getAmount(1, type, 'USDC', 'USDT', '10');

                const nonce = '0';

                const permit: PermitSingle = {
                  details: {
                    token: USDC_MAINNET.address,
                    amount: amount,
                    expiration: Math.floor(new Date().getTime() / 1000 + 10000000).toString(),
                    nonce,
                  },
                  spender: UNIVERSAL_ROUTER_ADDRESS,
                  sigDeadline: Math.floor(new Date().getTime() / 1000 + 10000000).toString(),
                };

                const wallet = new Wallet(process.env.TESTER_PK!);

                const { domain, types, values } = AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, 1);

                const signature = await wallet._signTypedData(domain, types, values);

                const quoteReq: QuoteRequestBodyJSON = {
                  requestId: 'id',
                  tokenIn: 'USDC',
                  tokenInChainId: 1,
                  tokenOut: 'USDT',
                  tokenOutChainId: 1,
                  amount,
                  type,
                  slippageTolerance: SLIPPAGE,
                  configs: [
                    {
                      routingType: RoutingType.CLASSIC,
                      protocols: ['V2', 'V3', 'MIXED'],
                      recipient: wallet.address,
                      deadline: 360,
                      algorithm,
                      simulateFromAddress: wallet.address,
                      permitSignature: signature,
                      permitAmount: permit.details.amount.toString(),
                      permitExpiration: permit.details.expiration.toString(),
                      permitSigDeadline: permit.sigDeadline.toString(),
                      permitNonce: permit.details.nonce.toString(),
                      enableUniversalRouter: true,
                    },
                  ],
                };

                const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
                const {
                  data: { quote: quoteJSON },
                  status,
                } = response;
                const { quoteDecimals, quoteGasAdjustedDecimals, methodParameters, simulationError } =
                  quoteJSON as ClassicQuoteDataJSON;
                expect(status).to.equal(200);

                expect(simulationError).to.equal(false);

                expect(parseFloat(quoteDecimals)).to.be.greaterThan(9);
                expect(parseFloat(quoteDecimals)).to.be.lessThan(11);

                if (type == 'EXACT_INPUT') {
                  expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
                } else {
                  expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
                }

                expect(methodParameters).to.not.be.undefined;
              });
            }

            it(`erc20 -> eth`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'ETH',
                tokenOutChainId: 1,
                amount: await getAmount(1, type, 'USDC', 'ETH', type == 'EXACT_INPUT' ? '1000000' : '10'),
                type,
                slippageTolerance: SLIPPAGE,
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V2', 'V3', 'MIXED'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm,
                    simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response = await call(quoteReq);
              const {
                data: { quote: quoteJSON },
                status,
              } = response;
              const { quote, methodParameters, simulationError } = quoteJSON as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(simulationError).to.equal(false);
              expect(methodParameters).to.not.be.undefined;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                methodParameters!,
                USDC_MAINNET,
                Ether.onChain(1)
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1000000');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(Ether.onChain(1), quote));
              } else {
                // Hard to test ETH balance due to gas costs for approval and swap. Just check tokenIn changes
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));
              }
            });

            it(`erc20 -> eth large trade`, async () => {
              // Trade of this size almost always results in splits.
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'ETH',
                tokenOutChainId: 1,
                amount:
                  type == 'EXACT_INPUT'
                    ? await getAmount(1, type, 'USDC', 'ETH', '1000000')
                    : await getAmount(1, type, 'USDC', 'ETH', '100'),
                type,
                slippageTolerance: SLIPPAGE,
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V2', 'V3', 'MIXED'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm,
                    simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response = await call(quoteReq);
              const { data, status } = response;
              const quote = data.quote as ClassicQuoteDataJSON;

              expect(status).to.equal(200);
              expect(quote.simulationError).to.equal(false);
              expect(quote.methodParameters).to.not.be.undefined;

              expect(quote.route).to.not.be.undefined;

              const amountInEdgesTotal = _(quote.route)
                .flatMap((route) => route[0]!)
                .filter((pool) => !!pool.amountIn)
                .map((pool) => BigNumber.from(pool.amountIn))
                .reduce((cur, total) => total.add(cur), BigNumber.from(0));
              const amountIn = BigNumber.from(quote.quote);
              expect(amountIn.eq(amountInEdgesTotal));

              const amountOutEdgesTotal = _(quote.route)
                .flatMap((route) => route[0]!)
                .filter((pool) => !!pool.amountOut)
                .map((pool) => BigNumber.from(pool.amountOut))
                .reduce((cur, total) => total.add(cur), BigNumber.from(0));
              const amountOut = BigNumber.from(quote.quote);
              expect(amountOut.eq(amountOutEdgesTotal));

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                quote.methodParameters!,
                USDC_MAINNET,
                Ether.onChain(1)
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1000000');
                checkQuoteToken(
                  tokenOutBefore,
                  tokenOutAfter,
                  CurrencyAmount.fromRawAmount(Ether.onChain(1), quote.quote)
                );
              } else {
                // Hard to test ETH balance due to gas costs for approval and swap. Just check tokenIn changes
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote.quote));
              }
            });

            it(`eth -> erc20`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'ETH',
                tokenInChainId: 1,
                tokenOut: 'UNI',
                tokenOutChainId: 1,
                amount:
                  type == 'EXACT_INPUT'
                    ? await getAmount(1, type, 'ETH', 'UNI', '10')
                    : await getAmount(1, type, 'ETH', 'UNI', '10000'),
                type,
                slippageTolerance: type == 'EXACT_OUTPUT' ? LARGE_SLIPPAGE : SLIPPAGE, // for exact out somehow the liquidity wasn't sufficient, hence higher slippage
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V2', 'V3', 'MIXED'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm,
                    simulateFromAddress: '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response = await call(quoteReq);
              const { data, status } = response;
              const quote = data.quote as ClassicQuoteDataJSON;
              expect(status).to.equal(200);
              expect(quote.simulationError).to.equal(false);
              expect(quote.methodParameters).to.not.be.undefined;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                quote.methodParameters!,
                Ether.onChain(1),
                UNI_MAINNET
              );

              if (type == 'EXACT_INPUT') {
                // We've swapped 10 ETH + gas costs
                expect(tokenInBefore.subtract(tokenInAfter).greaterThan(parseAmount('10', Ether.onChain(1)))).to.be
                  .true;
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(UNI_MAINNET, quote.quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('10000');
                // Can't easily check slippage for ETH due to gas costs effecting ETH balance.
              }
            });

            // TODO: this test is flaky and blocking the build, re-enable after investigating more.
            xit(`eth -> erc20 swaprouter02`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'ETH',
                tokenInChainId: 1,
                tokenOut: 'UNI',
                tokenOutChainId: 1,
                amount:
                  type == 'EXACT_INPUT'
                    ? await getAmount(1, type, 'ETH', 'UNI', '1')
                    : await getAmount(1, type, 'ETH', 'UNI', '100'),
                type,
                slippageTolerance: type == 'EXACT_OUTPUT' ? LARGE_SLIPPAGE : SLIPPAGE, // for exact out somehow the liquidity wasn't sufficient, hence higher slippage
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V2', 'V3', 'MIXED'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm,
                    simulateFromAddress: '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0',
                    enableUniversalRouter: false,
                  },
                ],
              };

              const response = await call(quoteReq);
              const { data, status } = response;
              const quote = data.quote as ClassicQuoteDataJSON;
              expect(status).to.equal(200);
              expect(quote.simulationError).to.equal(false);
              expect(quote.methodParameters).to.not.be.undefined;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                quote.methodParameters!,
                Ether.onChain(1),
                UNI_MAINNET
              );

              if (type == 'EXACT_INPUT') {
                // We've swapped 10 ETH + gas costs
                expect(tokenInBefore.subtract(tokenInAfter).greaterThan(parseAmount('1', Ether.onChain(1)))).to.be.true;
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(UNI_MAINNET, quote.quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                // Can't easily check slippage for ETH due to gas costs effecting ETH balance.
              }
            });

            it(`weth -> erc20`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'WETH',
                tokenInChainId: 1,
                tokenOut: 'DAI',
                tokenOutChainId: 1,
                amount: await getAmount(1, type, 'WETH', 'DAI', '100'),
                type,
                slippageTolerance: SLIPPAGE,
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V2', 'V3', 'MIXED'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm,
                    simulateFromAddress: '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response = await call(quoteReq);
              const { data, status } = response;
              const quote = data.quote as ClassicQuoteDataJSON;
              expect(status).to.equal(200);
              expect(quote.simulationError).to.equal(false);
              expect(quote.methodParameters).to.not.be.undefined;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                quote.methodParameters!,
                WETH9[1]!,
                DAI_MAINNET
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(DAI_MAINNET, quote.quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(WETH9[1]!, quote.quote));
              }
            });

            it(`erc20 -> weth`, async () => {
              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                tokenIn: 'USDC',
                tokenInChainId: 1,
                tokenOut: 'WETH',
                tokenOutChainId: 1,
                amount: await getAmount(1, type, 'USDC', 'WETH', '100'),
                type,
                slippageTolerance: SLIPPAGE,
                configs: [
                  {
                    routingType: RoutingType.CLASSIC,
                    protocols: ['V2', 'V3', 'MIXED'],
                    recipient: alice.address,
                    deadline: 360,
                    algorithm,
                    simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                    enableUniversalRouter: true,
                  },
                ],
              };

              const response = await call(quoteReq);
              const { data, status } = response;
              const quote = data.quote as ClassicQuoteDataJSON;
              expect(status).to.equal(200);
              expect(quote.simulationError).to.equal(false);
              expect(quote.methodParameters).to.not.be.undefined;

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                alice,
                quote.methodParameters!,
                USDC_MAINNET,
                WETH9[1]!
              );

              if (type == 'EXACT_INPUT') {
                expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
                checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(WETH9[1], quote.quote));
              } else {
                expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal('100');
                checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote.quote));
              }
            });

            const sendPortionEnabledValues = [true, undefined];
            GREENLIST_TOKEN_PAIRS.forEach(([tokenIn, tokenOut]) => {
              sendPortionEnabledValues.forEach((sendPortionEnabled) => {
                it(`${tokenIn.symbol} -> ${tokenOut.symbol} sendPortionEnabled = ${sendPortionEnabled}`, async () => {
                  const originalAmount = getTestAmount(type === 'EXACT_INPUT' ? tokenIn : tokenOut);
                  const tokenInSymbol = tokenIn.symbol!;
                  const tokenOutSymbol = tokenOut.symbol!;
                  const tokenInAddress = tokenIn.isNative ? tokenInSymbol : tokenIn.address;
                  const tokenOutAddress = tokenOut.isNative ? tokenOutSymbol : tokenOut.address;
                  const amount = await getAmountFromToken(type, tokenIn.wrapped, tokenOut.wrapped, originalAmount);
                  const getPortionResponse = await baseTest.portionFetcher.getPortion(
                    tokenIn.chainId,
                    tokenInAddress,
                    tokenOut.chainId,
                    tokenOutAddress
                  );

                  expect(getPortionResponse.hasPortion).to.be.true;
                  expect(getPortionResponse.portion).to.not.be.undefined;

                  const quoteReq: QuoteRequestBodyJSON = {
                    requestId: 'id',
                    tokenIn: tokenInSymbol,
                    tokenInChainId: tokenIn.chainId,
                    tokenOut: tokenOutSymbol,
                    tokenOutChainId: tokenOut.chainId,
                    amount: amount,
                    type,
                    slippageTolerance: SLIPPAGE,
                    sendPortionEnabled: sendPortionEnabled,
                    configs: [
                      {
                        routingType: RoutingType.CLASSIC,
                        protocols: ['V2', 'V3', 'MIXED'],
                        recipient: alice.address,
                        deadline: 360,
                        algorithm,
                        simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                        enableUniversalRouter: true,
                      },
                    ],
                  };
                  const response = await call(quoteReq);

                  const { data, status } = response;
                  const quoteJSON = data.quote as ClassicQuoteDataJSON;

                  expect(status).to.equal(200);
                  expect(quoteJSON.simulationError).to.equal(false);
                  expect(quoteJSON.methodParameters).to.not.be.undefined;

                  if (sendPortionEnabled) {
                    expect(quoteJSON.portionRecipient).to.not.be.undefined;
                    expect(quoteJSON.portionBips).to.not.be.undefined;
                    expect(quoteJSON.portionAmount).to.not.be.undefined;
                    expect(quoteJSON.portionAmountDecimals).to.not.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjusted).to.not.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjustedDecimals).to.not.be.undefined;

                    expect(quoteJSON.portionBips).to.equal(getPortionResponse.portion?.bips);
                    expect(quoteJSON.portionRecipient).to.equal(getPortionResponse.portion?.recipient);

                    if (type == 'EXACT_INPUT') {
                      const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.quote).multiply(
                        new Fraction(getPortionResponse.portion?.bips ?? 0, 10000)
                      );
                      expect(quoteJSON.portionAmount).to.equal(expectedPortionAmount.quotient.toString());
                    } else if (type == 'EXACT_OUTPUT') {
                      const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, amount).multiply(
                        new Fraction(getPortionResponse.portion?.bips ?? 0, 10000)
                      );
                      expect(quoteJSON.portionAmount).to.equal(expectedPortionAmount.quotient.toString());
                    }
                  } else {
                    // when the flag is off,
                    // ensure all the portion-related response fields are not returned
                    expect(quoteJSON.portionRecipient).to.be.undefined;
                    expect(quoteJSON.portionBips).to.be.undefined;
                    expect(quoteJSON.portionAmount).to.be.undefined;
                    expect(quoteJSON.portionAmountDecimals).to.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjusted).to.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjustedDecimals).to.be.undefined;
                  }

                  const {
                    tokenInBefore,
                    tokenInAfter,
                    tokenOutBefore,
                    tokenOutAfter,
                    tokenOutPortionRecipientBefore,
                    tokenOutPortionRecipientAfter,
                  } = await baseTest.executeSwap(
                    alice,
                    quoteJSON.methodParameters!,
                    tokenIn,
                    tokenOut!,
                    false,
                    tokenIn.chainId,
                    getPortionResponse.portion
                  );

                  if (type == 'EXACT_INPUT') {
                    // if the token in is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenIn.isNative) {
                      expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal(originalAmount);
                    }

                    // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenOut.isNative) {
                      checkQuoteToken(
                        tokenOutBefore,
                        tokenOutAfter,
                        CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.quote)
                      );
                    }

                    if (sendPortionEnabled) {
                      expect(quoteJSON.portionAmount).not.to.be.undefined;

                      const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.portionAmount!);
                      checkPortionRecipientToken(
                        tokenOutPortionRecipientBefore!,
                        tokenOutPortionRecipientAfter!,
                        expectedPortionAmount
                      );
                    }
                  } else {
                    // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenOut.isNative) {
                      expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal(originalAmount);
                    }

                    // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenIn.isNative) {
                      checkQuoteToken(
                        tokenInBefore,
                        tokenInAfter,
                        CurrencyAmount.fromRawAmount(tokenIn, quoteJSON.quote)
                      );
                    }

                    if (sendPortionEnabled) {
                      expect(quoteJSON.portionAmount).not.to.be.undefined;

                      const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.portionAmount!);
                      checkPortionRecipientToken(
                        tokenOutPortionRecipientBefore!,
                        tokenOutPortionRecipientAfter!,
                        expectedPortionAmount
                      );
                    }
                  }
                });
              });
            });

            GREENLIST_STABLE_TO_STABLE_PAIRS.forEach(([tokenIn, tokenOut]) => {
              sendPortionEnabledValues.forEach((sendPortionEnabled) => {
                it(`stable-to-stable ${tokenIn.symbol} -> ${tokenOut.symbol} sendPortionEnabled = ${sendPortionEnabled}`, async () => {
                  const originalAmount = '10';
                  const tokenInSymbol = tokenIn.symbol!;
                  const tokenOutSymbol = tokenOut.symbol!;
                  const tokenInAddress = tokenIn.isNative ? tokenInSymbol : tokenIn.address;
                  const tokenOutAddress = tokenOut.isNative ? tokenOutSymbol : tokenOut.address;
                  const amount = await getAmountFromToken(type, tokenIn.wrapped, tokenOut.wrapped, originalAmount);
                  const getPortionResponse = await baseTest.portionFetcher.getPortion(
                    tokenIn.chainId,
                    tokenInAddress,
                    tokenOut.chainId,
                    tokenOutAddress
                  );

                  expect(getPortionResponse.hasPortion).to.be.false;
                  expect(getPortionResponse.portion).to.be.undefined;

                  const quoteReq: QuoteRequestBodyJSON = {
                    requestId: 'id',
                    tokenIn: tokenInSymbol,
                    tokenInChainId: tokenIn.chainId,
                    tokenOut: tokenOutSymbol,
                    tokenOutChainId: tokenOut.chainId,
                    amount: amount,
                    type,
                    slippageTolerance: SLIPPAGE,
                    sendPortionEnabled: sendPortionEnabled,
                    configs: [
                      {
                        routingType: RoutingType.CLASSIC,
                        protocols: ['V2', 'V3', 'MIXED'],
                        recipient: alice.address,
                        deadline: 360,
                        simulateFromAddress: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
                        algorithm,
                        enableUniversalRouter: true,
                      },
                    ],
                  };

                  const response = await call(quoteReq);
                  const { data, status } = response;
                  const quoteJSON = data.quote as ClassicQuoteDataJSON;

                  expect(status).to.equal(200);
                  expect(quoteJSON.simulationError).to.equal(false);
                  expect(quoteJSON.methodParameters).to.not.be.undefined;

                  if (sendPortionEnabled) {
                    // portion recipient must be undefined
                    expect(quoteJSON.portionRecipient).to.be.undefined;

                    // all other fields must be defined for clients to know that portion bips is 0%.
                    expect(quoteJSON.portionBips).to.not.be.undefined;
                    expect(quoteJSON.portionAmount).to.not.be.undefined;
                    expect(quoteJSON.portionAmountDecimals).to.not.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjusted).to.not.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjustedDecimals).to.not.be.undefined;

                    expect(quoteJSON.portionBips).to.equal(0);
                    expect(quoteJSON.portionAmount).to.equal('0');
                    expect(quoteJSON.portionAmountDecimals).to.equal('0');
                  } else {
                    // when the flag is off,
                    // ensure all the portion-related response fields are not returned
                    expect(quoteJSON.portionRecipient).to.be.undefined;
                    expect(quoteJSON.portionBips).to.be.undefined;
                    expect(quoteJSON.portionAmount).to.be.undefined;
                    expect(quoteJSON.portionAmountDecimals).to.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjusted).to.be.undefined;
                    expect(quoteJSON.quoteGasAndPortionAdjustedDecimals).to.be.undefined;
                  }

                  const {
                    tokenInBefore,
                    tokenInAfter,
                    tokenOutBefore,
                    tokenOutAfter,
                    tokenOutPortionRecipientBefore,
                    tokenOutPortionRecipientAfter,
                  } = await baseTest.executeSwap(
                    alice,
                    quoteJSON.methodParameters!,
                    tokenIn,
                    tokenOut!,
                    false,
                    tokenIn.chainId,
                    // getPortionResponse.portion is undefined (asserted above), but in the test setup, we only hardcode in FLAT_PORTION
                    // then we can set up the swap on the fork to have portion against FLAT_PORTION.recipient
                    // then below we can still checkPortionRecipientToken, which will be zero balance difference
                    FLAT_PORTION
                  );

                  if (type == 'EXACT_INPUT') {
                    // if the token in is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenIn.isNative) {
                      expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal(originalAmount);
                    }

                    // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenOut.isNative) {
                      checkQuoteToken(
                        tokenOutBefore,
                        tokenOutAfter,
                        CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.quote)
                      );
                    }

                    if (sendPortionEnabled) {
                      expect(quoteJSON.portionAmount).not.to.be.undefined;
                      const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.portionAmount!);
                      checkPortionRecipientToken(
                        tokenOutPortionRecipientBefore!,
                        tokenOutPortionRecipientAfter!,
                        expectedPortionAmount
                      );
                    }
                  } else {
                    // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenOut.isNative) {
                      expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).to.equal(originalAmount);
                    }

                    // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                    if (!tokenIn.isNative) {
                      checkQuoteToken(
                        tokenInBefore,
                        tokenInAfter,
                        CurrencyAmount.fromRawAmount(tokenIn, quoteJSON.quote)
                      );
                    }

                    if (sendPortionEnabled) {
                      expect(quoteJSON.portionAmount).not.to.be.undefined;
                      const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.portionAmount!);
                      checkPortionRecipientToken(
                        tokenOutPortionRecipientBefore!,
                        tokenOutPortionRecipientAfter!,
                        expectedPortionAmount
                      );
                    }
                  }
                });
              });
            });

            // FOT swap only works for exact in
            if (type === 'EXACT_INPUT') {
              const tokenInAndTokenOut = [
                [BULLET, WETH9[ChainId.MAINNET]!],
                [WETH9[ChainId.MAINNET]!, BULLET],
              ];

              tokenInAndTokenOut.forEach(([tokenIn, tokenOut]) => {
                // FOT integ-test at URA level doesn't need to be as complex as
                // - at routing-api level (https://github.com/Uniswap/routing-api/blob/ab901a773db4ca31eef0ad731014fc6873c9c6aa/test/mocha/integ/quote.test.ts#L1064-L1242)
                // - at sor level (https://github.com/Uniswap/smart-order-router/blob/9da29a7f1898e1c09aa1e286a4062919746f04e5/test/integ/routers/alpha-router/alpha-router.integration.test.ts#L2531-L2693)
                // At URA level, the FOT integ-test just need to ensure after the pass-through flag enableFeeOnTransferFeeFetching gets to routing-api and SOR,
                // FOT tax gets populated in the tokenIn/tokenOut/tokenInReserve/tokenOutReserve fields in the route as part of the quote response at URA level.
                it(`fee-on-transfer ${tokenIn.symbol} -> ${tokenOut.symbol}`, async () => {
                  // we want to swap the tokenIn/tokenOut order so that we can test both sellFeeBps and buyFeeBps for exactIn vs exactOut
                  const originalAmount = tokenIn.equals(WETH9[ChainId.MAINNET]!) ? '10' : '2924';
                  const amount = await getAmountFromToken(type, tokenIn, tokenOut, originalAmount);
                  const simulateFromAddress = tokenIn.equals(WETH9[ChainId.MAINNET]!)
                    ? '0x2fEb1512183545f48f6b9C5b4EbfCaF49CfCa6F3'
                    : '0x171d311eAcd2206d21Cb462d661C33F0eddadC03';
                  const quoteReq: QuoteRequestBodyJSON = {
                    requestId: 'id',
                    tokenIn: tokenIn.address,
                    tokenInChainId: tokenIn.chainId,
                    tokenOut: tokenOut.address,
                    tokenOutChainId: tokenOut.chainId,
                    amount: amount,
                    type,
                    // we have to use large slippage for FOT swap, because URA always forks at the latest block,
                    // and the FOT swap can have large slippage, despite SOR already subtracted FOT tax
                    slippageTolerance: LARGE_SLIPPAGE,
                    configs: [
                      {
                        routingType: RoutingType.CLASSIC,
                        recipient: alice.address,
                        deadline: 360,
                        simulateFromAddress: simulateFromAddress,
                        // we already know that SOR only supports FOT in v2 as of now
                        // so we can send v2 only to send some test runtime
                        protocols: ['V2'],
                        algorithm,
                        enableUniversalRouter: true,
                        enableFeeOnTransferFeeFetching: true,
                      },
                    ],
                  };

                  const response = await call(quoteReq);
                  const { data, status } = response;
                  const quoteJSON = data.quote as ClassicQuoteDataJSON;

                  expect(status).to.equal(200);
                  expect(quoteJSON.simulationError).to.equal(false);
                  expect(quoteJSON.simulationStatus).to.equal('SUCCESS');
                  expect(quoteJSON.methodParameters).to.not.be.undefined;

                  for (const r of quoteJSON.route) {
                    for (const pool of r) {
                      expect(pool.type).equal('v2-pool');
                      const v2Pool = pool as V2PoolInRouteJSON;

                      if (v2Pool.tokenIn.address === BULLET_WHT_FOT_TAX.address) {
                        expect(v2Pool.tokenIn.sellFeeBps).to.be.equals(BULLET_WHT_FOT_TAX.sellFeeBps?.toString());
                        expect(v2Pool.tokenIn.buyFeeBps).to.be.equals(BULLET_WHT_FOT_TAX.buyFeeBps?.toString());
                      }
                      if (v2Pool.tokenOut.address === BULLET_WHT_FOT_TAX.address) {
                        expect(v2Pool.tokenOut.sellFeeBps).to.be.equals(BULLET_WHT_FOT_TAX.sellFeeBps?.toString());
                        expect(v2Pool.tokenOut.buyFeeBps).to.be.equals(BULLET_WHT_FOT_TAX.buyFeeBps?.toString());
                      }
                      if (v2Pool.reserve0.token.address === BULLET_WHT_FOT_TAX.address) {
                        expect(v2Pool.reserve0.token.sellFeeBps).to.be.equals(
                          BULLET_WHT_FOT_TAX.sellFeeBps?.toString()
                        );
                        expect(v2Pool.reserve0.token.buyFeeBps).to.be.equals(BULLET_WHT_FOT_TAX.buyFeeBps?.toString());
                      }
                      if (v2Pool.reserve1.token.address === BULLET_WHT_FOT_TAX.address) {
                        expect(v2Pool.reserve1.token.sellFeeBps).to.be.equals(
                          BULLET_WHT_FOT_TAX.sellFeeBps?.toString()
                        );
                        expect(v2Pool.reserve1.token.buyFeeBps).to.be.equals(BULLET_WHT_FOT_TAX.buyFeeBps?.toString());
                      }
                    }
                  }

                  // We don't have a bullet proof way to assert the fot-involved quote is post tax
                  // so the best way is to execute the swap on hardhat mainnet fork,
                  // and make sure the executed quote doesn't differ from callstatic simulated quote by over slippage tolerance
                  const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeSwap(
                    alice,
                    quoteJSON.methodParameters!,
                    tokenIn,
                    tokenOut
                  );

                  expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal(originalAmount);
                  checkQuoteToken(
                    tokenOutBefore,
                    tokenOutAfter,
                    CurrencyAmount.fromRawAmount(tokenOut, quoteJSON.quote)
                  );
                });
              });
            }
          });
        }
        */

        it(`erc20 -> erc20 no recipient/deadline/slippage`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote: quoteJSON },
            status,
          } = response;
          const { quoteDecimals, quoteGasAdjustedDecimals, methodParameters } = quoteJSON as ClassicQuoteDataJSON;

          expect(status).to.equal(200);
          expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
          expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

          if (type == 'EXACT_INPUT') {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
          }

          // Since ur-sdk hardcodes recipient in case of no recipient https://github.com/Uniswap/universal-router-sdk/blob/d496ba03426a6c855885e8eec92370e517c50668/src/entities/protocols/uniswap.ts#L68
          // the calldata will still get generated even if URA doesn't pass in recipient
          expect(methodParameters).not.to.be.undefined;
        });

        it(`one of recipient/deadline/slippage is missing`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                deadline: 360,
                algorithm,
                enableUniversalRouter: true,
              },
            ],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote: quoteJSON },
            status,
          } = response;
          const { quoteDecimals, quoteGasAdjustedDecimals, methodParameters } = quoteJSON as ClassicQuoteDataJSON;

          expect(status).to.equal(200);
          expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
          expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

          if (type == 'EXACT_INPUT') {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
          }

          // Since ur-sdk hardcodes recipient in case of no recipient https://github.com/Uniswap/universal-router-sdk/blob/d496ba03426a6c855885e8eec92370e517c50668/src/entities/protocols/uniswap.ts#L68
          // the calldata will still get generated even if URA doesn't pass in recipient
          expect(methodParameters).not.to.be.undefined;
        });

        it(`erc20 -> erc20 gas price specified`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
                algorithm,
                gasPriceWei: '60000000000',
                enableUniversalRouter: true,
              },
            ],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote: quoteJSON },
            status,
          } = response;
          const { quoteDecimals, quoteGasAdjustedDecimals, methodParameters, gasPriceWei } =
            quoteJSON as ClassicQuoteDataJSON;

          expect(status).to.equal(200);

          if (algorithm == 'alpha') {
            expect(gasPriceWei).to.equal('60000000000');
          }

          expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);
          expect(parseFloat(quoteDecimals)).to.be.lessThan(110);

          if (type == 'EXACT_INPUT') {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
          }

          // Since ur-sdk hardcodes recipient in case of no recipient https://github.com/Uniswap/universal-router-sdk/blob/d496ba03426a6c855885e8eec92370e517c50668/src/entities/protocols/uniswap.ts#L68
          // the calldata will still get generated even if URA doesn't pass in recipient
          expect(methodParameters).not.to.be.undefined;
        });

        it(`erc20 -> erc20 by address`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            tokenInChainId: 1, // DAI
            tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            tokenOutChainId: 1, // USDC
            amount: await getAmount(1, type, 'DAI', 'USDC', '100'),
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

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);

          const {
            data: { quote: quoteJSON },
            status,
          } = response;
          const { quoteDecimals, quoteGasAdjustedDecimals } = quoteJSON as ClassicQuoteDataJSON;

          expect(status).to.equal(200);
          expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);

          if (type == 'EXACT_INPUT') {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
          }

          expect(parseFloat(quoteDecimals)).to.be.lessThan(110);
        });

        it(`erc20 -> erc20 one by address one by symbol`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            tokenInChainId: 1,
            tokenOut: 'USDC',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'DAI', 'USDC', '100'),
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

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote: quoteJSON },
            status,
          } = response;
          const { quoteDecimals, quoteGasAdjustedDecimals } = quoteJSON as ClassicQuoteDataJSON;

          expect(status).to.equal(200);
          expect(parseFloat(quoteDecimals)).to.be.greaterThan(90);

          if (type == 'EXACT_INPUT') {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
          }

          expect(parseFloat(quoteDecimals)).to.be.lessThan(110);
        });
      });

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

          const chains = SUPPORTED_CHAINS[RoutingType.CLASSIC].values();
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
    [ChainId.BASE_GOERLI]: USDC_ON(ChainId.BASE_GOERLI),
    [ChainId.BASE]: USDC_ON(ChainId.BASE),
  };

  const TEST_ERC20_2: { [chainId in ChainId]: Token | null } = {
    [ChainId.MAINNET]: DAI_ON(1),
    [ChainId.OPTIMISM]: DAI_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: DAI_ON(ChainId.OPTIMISM_GOERLI),
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
    [ChainId.BASE_GOERLI]: WNATIVE_ON(ChainId.BASE_GOERLI),
    [ChainId.BASE]: WNATIVE_ON(ChainId.BASE),
  };

  // TODO: Find valid pools/tokens on optimistic kovan and polygon mumbai. We skip those tests for now.
  for (const chain of _.filter(
    SUPPORTED_CHAINS[RoutingType.CLASSIC],
    (c) =>
      c !== ChainId.POLYGON_MUMBAI &&
      c !== ChainId.ARBITRUM_GOERLI &&
      c !== ChainId.CELO_ALFAJORES &&
      c !== ChainId.GOERLI &&
      c !== ChainId.SEPOLIA &&
      c !== ChainId.OPTIMISM_GOERLI &&
      c != ChainId.BASE &&
      c != ChainId.BASE_GOERLI
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
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: wrappedNative.address,
            tokenInChainId: chain,
            tokenOut: erc1.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, wrappedNative, erc1, '1'),
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

            expect(status).to.equal(200);
          } catch (err: any) {
            fail(JSON.stringify(err.response.data));
          }
        });

        it(`erc20 -> erc20`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: erc1.address,
            tokenInChainId: chain,
            tokenOut: erc2.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, erc1, erc2, '1'),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
              },
            ],
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
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: erc1.address,
            tokenInChainId: chain,
            tokenOut: erc2.address,
            tokenOutChainId: chain,
            amount: await getAmountFromToken(type, erc1, erc2, '1'),
            type,
            configs: [
              {
                routingType: RoutingType.CLASSIC,
                protocols: ['V2', 'V3', 'MIXED'],
              },
            ],
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
