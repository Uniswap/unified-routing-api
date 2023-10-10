import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Currency, CurrencyAmount, Ether, Fraction, WETH9 } from '@uniswap/sdk-core';
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
import { PERMIT2_ADDRESS } from '@uniswap/universal-router-sdk';
import { fail } from 'assert';
import axiosStatic, { AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import hre from 'hardhat';
import _ from 'lodash';
import qs from 'qs';
import { NATIVE_ADDRESS, RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON, QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { ExclusiveDutchOrderReactor__factory } from '../../lib/types/ext';
import { GREENLIST_STABLE_TO_STABLE_PAIRS, GREENLIST_TOKEN_PAIRS } from '../constants';
import { fund, resetAndFundAtBlock } from '../utils/forkAndFund';
import { getBalance, getBalanceAndApprove } from '../utils/getBalanceAndApprove';
import { RoutingApiQuoteResponse } from '../utils/quoteResponse';
import { getAmount } from '../utils/tokens';

const { ethers } = hre;

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const NO_LIQ_TOKEN = '0x69b148395Ce0015C13e36BFfBAd63f49EF874E03';

if (!process.env.UNISWAP_API || !process.env.ARCHIVE_NODE_RPC || !process.env.ROUTING_API) {
  throw new Error('Must set [UNISWAP_API, ARCHIVE_NODE_RPC, ROUTING_API] env variables for integ tests. See README');
}

if (!process.env.URA_INTERNAL_API_KEY) {
  console.log('URA_INTERNAL_API_KEY env variable is not set. This is recommended for integ tests.');
}

const API = `${process.env.UNISWAP_API!}quote`;
const ROUTING_API = `${process.env.ROUTING_API!}/quote`;

const SLIPPAGE = '5';

const axios = axiosStatic.create();
axios.defaults.timeout = 20000;
const axiosConfig: AxiosRequestConfig<any> = {
  headers: {
    ...(process.env.URA_INTERNAL_API_KEY && { 'x-api-key': process.env.URA_INTERNAL_API_KEY }),
  },
};

axiosRetry(axios, {
  retries: 10,
  retryCondition: (err) => err.response?.status == 429,
  retryDelay: axiosRetry.exponentialDelay,
});

const callAndExpectFail = async (quoteReq: Partial<QuoteRequestBodyJSON>, resp: { status: number; data: any }) => {
  try {
    await axios.post<QuoteResponseJSON>(`${API}`, quoteReq);
    fail();
  } catch (err: any) {
    expect(_.pick(err.response, ['status', 'data'])).to.containSubset(resp);
  }
};

const call = async (
  quoteReq: Partial<QuoteRequestBodyJSON>,
  config = axiosConfig
): Promise<AxiosResponse<QuoteResponseJSON>> => {
  return await axios.post<QuoteResponseJSON>(`${API}`, quoteReq, config);
};

const checkQuoteToken = (
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  tokensQuoted: CurrencyAmount<Currency>
) => {
  // Check which is bigger to support EXACT_INPUT and EXACT_OUTPUT
  const tokensSwapped = after.greaterThan(before) ? after.subtract(before) : before.subtract(after);

  const tokensDiff = tokensQuoted.greaterThan(tokensSwapped)
    ? tokensQuoted.subtract(tokensSwapped)
    : tokensSwapped.subtract(tokensQuoted);
  const percentDiff = tokensDiff.asFraction.divide(tokensQuoted.asFraction);
  expect(percentDiff.lessThan(new Fraction(parseInt(SLIPPAGE), 100))).to.be.true;
};

describe('quoteUniswapX', function () {
  // Help with test flakiness by retrying.
  this.retries(2);

  this.timeout('500s');

  let alice: SignerWithAddress;
  let filler: SignerWithAddress;
  let block: number;

  const executeSwap = async (
    order: DutchOrder,
    currencyIn: Currency,
    currencyOut: Currency
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    const reactor = ExclusiveDutchOrderReactor__factory.connect(order.info.reactor, filler);

    // Approve Permit2 for Alice
    // Note we pass in currency.wrapped, since Gouda does not support native ETH in
    const tokenInBefore = await getBalanceAndApprove(alice, PERMIT2_ADDRESS, currencyIn.wrapped);
    const tokenOutBefore = await getBalance(alice, currencyOut);

    // Directly approve reactor for filler funds
    await getBalanceAndApprove(filler, order.info.reactor, currencyOut);

    const { domain, types, values } = order.permitData();
    const signature = await alice._signTypedData(domain, types, values);

    const transactionResponse = await reactor.execute({ order: order.serialize(), sig: signature });
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(alice, currencyIn.wrapped);
    const tokenOutAfter = await getBalance(alice, currencyOut);

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    };
  };

  before(async function () {
    this.timeout(40000);
    [alice, filler] = await ethers.getSigners();

    // Make a dummy call to the API to get a block number to fork from.
    const quoteReq: QuoteRequestBodyJSON = {
      requestId: 'id',
      useUniswapX: true,
      tokenIn: 'USDC',
      tokenInChainId: 1,
      tokenOut: 'USDT',
      tokenOutChainId: 1,
      amount: await getAmount(1, 'EXACT_INPUT', 'USDC', 'USDT', '100'),
      type: 'EXACT_INPUT',
      configs: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
    };

    const {
      data: { quote },
    } = await call(quoteReq);
    const { blockNumber } = quote as ClassicQuoteDataJSON;

    block = parseInt(blockNumber) - 10;

    alice = await resetAndFundAtBlock(alice, block, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('10', WBTC_MAINNET),
      parseAmount('5000', UNI_MAINNET),
      parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
    ]);

    filler = await fund(filler, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('10', WBTC_MAINNET),
      parseAmount('5000', UNI_MAINNET),
      parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
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

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
              CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.input.startAmount.toString())
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

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
              CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.input.startAmount.toString())
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

          const routingResponse = await axios.get<RoutingApiQuoteResponse>(
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

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
              CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.input.startAmount.toString())
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

          const routingResponse = await axios.get<RoutingApiQuoteResponse>(
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

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
              CurrencyAmount.fromRawAmount(WETH9[1], order.info.input.startAmount.toString())
            );
          }
        });

        const sendPortionEnabledValues = [true, undefined];
        GREENLIST_TOKEN_PAIRS.forEach(([tokenIn, tokenOut]) => {
          sendPortionEnabledValues.forEach((sendPortionEnabled) => {
            it(`${tokenIn.symbol} -> ${tokenOut.symbol} sendPortionEnabled = ${sendPortionEnabled}`, async () => {
              // Arrange:
              // - token amount from swapper
              // - greenlist token pairs
              // - parametrize on sendPortionEnabled
              getAmount(1, type, tokenIn.symbol!, tokenOut.symbol!, '100');

              // Act:
              // - call dutch quote

              // Assert:
              // - check if the response is 200
              // - check if the response contains portion-related payloads if sendPortionEnabled = true
              // - check if the response contains only portionBips and portionAmount if sendPortionEnabled not send, explicitly check for portionRecipient = undefined

              // Act:
              // use the dutch encoded order to connect to reactor and execute the swap

              // Assert:
              // - check if the swap is successful
              // - check if the token balances are correct
              //   - token balances assertion will stay the same for exact in and exact out
              //   - need to explicitly check if the portion recipient balances increases for exact in and exact out (new setup)
              //   - explicitly check that the portion recipient balances increase is the portion Bips against token out balance changes
            });
          });
        });

        GREENLIST_STABLE_TO_STABLE_PAIRS.forEach(([tokenIn, tokenOut]) => {
          sendPortionEnabledValues.forEach((sendPortionEnabled) => {
            it(`stable-to-stable ${tokenIn.symbol} -> ${tokenOut.symbol} carveout sendPortionEnabled = ${sendPortionEnabled}`, async () => {
              // Arrange:
              // - token amount from swapper
              // - greenlist token pairs
              // - parametrize on sendPortionEnabled
              getAmount(1, type, tokenIn.symbol!, tokenOut.symbol!, '100');

              // Act:
              // - call dutch quote

              // Assert:
              // - check if the response is 200
              // - check if the response contains only portionBips and portionAmount all equal to zero if sendPortionEnabled not send, explicitly check for portionRecipient = undefined

              // Act:
              // use the dutch encoded order to connect to reactor and execute the swap

              // Assert:
              // - check if the swap is successful
              // - check if the token balances are correct
              //   - token balances assertion will stay the same for exact in and exact out
              //   - need to explicitly check if the portion recipient balances has no change
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
