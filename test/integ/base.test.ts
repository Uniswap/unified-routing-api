import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ZERO } from '@uniswap/router-sdk';
import { ChainId, Currency, CurrencyAmount, Fraction, Percent } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  MethodParameters,
  parseAmount,
  SWAP_ROUTER_02_ADDRESSES,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
  WETH9,
} from '@uniswap/smart-order-router';
import { DutchOrder } from '@uniswap/uniswapx-sdk';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS as UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN,
} from '@uniswap/universal-router-sdk';
import { fail } from 'assert';
import axiosStatic, { AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { expect } from 'chai';
import { BigNumber, providers } from 'ethers';
import hre from 'hardhat';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON } from '../../lib/entities/quote';
import { QuoteRequestBodyJSON } from '../../lib/entities/request';
import { Portion, PortionFetcher } from '../../lib/fetchers/PortionFetcher';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { ExclusiveDutchOrderReactor__factory, Permit2__factory } from '../../lib/types/ext';
import { resetAndFundAtBlock } from '../utils/forkAndFund';
import { getBalance, getBalanceAndApprove } from '../utils/getBalanceAndApprove';
import { agEUR_MAINNET, BULLET, getAmount, UNI_MAINNET, XSGD_MAINNET } from '../utils/tokens';

const { ethers } = hre;

const UNIVERSAL_ROUTER_ADDRESS = UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN(1);

if (!process.env.UNISWAP_API || !process.env.ARCHIVE_NODE_RPC) {
  throw new Error('Must set UNISWAP_API and ARCHIVE_NODE_RPC env variables for integ tests. See README');
}

if (!process.env.URA_INTERNAL_API_KEY) {
  console.log('URA_INTERNAL_API_KEY env variable is not set. This is recommended for integ tests.');
}

if (!process.env.PORTION_API_URL) {
  throw new Error('Must set PORTION_API_URL env variables for integ tests. See README');
}

const API = `${process.env.UNISWAP_API!}quote`;

const SLIPPAGE = '5';

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

const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff';

export class BaseIntegrationTestSuite {
  block: number;
  curNonce = 0;
  portionFetcher: PortionFetcher;

  nextPermitNonce: () => string = () => {
    const nonce = this.curNonce.toString();
    this.curNonce = this.curNonce + 1;
    return nonce;
  };

  executeSwap = async (
    swapper: SignerWithAddress,
    methodParameters: MethodParameters,
    currencyIn: Currency,
    currencyOut: Currency,
    permit?: boolean,
    chainId = ChainId.MAINNET,
    portion?: Portion
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
    tokenOutPortionRecipientBefore?: CurrencyAmount<Currency>;
    tokenOutPortionRecipientAfter?: CurrencyAmount<Currency>;
  }> => {
    const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, swapper);
    const portionRecipientSigner = portion?.recipient ? await ethers.getSigner(portion?.recipient) : undefined;

    // Approve Permit2
    const tokenInBefore = await getBalanceAndApprove(swapper, PERMIT2_ADDRESS, currencyIn);
    const tokenOutBefore = await getBalance(swapper, currencyOut);
    const tokenOutPortionRecipientBefore = portionRecipientSigner
      ? await getBalance(portionRecipientSigner, currencyOut)
      : undefined;

    // Approve SwapRouter02 in case we request calldata for it instead of Universal Router
    await getBalanceAndApprove(swapper, SWAP_ROUTER_02_ADDRESSES(chainId), currencyIn);

    // If not using permit do a regular approval allowing narwhal max balance.
    if (!permit) {
      const approveNarwhal = await permit2.approve(
        currencyIn.wrapped.address,
        UNIVERSAL_ROUTER_ADDRESS,
        MAX_UINT160,
        100000000000000
      );
      await approveNarwhal.wait();
    }

    const transaction = {
      data: methodParameters.calldata,
      to: methodParameters.to,
      value: BigNumber.from(methodParameters.value),
      from: swapper.address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    };

    const transactionResponse: providers.TransactionResponse = await swapper.sendTransaction(transaction);
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(swapper, currencyIn);
    const tokenOutAfter = await getBalance(swapper, currencyOut);
    const tokenOutPortionRecipientAfter = portionRecipientSigner
      ? await getBalance(portionRecipientSigner, currencyOut)
      : undefined;

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
      tokenOutPortionRecipientBefore,
      tokenOutPortionRecipientAfter,
    };
  };

  executeDutchSwap = async (
    swapper: SignerWithAddress,
    filler: SignerWithAddress,
    order: DutchOrder,
    currencyIn: Currency,
    currencyOut: Currency,
    portion?: Portion
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
    tokenOutPortionRecipientAfter: CurrencyAmount<Currency>;
    tokenOutPortionRecipientBefore: CurrencyAmount<Currency>;
  }> => {
    const reactor = ExclusiveDutchOrderReactor__factory.connect(order.info.reactor, filler);
    const portionRecipientSigner = portion?.recipient ? await ethers.getSigner(portion?.recipient) : undefined;

    // Approve Permit2 for swapper
    // Note we pass in currency.wrapped, since Gouda does not support native ETH in
    const tokenInBefore = await getBalanceAndApprove(swapper, PERMIT2_ADDRESS, currencyIn.wrapped);
    const tokenOutBefore = await getBalance(swapper, currencyOut);
    const tokenOutPortionRecipientBefore = portionRecipientSigner
      ? await getBalance(portionRecipientSigner, currencyOut)
      : CurrencyAmount.fromRawAmount(currencyOut, '0');

    // Directly approve reactor for filler funds
    await getBalanceAndApprove(filler, order.info.reactor, currencyOut);

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const transactionResponse = await reactor.execute({ order: order.serialize(), sig: signature });
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(swapper, currencyIn.wrapped);
    const tokenOutAfter = await getBalance(swapper, currencyOut);
    const tokenOutPortionRecipientAfter = portionRecipientSigner
      ? await getBalance(portionRecipientSigner, currencyOut)
      : CurrencyAmount.fromRawAmount(currencyOut, '0');

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
      tokenOutPortionRecipientAfter,
      tokenOutPortionRecipientBefore,
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
      parseAmount('100', WBTC_MAINNET),
      parseAmount('10000', UNI_MAINNET),
      parseAmount('400', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
      parseAmount('50000', agEUR_MAINNET),
      parseAmount('475000', XSGD_MAINNET),
      parseAmount('700000', BULLET),
    ]);

    process.env.ENABLE_PORTION = 'true';
    if (process.env.PORTION_API_URL) {
      this.portionFetcher = new PortionFetcher(process.env.PORTION_API_URL, new NodeCache());
    }

    return [alice, filler];
  };
}
