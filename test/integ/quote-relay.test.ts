import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ZERO } from '@uniswap/router-sdk';
import { Currency, CurrencyAmount, Ether, Fraction, Percent, WETH9 } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  parseAmount,
  UNI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '@uniswap/smart-order-router';
import { DutchOrder, RelayOrder } from '@uniswap/uniswapx-sdk';
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
import NodeCache from 'node-cache';
import qs from 'qs';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON, DutchQuoteDataJSON, QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { Portion, PortionFetcher } from '../../lib/fetchers/PortionFetcher';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { RelayOrderReactor__factory } from '../../lib/types/ext';
import { fund, resetAndFundAtBlock } from '../utils/forkAndFund';
import { getBalance, getBalanceAndApprove } from '../utils/getBalanceAndApprove';
import { RoutingApiQuoteResponse } from '../utils/quoteResponse';
import { agEUR_MAINNET, getAmount, getAmountFromToken, XSGD_MAINNET } from '../utils/tokens';

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

if (!process.env.PORTION_API_URL) {
  throw new Error('Must set PORTION_API_URL env variables for integ tests. See README');
}

const API = `${process.env.UNISWAP_API!}quote`;
const ROUTING_API = `${process.env.ROUTING_API!}/quote`;

const SLIPPAGE = '5';

const axios = axiosStatic.create();
axios.defaults.timeout = 20000;
const axiosConfig: AxiosRequestConfig<any> = {
  headers: {
    ...(process.env.URA_INTERNAL_API_KEY && { 'x-api-key': process.env.URA_INTERNAL_API_KEY }),
    ...(process.env.FORCE_PORTION_SECRET && { 'X-UNISWAP-FORCE-PORTION-SECRET': process.env.FORCE_PORTION_SECRET }),
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

const checkPortionRecipientToken = (
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  expectedPortionAmountReceived: CurrencyAmount<Currency>
) => {
  const actualPortionAmountReceived = after.subtract(before);

  const tokensDiff = expectedPortionAmountReceived.greaterThan(actualPortionAmountReceived)
    ? expectedPortionAmountReceived.subtract(actualPortionAmountReceived)
    : actualPortionAmountReceived.subtract(expectedPortionAmountReceived);
  // There will be a slight difference between expected and actual due to slippage during the hardhat fork swap.
  const percentDiff = tokensDiff.equalTo(ZERO)
    ? new Percent(ZERO)
    : tokensDiff.asFraction.divide(expectedPortionAmountReceived.asFraction);
  expect(percentDiff.lessThan(new Fraction(parseInt(SLIPPAGE), 100))).to.be.true;
};

describe('relayQuote', function () {
  // Help with test flakiness by retrying.
  this.retries(2);

  this.timeout('500s');

  let alice: SignerWithAddress;
  let filler: SignerWithAddress;
  let block: number;
  let portionFetcher: PortionFetcher;

  const executeSwap = async (
    order: RelayOrder,
    currencyIn: Currency,
    currencyGasToken: Currency,
    currencyOut: Currency,
    portion?: Portion
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    gasTokenAfter: CurrencyAmount<Currency>;
    gasTokenBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    const reactor = RelayOrderReactor__factory.connect(order.info.reactor, filler);
    const portionRecipientSigner = portion?.recipient ? await ethers.getSigner(portion?.recipient) : undefined;

    // Approve Permit2 for Alice
    // Note we pass in currency.wrapped, since Gouda does not support native ETH in
    const tokenInBefore = await getBalanceAndApprove(alice, PERMIT2_ADDRESS, currencyIn.wrapped);
    const tokenOutBefore = await getBalance(alice, currencyOut);
    const gasTokenBefore = await getBalanceAndApprove(alice, PERMIT2_ADDRESS, currencyGasToken.wrapped);

    const { domain, types, values } = order.permitData();
    const signature = await alice._signTypedData(domain, types, values);

    const transactionResponse = await reactor.execute({ order: order.serialize(), sig: signature });
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(alice, currencyIn.wrapped);
    const tokenOutAfter = await getBalance(alice, currencyOut);
    const gasTokenAfter = await getBalance(alice, currencyGasToken.wrapped);

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
      gasTokenAfter,
      gasTokenBefore,
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
      parseAmount('50000', agEUR_MAINNET),
      parseAmount('475000', XSGD_MAINNET),
    ]);

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

    process.env.ENABLE_PORTION = 'true';
    if (process.env.PORTION_API_URL) {
      portionFetcher = new PortionFetcher(process.env.PORTION_API_URL, new NodeCache());
    }
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
                routingType: RoutingType.RELAY,
                swapper: alice.address,
                gasToken: USDC_MAINNET.address
              },
            ] as RoutingConfigJSON[],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const order = new RelayOrder((quote as any).orderInfo, 1);
          expect(status).to.equal(200);

          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.inputs.length).to.equal(2);
          expect(parseInt(order.info.inputs[0].startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.inputs[0].startAmount.toString())).to.be.lessThan(11000000000);

          const { tokenInBefore, tokenInAfter, gasTokenBefore, gasTokenAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            order,
            USDC_MAINNET,
            USDC_MAINNET,
            USDT_MAINNET
          );

          if (type === 'EXACT_INPUT') {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).to.equal('10000');
          } else {
            expect(
              tokenOutAfter.subtract(tokenOutBefore).greaterThan(10_000) ||
                tokenOutAfter.subtract(tokenOutBefore).equalTo(10_000)
            ).to.be.true;
          }
        });
      });
    });
  }
});
