import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DutchLimitOrder } from '@uniswap/gouda-sdk';
import { Currency, CurrencyAmount, Fraction, WETH9 } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  parseAmount,
  UNI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '@uniswap/smart-order-router';
import { PERMIT2_ADDRESS } from '@uniswap/universal-router-sdk';
import { fail } from 'assert';
import axiosStatic, { AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import hre from 'hardhat';
import _ from 'lodash';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON } from '../../lib/entities/quote';
import { QuoteRequestBodyJSON } from '../../lib/entities/request';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { ExclusiveDutchLimitOrderReactor__factory } from '../../lib/types/ext';
import { fund, resetAndFundAtBlock } from '../utils/forkAndFund';
import { getBalance, getBalanceAndApprove, getBalanceAndApprovePermit2 } from '../utils/getBalanceAndApprove';
import { getAmount } from '../utils/tokens';

const { ethers } = hre;

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const DIRECT_TAKER = '0x0000000000000000000000000000000000000001';

if (!process.env.UNISWAP_API || !process.env.ARCHIVE_NODE_RPC) {
  throw new Error('Must set UNISWAP_API and ARCHIVE_NODE_RPC env variables for integ tests. See README');
}

const API = `${process.env.UNISWAP_API!}quote`;

const SLIPPAGE = '5';

const axios = axiosStatic.create();
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
    expect(err.response).to.containSubset(resp);
  }
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

describe('quoteGouda', function () {
  // Help with test flakiness by retrying.
  this.retries(0);

  this.timeout('500s');

  let alice: SignerWithAddress;
  let filler: SignerWithAddress;
  let block: number;

  const executeSwap = async (
    order: DutchLimitOrder,
    currencyIn: Currency,
    currencyOut: Currency
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    const reactor = ExclusiveDutchLimitOrderReactor__factory.connect(order.info.reactor, filler);

    // Approve Permit2
    const tokenInBefore = await getBalanceAndApprove(alice, PERMIT2_ADDRESS, currencyIn);
    const tokenOutBefore = await getBalance(alice, currencyOut);

    // Approve reactor for filler funds
    await getBalanceAndApprove(filler, PERMIT2_ADDRESS, currencyOut);
    await getBalanceAndApprovePermit2(filler, order.info.reactor, currencyOut);

    const { domain, types, values } = order.permitData();
    const signature = await alice._signTypedData(domain, types, values);

    const transactionResponse = await reactor.execute({ order: order.serialize(), sig: signature }, DIRECT_TAKER, '0x');
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(alice, currencyIn);
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
    } = await axios.post<QuoteResponseJSON>(`${API}`, quoteReq);
    const { blockNumber } = quote as ClassicQuoteDataJSON;

    block = parseInt(blockNumber) - 10;

    alice = await resetAndFundAtBlock(alice, block, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('10', WBTC_MAINNET),
      parseAmount('1000', UNI_MAINNET),
      parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
    ]);

    filler = await fund(filler, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('10', WBTC_MAINNET),
      parseAmount('1000', UNI_MAINNET),
      parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
    ]);
  });

  // TODO: add exactOutput when we support it
  for (const type of ['EXACT_INPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, () => {
      describe(`+ Execute Swap`, () => {
        it(`erc20 -> erc20`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
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
                offerer: alice.address,
              },
            ],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await axios.post<QuoteResponseJSON>(`${API}`, quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const order = new DutchLimitOrder(quote as any, 1);
          expect(status).to.equal(200);

          expect(order.info.offerer).to.equal(alice.address);
          expect(order.info.outputs.length).to.equal(1);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.greaterThan(90000000);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.lessThan(110000000);

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            order,
            USDC_MAINNET,
            USDT_MAINNET
          );

          expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
          checkQuoteToken(
            tokenOutBefore,
            tokenOutAfter,
            CurrencyAmount.fromRawAmount(USDT_MAINNET, order.info.outputs[0].startAmount.toString())
          );
        });

        it(`Fails on small size`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
            tokenIn: USDC_MAINNET.address,
            tokenInChainId: 1,
            tokenOut: USDT_MAINNET.address,
            tokenOutChainId: 1,
            amount: await getAmount(1, type, 'USDC', 'USDT', '0.00001'),
            type,
            slippageTolerance: SLIPPAGE,
            configs: [
              {
                routingType: RoutingType.DUTCH_LIMIT,
                offerer: alice.address,
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

        it(`erc20 -> erc20 by name`, async () => {
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
                routingType: RoutingType.DUTCH_LIMIT,
                offerer: alice.address,
              },
            ],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await axios.post<QuoteResponseJSON>(`${API}`, quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const order = new DutchLimitOrder(quote as any, 1);
          expect(status).to.equal(200);

          expect(order.info.offerer).to.equal(alice.address);
          expect(order.info.outputs.length).to.equal(1);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.greaterThan(90000000);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.lessThan(110000000);

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            order,
            USDC_MAINNET,
            USDT_MAINNET
          );

          expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('100');
          checkQuoteToken(
            tokenOutBefore,
            tokenOutAfter,
            CurrencyAmount.fromRawAmount(USDT_MAINNET, order.info.outputs[0].startAmount.toString())
          );
        });

        it(`Params: invalid exclusivity override`, async () => {
          const quoteReq: Partial<QuoteRequestBodyJSON> = {
            requestId: 'id',
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
                offerer: alice.address,
                exclusivityOverrideBps: -1,
              },
            ],
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
                offerer: alice.address,
                auctionPeriodSecs: -1,
              },
            ],
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
    });
  }
});
