import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CurrencyAmount, Ether, WETH9 } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  parseAmount,
  UNI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '@uniswap/smart-order-router';
import { DutchOrder } from '@uniswap/uniswapx-sdk';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import qs from 'qs';
import { BPS, NATIVE_ADDRESS, RoutingType } from '../../lib/constants';
import { DutchQuoteDataJSON, QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { GREENLIST_STABLE_TO_STABLE_PAIRS, GREENLIST_TOKEN_PAIRS } from '../constants';
import { fund } from '../utils/forkAndFund';
import { RoutingApiQuoteResponse } from '../utils/quoteResponse';
import { agEUR_MAINNET, getAmount, getAmountFromToken, XSGD_MAINNET } from '../utils/tokens';
import {
  axiosHelper,
  BaseIntegrationTestSuite,
  call,
  callAndExpectFail,
  checkPortionRecipientToken,
  checkQuoteToken,
} from './base.test';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const NO_LIQ_TOKEN = '0x69b148395Ce0015C13e36BFfBAd63f49EF874E03';

const ROUTING_API = `${process.env.ROUTING_API!}/quote`;
const SLIPPAGE = '5';

describe('quoteUniswapX', function () {
  let baseTest: BaseIntegrationTestSuite;

  // Help with test flakiness by retrying.
  this.retries(2);
  this.timeout(40000);

  let alice: SignerWithAddress;
  let filler: SignerWithAddress;

  before(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice, filler] = await baseTest.before();

    // Apply needed dutch setup
    filler = await fund(filler, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('10', WBTC_MAINNET),
      parseAmount('5000', UNI_MAINNET),
      parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
      parseAmount('50000', agEUR_MAINNET),
      parseAmount('475000', XSGD_MAINNET),
    ]);
  });

  // size filter may not apply for exact output
  // as input value can be scaled to always account for gas
  describe('EXACT_INPUT size filter', () => {
    const type = 'EXACT_INPUT';

    it(`stable -> stable, tiny trade should be filtered out due to gas`, async () => {
      const quoteReq: QuoteRequestBodyJSON = {
        requestId: 'id',
        useUniswapX: true,
        tokenIn: USDC_MAINNET.address,
        tokenInChainId: 1,
        tokenOut: USDT_MAINNET.address,
        tokenOutChainId: 1,
        amount: await getAmount(1, type, 'USDC', 'USDT', '0.1'),
        type,
        slippageTolerance: SLIPPAGE,
        configs: [
          {
            routingType: RoutingType.DUTCH_LIMIT,
            swapper: alice.address,
            useSyntheticQuotes: true,
          },
        ] as RoutingConfigJSON[],
      };
      await callAndExpectFail(quoteReq, {
        status: 404,
        data: {
          detail: 'No quotes available',
          errorCode: 'QUOTE_ERROR',
        },
      });
    });

    it(`stable -> stable by name, tiny trade should be filtered out due to gas`, async () => {
      const quoteReq: QuoteRequestBodyJSON = {
        requestId: 'id',
        useUniswapX: true,
        tokenIn: 'USDC',
        tokenInChainId: 1,
        tokenOut: 'USDT',
        tokenOutChainId: 1,
        amount: await getAmount(1, type, 'USDC', 'USDT', '0.1'),
        type,
        slippageTolerance: SLIPPAGE,
        configs: [
          {
            routingType: RoutingType.DUTCH_LIMIT,
            swapper: alice.address,
            useSyntheticQuotes: true,
          },
        ] as RoutingConfigJSON[],
      };

      await callAndExpectFail(quoteReq, {
        status: 404,
        data: {
          detail: 'No quotes available',
          errorCode: 'QUOTE_ERROR',
        },
      });
    });
  });

  for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, () => {
      describe(`+ Execute Swap`, () => {
        it(`stable -> stable, large trade should return valid quote`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            useUniswapX: true,
            tokenIn: USDC_MAINNET.address,
            tokenInChainId: 1,
            tokenOut: USDT_MAINNET.address,
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '10000'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
              },
            ] as RoutingConfigJSON[],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const order = new DutchOrder((quote as any).orderInfo, 1);
          expect(status).to.equal(200);

          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.outputs.length).to.equal(1);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.lessThan(11000000000);
          expect(parseInt(order.info.input.startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.input.startAmount.toString())).to.be.lessThan(11000000000);

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeDutchSwap(
            alice,
            filler,
            order,
            USDC_MAINNET,
            USDT_MAINNET
          );

          if (type === 'EXACT_INPUT') {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('10000');
            checkQuoteToken(
              tokenOutBefore,
              tokenOutAfter,
              CurrencyAmount.fromRawAmount(USDT_MAINNET, order.info.outputs[0].startAmount.toString())
            );
          } else {
            expect(
              tokenOutAfter.subtract(tokenOutBefore).greaterThan(10_000) ||
                tokenOutAfter.subtract(tokenOutBefore).equalTo(10_000)
            ).to.be.true;
            checkQuoteToken(
              tokenInBefore,
              tokenInAfter,
              CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.input.endAmount.toString())
            );
          }
        });

        it(`stable -> stable by name, large trade should return value quote`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            useUniswapX: true,
            tokenIn: 'USDC',
            tokenInChainId: 1,
            tokenOut: 'USDT',
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '10000'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
              },
            ] as RoutingConfigJSON[],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);

          const {
            data: { quote },
            status,
          } = response;

          const order = new DutchOrder((quote as any).orderInfo, 1);
          expect(status).to.equal(200);

          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.outputs.length).to.equal(1);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.lessThan(11000000000);
          expect(parseInt(order.info.input.startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.input.startAmount.toString())).to.be.lessThan(11000000000);

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeDutchSwap(
            alice,
            filler,
            order,
            USDC_MAINNET,
            USDT_MAINNET
          );

          if (type === 'EXACT_INPUT') {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('10000');
            checkQuoteToken(
              tokenOutBefore,
              tokenOutAfter,
              CurrencyAmount.fromRawAmount(USDT_MAINNET, order.info.outputs[0].startAmount.toString())
            );
          } else {
            expect(
              tokenOutAfter.subtract(tokenOutBefore).greaterThan(10_000) ||
                tokenOutAfter.subtract(tokenOutBefore).equalTo(10_000)
            ).to.be.true;
            checkQuoteToken(
              tokenInBefore,
              tokenInAfter,
              CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.input.endAmount.toString())
            );
          }
        });

        it(`stable -> large cap, large trade should return valid quote`, async () => {
          const amount = await getAmount(1, type, 'USDC', 'UNI', '1000');
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            useUniswapX: true,
            tokenIn: USDC_MAINNET.address,
            tokenInChainId: 1,
            tokenOut: UNI_MAINNET.address,
            tokenOutChainId: 1,
            amount: amount,
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
              },
            ] as RoutingConfigJSON[],
          };

          const response = await call(quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const routingResponse = await axiosHelper.get<RoutingApiQuoteResponse>(
            `${ROUTING_API}?${qs.stringify({
              tokenInAddress: USDC_MAINNET.address,
              tokenOutAddress: UNI_MAINNET.address,
              tokenInChainId: 1,
              tokenOutChainId: 1,
              amount: amount,
              type: type === 'EXACT_INPUT' ? 'exactIn' : 'exactOut',
              recipient: alice.address,
              slippageTolerance: SLIPPAGE,
              deadline: '360',
              algorithm: 'alpha',
              enableUniversalRouter: true,
            })}`
          );
          expect(routingResponse.status).to.equal(200);

          const order = new DutchOrder((quote as any).orderInfo, 1);
          expect(status).to.equal(200);
          const routingQuote = routingResponse.data.quoteGasAdjusted;
          // account for gas and slippage
          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.outputs.length).to.equal(1);
          if (type === 'EXACT_INPUT') {
            const adjustedAmountOutClassic = BigNumber.from(routingQuote).mul(90).div(100);

            expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.gte(
              parseInt(adjustedAmountOutClassic.toString())
            );
            expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.lt(
              parseInt(BigNumber.from(adjustedAmountOutClassic).mul(2).toString())
            );
          } else {
            const adjustedAmountInClassic = BigNumber.from(routingQuote).mul(110).div(100);

            expect(parseInt(order.info.input.startAmount.toString())).to.be.lt(
              parseInt(adjustedAmountInClassic.toString())
            );
            expect(parseInt(order.info.input.startAmount.toString())).to.be.gte(
              parseInt(BigNumber.from(adjustedAmountInClassic).div(2).toString())
            );
          }

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeDutchSwap(
            alice,
            filler,
            order,
            USDC_MAINNET,
            UNI_MAINNET
          );

          if (type === 'EXACT_INPUT') {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1000');
            checkQuoteToken(
              tokenOutBefore,
              tokenOutAfter,
              CurrencyAmount.fromRawAmount(UNI_MAINNET, order.info.outputs[0].startAmount.toString())
            );
          } else {
            expect(
              tokenOutAfter.subtract(tokenOutBefore).greaterThan(1_000) ||
                tokenOutAfter.subtract(tokenOutBefore).equalTo(1_000)
            ).to.be.true;
            checkQuoteToken(
              tokenInBefore,
              tokenInAfter,
              CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.input.endAmount.toString())
            );
          }
        });

        // TODO: flaky test, blocking base deploy
        xit(`ETH -> large cap, large trade should return valid quote`, async () => {
          const amount = await getAmount(1, type, 'ETH', 'UNI', '1');
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: NATIVE_ADDRESS,
            tokenInChainId: 1,
            tokenOut: UNI_MAINNET.address,
            tokenOutChainId: 1,
            amount: amount,
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
              },
            ] as RoutingConfigJSON[],
          };

          const response = await call(quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const routingResponse = await axiosHelper.get<RoutingApiQuoteResponse>(
            `${ROUTING_API}?${qs.stringify({
              tokenInAddress: 'ETH', // Routing API doesn't support 0x0 as native
              tokenOutAddress: UNI_MAINNET.address,
              tokenInChainId: 1,
              tokenOutChainId: 1,
              amount: amount,
              type: type === 'EXACT_INPUT' ? 'exactIn' : 'exactOut',
              recipient: alice.address,
              slippageTolerance: SLIPPAGE,
              deadline: '360',
              algorithm: 'alpha',
              enableUniversalRouter: true,
            })}`
          );
          expect(routingResponse.status).to.equal(200);

          const order = new DutchOrder((quote as any).orderInfo, 1);
          expect(status).to.equal(200);
          // account for gas and slippage
          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.outputs.length).to.equal(1);

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeDutchSwap(
            alice,
            filler,
            order,
            Ether.onChain(1),
            UNI_MAINNET
          );

          if (type === 'EXACT_INPUT') {
            // We check the *wrapped* balance, since Gouda acts on wrapped tokens, and since we don't
            // wrap ETH in this test. We just use Alice's pre-existing WETH balance.
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('1');
            checkQuoteToken(
              tokenOutBefore,
              tokenOutAfter,
              CurrencyAmount.fromRawAmount(UNI_MAINNET, order.info.outputs[0].startAmount.toString())
            );
          } else {
            expect(
              tokenOutAfter.subtract(tokenOutBefore).greaterThan(1) || tokenOutAfter.subtract(tokenOutBefore).equalTo(1)
            ).to.be.true;
            checkQuoteToken(
              tokenInBefore,
              tokenInAfter,
              CurrencyAmount.fromRawAmount(WETH9[1], order.info.input.endAmount.toString())
            );
          }
        });

        const sendPortionEnabledValues = [true, undefined];
        GREENLIST_TOKEN_PAIRS.forEach(([tokenIn, tokenOut]) => {
          sendPortionEnabledValues.forEach((sendPortionEnabled) => {
            it(`${tokenIn.symbol} -> ${tokenOut.symbol} sendPortionEnabled = ${sendPortionEnabled}`, async () => {
              // if the token amount involves WBTC we have to reduce the WTBC amount to avoid the transfer from failed gas error.
              let originalAmount = '1000';

              if (
                (tokenIn.symbol === 'WBTC' && type === 'EXACT_INPUT') ||
                (tokenOut.symbol === 'WBTC' && type === 'EXACT_OUTPUT')
              ) {
                originalAmount = '1';
              }

              if (
                (tokenIn.wrapped.symbol === 'WETH' && type === 'EXACT_INPUT') ||
                (tokenOut.wrapped.symbol === 'WETH' && type === 'EXACT_OUTPUT')
              ) {
                originalAmount = '10';
              }

              const tokenInAddress = tokenIn.isNative ? NATIVE_ADDRESS : tokenIn.address;
              const tokenOutAddress = tokenOut.isNative ? NATIVE_ADDRESS : tokenOut.address;
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
                useUniswapX: true,
                tokenIn: tokenInAddress,
                tokenInChainId: 1,
                tokenOut: tokenOutAddress,
                tokenOutChainId: 1,
                amount: amount,
                type,
                slippageTolerance: SLIPPAGE,
                sendPortionEnabled,
                configs: [
                  {
                    routingType: RoutingType.DUTCH_LIMIT,
                    swapper: alice.address,
                    // only use non-synthetic quotes if it's ETH -> USDC
                    // otherwise use synthetic quotes
                    // fillers should be able to quote ETH -> USDC since this is the most popular pair
                    useSyntheticQuotes: true,
                  },
                ] as RoutingConfigJSON[],
              };

              const response = await call(quoteReq);
              const {
                data: { quote },
                status,
              } = response;

              const quoteJSON = quote as DutchQuoteDataJSON;
              const order = new DutchOrder((quote as any).orderInfo, 1);
              expect(status).to.equal(200);
              // account for gas and slippage
              expect(order.info.swapper).to.equal(alice.address);

              if (sendPortionEnabled) {
                expect(order.info.outputs.length).to.equal(2);

                const firstOutput = order.info.outputs[0];
                expect(BigNumber.from(firstOutput.startAmount).toNumber()).greaterThan(0);
                const secondOutput = order.info.outputs[1];
                expect(BigNumber.from(secondOutput.startAmount).toNumber()).greaterThan(0);

                expect(getPortionResponse.portion?.bips).not.to.be.undefined;

                if (getPortionResponse.portion?.bips) {
                  const totalOrderStartAmount =
                    type === 'EXACT_INPUT'
                      ? BigNumber.from(firstOutput.startAmount).add(secondOutput.startAmount)
                      : BigNumber.from(firstOutput.startAmount);
                  const totalOrderEndAmount =
                    type === 'EXACT_INPUT'
                      ? BigNumber.from(firstOutput.endAmount).add(secondOutput.endAmount)
                      : BigNumber.from(firstOutput.endAmount);

                  const expectedDutchPortionOrderStartAmount = totalOrderStartAmount
                    .mul(getPortionResponse.portion.bips)
                    .div(BPS);
                  const expectedDutchPortionOrderEndAmount = totalOrderEndAmount
                    .mul(getPortionResponse.portion.bips)
                    .div(BPS);
                  // second order is the dutch portion order
                  expect(BigNumber.from(secondOutput.startAmount).toString()).to.equal(
                    expectedDutchPortionOrderStartAmount.toString()
                  );
                  expect(BigNumber.from(secondOutput.endAmount).toString()).to.equal(
                    expectedDutchPortionOrderEndAmount.toString()
                  );
                }
              } else {
                expect(order.info.outputs.length).to.equal(1);
                expect(quoteJSON.portionBips).to.be.undefined;
                expect(quoteJSON.portionAmount).to.be.undefined;
              }

              const {
                tokenInBefore,
                tokenInAfter,
                tokenOutBefore,
                tokenOutAfter,
                tokenOutPortionRecipientBefore,
                tokenOutPortionRecipientAfter,
              } = await baseTest.executeDutchSwap(alice, filler, order, tokenIn, tokenOut, getPortionResponse.portion);

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
                    CurrencyAmount.fromRawAmount(
                      tokenOut,
                      (quote as DutchQuoteDataJSON).orderInfo.outputs[0].startAmount
                    )
                  );
                }

                if (sendPortionEnabled) {
                  expect(quoteJSON).not.to.be.undefined;
                  expect(quoteJSON.portionBips).not.to.be.undefined;
                  expect(quoteJSON.portionBips).to.be.equal(getPortionResponse.portion?.bips);
                  expect(quoteJSON.portionAmount).not.to.be.undefined;
                  const secondOutput = order.info.outputs[1];
                  expect(quoteJSON.portionAmount).to.be.equal(BigNumber.from(secondOutput.startAmount).toString());

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
                  // exact out swap amount might not be exactly the request amount, due to delay curve
                  // same assertion as other existing tests
                  expect(
                    tokenOutAfter.subtract(tokenOutBefore).greaterThan(originalAmount) ||
                      tokenOutAfter.subtract(tokenOutBefore).equalTo(originalAmount)
                  ).to.be.true;
                }

                // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                if (!tokenIn.isNative) {
                  checkQuoteToken(
                    tokenInBefore,
                    tokenInAfter,
                    CurrencyAmount.fromRawAmount(tokenIn, order.info.input.endAmount.toString())
                  );
                }

                if (sendPortionEnabled) {
                  expect(quoteJSON.portionAmount).not.to.be.undefined;
                  expect(quoteJSON.portionBips).not.to.be.undefined;
                  expect(quoteJSON.portionBips).to.be.equal(getPortionResponse.portion?.bips);

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
            it(`stable-to-stable ${tokenIn.symbol} -> ${tokenOut.symbol} carveout sendPortionEnabled = ${sendPortionEnabled}`, async () => {
              const originalAmount = '1000';
              const tokenInAddress = tokenIn.isNative ? NATIVE_ADDRESS : tokenIn.address;
              const tokenOutAddress = tokenOut.isNative ? NATIVE_ADDRESS : tokenOut.address;
              const amount = await getAmountFromToken(type, tokenIn.wrapped, tokenOut.wrapped, originalAmount);
              const getPortionResponse = await baseTest.portionFetcher.getPortion(
                tokenIn.chainId,
                tokenInAddress,
                tokenOut.chainId,
                tokenOutAddress
              );

              if (sendPortionEnabled) {
                expect(getPortionResponse.hasPortion).to.be.false;
                expect(getPortionResponse.portion).to.be.undefined;
              }

              const quoteReq: QuoteRequestBodyJSON = {
                requestId: 'id',
                useUniswapX: true,
                tokenIn: tokenInAddress,
                tokenInChainId: 1,
                tokenOut: tokenOutAddress,
                tokenOutChainId: 1,
                amount: amount,
                type,
                slippageTolerance: SLIPPAGE,
                sendPortionEnabled,
                configs: [
                  {
                    routingType: RoutingType.DUTCH_LIMIT,
                    swapper: alice.address,
                    useSyntheticQuotes: true,
                  },
                ] as RoutingConfigJSON[],
              };

              const response = await call(quoteReq);
              const {
                data: { quote },
                status,
              } = response;
              const quoteJSON = quote as DutchQuoteDataJSON;

              const order = new DutchOrder((quote as any).orderInfo, 1);
              expect(status).to.equal(200);
              // account for gas and slippage
              expect(order.info.swapper).to.equal(alice.address);
              // doesn't matter portion enabled or not, only one output order
              expect(order.info.outputs.length).to.equal(1);

              if (sendPortionEnabled) {
                expect(quoteJSON.portionAmount).not.to.be.undefined;
                expect(quoteJSON.portionAmount).to.be.equal('0');
                expect(quoteJSON.portionBips).not.to.be.undefined;
                expect(quoteJSON.portionBips!).to.be.equal(0);
              } else {
                expect(quoteJSON.portionBips).to.be.undefined;
                expect(quoteJSON.portionAmount).to.be.undefined;
              }

              const {
                tokenInBefore,
                tokenInAfter,
                tokenOutBefore,
                tokenOutAfter,
                tokenOutPortionRecipientBefore,
                tokenOutPortionRecipientAfter,
              } = await baseTest.executeDutchSwap(alice, filler, order, tokenIn, tokenOut, getPortionResponse.portion);

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
                    CurrencyAmount.fromRawAmount(
                      tokenOut,
                      (quote as DutchQuoteDataJSON).orderInfo.outputs[0].startAmount
                    )
                  );
                }

                if (sendPortionEnabled) {
                  const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                    tokenOut,
                    (quote as DutchQuoteDataJSON).portionAmount!
                  );
                  checkPortionRecipientToken(
                    tokenOutPortionRecipientBefore!,
                    tokenOutPortionRecipientAfter!,
                    expectedPortionAmount
                  );
                }
              } else {
                // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                if (!tokenOut.isNative) {
                  // exact out swap amount might not be exactly the request amount, due to delay curve
                  // same assertion as other existing tests
                  expect(
                    tokenOutAfter.subtract(tokenOutBefore).greaterThan(originalAmount) ||
                      tokenOutAfter.subtract(tokenOutBefore).equalTo(originalAmount)
                  ).to.be.true;
                }

                // if the token out is native token, the difference will be slightly larger due to gas. We have no way to know precise gas costs in terms of GWEI * gas units.
                if (!tokenIn.isNative) {
                  checkQuoteToken(
                    tokenInBefore,
                    tokenInAfter,
                    CurrencyAmount.fromRawAmount(tokenIn, order.info.input.endAmount.toString())
                  );
                }

                if (sendPortionEnabled) {
                  const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                    tokenOut,
                    (quote as DutchQuoteDataJSON).portionAmount!
                  );
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

        it(`stable -> no liq token; should return no quote`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            useUniswapX: true,
            tokenIn: USDC_MAINNET.address,
            tokenInChainId: 1,
            tokenOut: NO_LIQ_TOKEN,
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '0.1'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
              },
            ] as RoutingConfigJSON[],
          };

          await callAndExpectFail(quoteReq, {
            status: 404,
            data: {
              detail: 'No quotes available',
              errorCode: 'QUOTE_ERROR',
            },
          });
        });

        it(`Params: invalid exclusivity override`, async () => {
          const quoteReq: Partial<QuoteRequestBodyJSON> = {
            requestId: 'id',
            useUniswapX: true,
            tokenIn: USDC_MAINNET.address,
            tokenInChainId: 1,
            tokenOut: USDT_MAINNET.address,
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
                exclusivityOverrideBps: -1,
              },
            ] as RoutingConfigJSON[],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: '"configs[0]" does not match any of the allowed types',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });

        it(`Params: invalid auction period`, async () => {
          const quoteReq: Partial<QuoteRequestBodyJSON> = {
            requestId: 'id',
            useUniswapX: true,
            tokenIn: USDC_MAINNET.address,
            tokenInChainId: 1,
            tokenOut: USDT_MAINNET.address,
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                swapper: alice.address,
                useSyntheticQuotes: true,
                auctionPeriodSecs: -1,
              },
            ] as RoutingConfigJSON[],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: '"configs[0]" does not match any of the allowed types',
              errorCode: 'VALIDATION_ERROR',
            },
          });
        });
      });

      it(`Unknown symbol`, async () => {
        const quoteReq: QuoteRequestBodyJSON = {
          requestId: 'id',
          useUniswapX: true,
          tokenIn: 'ASDF',
          tokenInChainId: 1,
          tokenOut: 'USDT',
          tokenOutChainId: 1,
          amount: '1000',
          type,
          slippageTolerance: SLIPPAGE,
          configs: [
            {
              routingType: RoutingType.DUTCH_LIMIT,
              swapper: alice.address,
              useSyntheticQuotes: true,
            },
          ] as RoutingConfigJSON[],
        };

        await callAndExpectFail(quoteReq, {
          status: 400,
          data: {
            detail: 'Could not find token with symbol ASDF',
            errorCode: 'VALIDATION_ERROR',
          },
        });
      });
    });
  }
});
