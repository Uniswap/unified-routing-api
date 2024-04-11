import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ZERO } from '@uniswap/router-sdk';
import { Currency, CurrencyAmount, Fraction, Percent } from '@uniswap/sdk-core';
import {
  parseAmount,
  USDC_MAINNET,
  USDT_MAINNET,
} from '@uniswap/smart-order-router';
import { RelayOrder } from '@uniswap/uniswapx-sdk';
import {
  PERMIT2_ADDRESS
} from '@uniswap/universal-router-sdk';
import { fail } from 'assert';
import axiosStatic, { AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { expect } from 'chai';
import hre from 'hardhat';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON } from '../../lib/entities/quote';
import { QuoteRequestBodyJSON } from '../../lib/entities/request';
import { PortionFetcher } from '../../lib/fetchers/PortionFetcher';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { RelayOrderReactor__factory } from '../../lib/types/ext';
import { resetAndFundAtBlock } from '../utils/forkAndFund';
import { getBalance, getBalanceAndApprove } from '../utils/getBalanceAndApprove';
import { getAmount } from '../utils/tokens';

const { ethers } = hre;

if (!process.env.UNISWAP_API || !process.env.ARCHIVE_NODE_RPC) {
  throw new Error('Must set UNISWAP_API and ARCHIVE_NODE_RPC env variables for integ tests. See README');
}

if (!process.env.PORTION_API_URL) {
  throw new Error('Must set PORTION_API_URL env variables for integ tests. See README');
}

if (!process.env.URA_INTERNAL_API_KEY) {
  console.log('URA_INTERNAL_API_KEY env variable is not set. This is recommended for integ tests.');
}

// URA endpoint
const API = `${process.env.UNISWAP_API!}quote`;

const SLIPPAGE = '5';

export interface HardQuoteRequest {
  requestId: string;
  encodedInnerOrder: string;
  innerSig: string;
  tokenInChainId: number;
  tokenOutChainId: number;
}

export interface HardQuoteResponseData {
  requestId: string;
  quoteId?: string;
  chainId: number;
  encodedOrder: string;
  orderHash: string;
  filler?: string;
}

export const axiosHelper = axiosStatic.create({
  timeout: 30000,
});
const axiosConfig: AxiosRequestConfig<any> = {
  headers: {
    ...(process.env.URA_INTERNAL_API_KEY && { 'x-api-key': process.env.URA_INTERNAL_API_KEY }),
    ...(process.env.FORCE_PORTION_SECRET && { 'X-UNISWAP-FORCE-PORTION-SECRET': process.env.FORCE_PORTION_SECRET }),
  },
};

axiosRetry(axiosHelper, {
  retries: 10,
  retryCondition: (err) => err.response?.status == 429,
  retryDelay: axiosRetry.exponentialDelay,
});

export const callAndExpectFail = async (
  quoteReq: Partial<QuoteRequestBodyJSON>,
  resp: { status: number; data: any }
) => {
  try {
    await axiosHelper.post<QuoteResponseJSON>(`${API}`, quoteReq);
    fail();
  } catch (err: any) {
    expect(_.pick(err.response, ['status', 'data'])).to.containSubset(resp);
  }
};

export const call = async (
  quoteReq: Partial<QuoteRequestBodyJSON>,
  config = axiosConfig
): Promise<AxiosResponse<QuoteResponseJSON>> => {
  return await axiosHelper.post<QuoteResponseJSON>(`${API}`, quoteReq, config);
};

export const callIndicative = async (
  quoteReq: Partial<QuoteRequestBodyJSON>,
  config = axiosConfig
): Promise<AxiosResponse<QuoteResponseJSON>> => {
  return await axiosHelper.post<QuoteResponseJSON>(`${API}`, quoteReq, config);
};

export const checkQuoteToken = (
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
  expect(
    percentDiff.lessThan(new Fraction(parseInt(SLIPPAGE), 100)),
    `expected tokensQuoted ${tokensQuoted.toExact()} actual tokens swapped ${tokensSwapped.toExact()}`
  ).to.be.true;
};

export const checkPortionRecipientToken = (
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

let warnedTesterPK = false;
export const isTesterPKEnvironmentSet = (): boolean => {
  const isSet = !!process.env.TESTER_PK;
  if (!isSet && !warnedTesterPK) {
    console.log('Skipping tests requiring real PK since env variables for TESTER_PK is not set.');
    warnedTesterPK = true;
  }
  return isSet;
};

export class BaseIntegrationTestSuite {
  block: number;
  curNonce = 0;
  portionFetcher: PortionFetcher;

  nextPermitNonce: () => string = () => {
    const nonce = this.curNonce.toString();
    this.curNonce = this.curNonce + 1;
    return nonce;
  };

  executeRelaySwap = async (
    swapper: SignerWithAddress,
    filler: SignerWithAddress,
    order: RelayOrder,
    currencyIn: Currency,
    currencyGasToken: Currency,
    currencyOut: Currency
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    gasTokenAfter: CurrencyAmount<Currency>;
    gasTokenBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    const reactor = RelayOrderReactor__factory.connect(order.info.reactor, filler);

    // Approve Permit2 for Alice
    // Note we pass in currency.wrapped, since reactor does not support native ETH in
    const tokenInBefore = await getBalanceAndApprove(swapper, PERMIT2_ADDRESS, currencyIn.wrapped);
    const tokenOutBefore = await getBalance(swapper, currencyOut);
    const gasTokenBefore = await getBalanceAndApprove(swapper, PERMIT2_ADDRESS, currencyGasToken.wrapped);

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const transactionResponse = await reactor['execute((bytes,bytes),address)'](
      { order: order.serialize(), sig: signature },
      filler.address
    );
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(swapper, currencyIn.wrapped);
    const tokenOutAfter = await getBalance(swapper, currencyOut);
    const gasTokenAfter = await getBalance(swapper, currencyGasToken.wrapped);

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
      gasTokenAfter,
      gasTokenBefore,
    };
  };

  before = async () => {
    const [alice, filler] = await ethers.getSigners();

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
          protocols: ['V2'],
        },
      ],
    };

    const {
      data: { quote },
    } = await call(quoteReq);
    const { blockNumber } = quote as ClassicQuoteDataJSON;

    this.block = parseInt(blockNumber) - 10;

    await resetAndFundAtBlock(alice, this.block, [
      parseAmount('80000000', USDC_MAINNET),
      parseAmount('50000000', USDT_MAINNET),
    ]);

    process.env.ENABLE_PORTION = 'true';
    if (process.env.PORTION_API_URL) {
      this.portionFetcher = new PortionFetcher(process.env.PORTION_API_URL, new NodeCache());
    }

    return [alice, filler];
  };
}
