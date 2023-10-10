import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { AllowanceTransfer, PermitSingle } from '@uniswap/permit2-sdk';
import { ChainId, Currency, CurrencyAmount, Ether, Fraction, Token, WETH9 } from '@uniswap/sdk-core';
import {
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  MethodParameters,
  NATIVE_CURRENCY,
  parseAmount,
  SWAP_ROUTER_02_ADDRESSES,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '@uniswap/smart-order-router';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS as UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN,
} from '@uniswap/universal-router-sdk';
import { fail } from 'assert';
import axiosStatic, { AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { BigNumber, providers, Wallet } from 'ethers';
import hre from 'hardhat';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { SUPPORTED_CHAINS } from '../../lib/config/chains';
import { RoutingType } from '../../lib/constants';
import { ClassicQuoteDataJSON } from '../../lib/entities/quote';
import { QuoteRequestBodyJSON } from '../../lib/entities/request';
import { Portion, PortionFetcher } from '../../lib/fetchers/PortionFetcher';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { Permit2__factory } from '../../lib/types/ext';
import { GREENLIST_STABLE_TO_STABLE_PAIRS, GREENLIST_TOKEN_PAIRS } from '../constants';
import { resetAndFundAtBlock } from '../utils/forkAndFund';
import { getBalance, getBalanceAndApprove } from '../utils/getBalanceAndApprove';
import { DAI_ON, getAmount, getAmountFromToken, UNI_MAINNET, USDC_ON, WNATIVE_ON } from '../utils/tokens';

const { ethers } = hre;

chai.use(chaiAsPromised);
chai.use(chaiSubset);

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
const LARGE_SLIPPAGE = '10';

const axios = axiosStatic.create();
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
  expect(
    percentDiff.lessThan(new Fraction(parseInt(SLIPPAGE), 100)),
    `expected tokensQuoted ${tokensQuoted.toExact()} actual tokens swapped ${tokensSwapped.toExact()}`
  ).to.be.true;
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
  const percentDiff = tokensDiff.asFraction.divide(expectedPortionAmountReceived.asFraction);
  expect(percentDiff.lessThan(new Fraction(parseInt(SLIPPAGE), 100))).to.be.true;
};

let warnedTesterPK = false;
const isTesterPKEnvironmentSet = (): boolean => {
  const isSet = !!process.env.TESTER_PK;
  if (!isSet && !warnedTesterPK) {
    console.log('Skipping tests requiring real PK since env variables for TESTER_PK is not set.');
    warnedTesterPK = true;
  }
  return isSet;
};

const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff';

describe('quote', function () {
  // Help with test flakiness by retrying.
  this.retries(3);

  this.timeout('500s');

  let alice: SignerWithAddress;
  let block: number;
  let curNonce = 0;
  let portionFetcher: PortionFetcher;
  const nextPermitNonce: () => string = () => {
    const nonce = curNonce.toString();
    curNonce = curNonce + 1;
    return nonce;
  };

  const executeSwap = async (
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
    const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, alice);
    const portionRecipientSigner = portion?.recipient ? await ethers.getSigner(portion?.recipient) : undefined;

    // Approve Permit2
    const tokenInBefore = await getBalanceAndApprove(alice, PERMIT2_ADDRESS, currencyIn);
    const tokenOutBefore = await getBalance(alice, currencyOut);
    const tokenOutPortionRecipientBefore = portionRecipientSigner
      ? await getBalance(portionRecipientSigner, currencyOut)
      : undefined;

    // Approve SwapRouter02 in case we request calldata for it instead of Universal Router
    await getBalanceAndApprove(alice, SWAP_ROUTER_02_ADDRESSES(chainId), currencyIn);

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
      from: alice.address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    };

    const transactionResponse: providers.TransactionResponse = await alice.sendTransaction(transaction);
    await transactionResponse.wait();

    const tokenInAfter = await getBalance(alice, currencyIn);
    const tokenOutAfter = await getBalance(alice, currencyOut);
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

  before(async function () {
    this.timeout(40000);
    [alice] = await ethers.getSigners();

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
    } = await call(quoteReq);
    const { blockNumber } = quote as ClassicQuoteDataJSON;

    block = parseInt(blockNumber) - 10;

    alice = await resetAndFundAtBlock(alice, block, [
      parseAmount('80000000', USDC_MAINNET),
      parseAmount('50000000', USDT_MAINNET),
      parseAmount('100', WBTC_MAINNET),
      parseAmount('10000', UNI_MAINNET),
      parseAmount('40000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
    ]);

    process.env.ENABLE_PORTION = 'true';
    if (process.env.PORTION_API_URL) {
      portionFetcher = new PortionFetcher(process.env.PORTION_API_URL, new NodeCache());
    }
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const nonce = nextPermitNonce();

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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
            const nonce = nextPermitNonce();

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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
                    recipient: alice.address,
                    deadline: 360,
                    algorithm: 'alpha',
                    protocols: ['v3'],
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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
                    recipient: alice.address,
                    deadline: 360,
                    algorithm: 'alpha',
                    protocols: ['v2'],
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            /// Tests for routes likely to result in MixedRoutes being returned
            if (type === 'EXACT_INPUT') {
              it(`erc20 -> erc20 forceMixedRoutes not specified for v2,v3 does not return mixed route even when it is better`, async () => {
                const quoteReq: QuoteRequestBodyJSON = {
                  requestId: 'id',
                  tokenIn: 'BOND',
                  tokenInChainId: 1,
                  tokenOut: 'APE',
                  tokenOutChainId: 1,
                  amount: await getAmount(1, type, 'BOND', 'APE', '10000'),
                  type,
                  slippageTolerance: SLIPPAGE,
                  configs: [
                    {
                      routingType: RoutingType.CLASSIC,
                      recipient: alice.address,
                      deadline: 360,
                      algorithm: 'alpha',
                      protocols: ['v2', 'v3'],
                      enableUniversalRouter: true,
                    },
                  ],
                };

                const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
                const {
                  data: { quote: quoteJSON },
                  status,
                } = response;
                const { quoteDecimals, quoteGasAdjustedDecimals, methodParameters, routeString } =
                  quoteJSON as ClassicQuoteDataJSON;

                expect(status).to.equal(200);

                if (type == 'EXACT_INPUT') {
                  expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
                } else {
                  expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
                }

                expect(methodParameters).to.not.be.undefined;

                expect(!routeString.includes('[V2 + V3]'));
              });

              it(`erc20 -> erc20 forceMixedRoutes true for v2,v3`, async () => {
                const quoteReq: QuoteRequestBodyJSON = {
                  requestId: 'id',
                  tokenIn: 'BOND',
                  tokenInChainId: 1,
                  tokenOut: 'APE',
                  tokenOutChainId: 1,
                  amount: await getAmount(1, type, 'BOND', 'APE', '10000'),
                  type,
                  slippageTolerance: SLIPPAGE,
                  configs: [
                    {
                      routingType: RoutingType.CLASSIC,
                      recipient: alice.address,
                      deadline: 360,
                      algorithm: 'alpha',
                      forceMixedRoutes: true,
                      protocols: ['v2', 'v3'],
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

              it(`erc20 -> erc20 forceMixedRoutes true for all protocols specified`, async () => {
                const quoteReq: QuoteRequestBodyJSON = {
                  requestId: 'id',
                  tokenIn: 'BOND',
                  tokenInChainId: 1,
                  tokenOut: 'APE',
                  tokenOutChainId: 1,
                  amount: await getAmount(1, type, 'BOND', 'APE', '10000'),
                  type,
                  slippageTolerance: SLIPPAGE,
                  configs: [
                    {
                      routingType: RoutingType.CLASSIC,
                      recipient: alice.address,
                      deadline: 360,
                      algorithm: 'alpha',
                      forceMixedRoutes: true,
                      protocols: ['v2', 'v3', 'mixed'],
                      enableUniversalRouter: true,
                    },
                  ],
                };

                const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
                const {
                  data: { quote: quoteJSON },
                  status,
                } = response;
                const { quoteDecimals, quoteGasAdjustedDecimals, methodParameters, routeString } =
                  quoteJSON as ClassicQuoteDataJSON;

                expect(status).to.equal(200);

                if (type == 'EXACT_INPUT') {
                  expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));
                } else {
                  expect(parseFloat(quoteGasAdjustedDecimals)).to.be.greaterThanOrEqual(parseFloat(quoteDecimals));
                }

                expect(methodParameters).to.not.be.undefined;

                /// since we only get the routeString back, we can check if there's V3 + V2
                expect(routeString.includes('[V2 + V3]'));
              });
            }
          }
        });

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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

              const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
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

            // TODO: when prod secret is true, we will need to test sendPortionEnabledValues = true
            const sendPortionEnabledValues = [undefined]; // [true, undefined];
            GREENLIST_TOKEN_PAIRS.forEach(([tokenIn, tokenOut]) => {
              sendPortionEnabledValues.forEach((sendPortionEnabled) => {
                // TODO: remove shouldSkip once the bug is fixed
                const shouldSkip =
                  // there's a known bug of portion service not supporting the native address 0x00.00 lookup
                  // that will cause the native token portion tests to fail
                  ((tokenIn.isNative || tokenOut.isNative) && sendPortionEnabled) ||
                  (sendPortionEnabled && type === 'EXACT_OUTPUT');
                // there's a known bug of SOR not adding the portion amount to the route output amount
                // that will cause the exact output token amount increase assertion to fail

                shouldSkip
                  ? it.skip
                  : it(`${tokenIn.symbol} -> ${tokenOut.symbol} sendPortionEnabled = ${sendPortionEnabled}`, async () => {
                      const originalAmount = '10';
                      const tokenInSymbol = tokenIn.symbol!;
                      const tokenOutSymbol = tokenOut.symbol!;
                      const tokenInAddress = tokenIn.isNative ? tokenInSymbol : tokenIn.address;
                      const tokenOutAddress = tokenOut.isNative ? tokenOutSymbol : tokenOut.address;
                      const amount = await getAmountFromToken(type, tokenIn.wrapped, tokenOut.wrapped, originalAmount);
                      const getPortionResponse = await portionFetcher.getPortion(
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
                          const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                            tokenOut,
                            quoteJSON.quote
                          ).multiply(new Fraction(getPortionResponse.portion?.bips ?? 0, 10000));
                          expect(quoteJSON.portionAmount).to.equal(expectedPortionAmount.quotient.toString());
                        } else if (type == 'EXACT_OUTPUT') {
                          const expectedPortionAmount = CurrencyAmount.fromRawAmount(tokenOut, amount).multiply(
                            new Fraction(getPortionResponse.portion?.bips ?? 0, 10000)
                          );
                          expect(quoteJSON.portionAmount).to.equal(expectedPortionAmount.quotient.toString());
                        }
                      }

                      const {
                        tokenInBefore,
                        tokenInAfter,
                        tokenOutBefore,
                        tokenOutAfter,
                        tokenOutPortionRecipientBefore,
                        tokenOutPortionRecipientAfter,
                      } = await executeSwap(
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

                          const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                            tokenOut,
                            quoteJSON.portionAmount!
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

                          const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                            tokenOut,
                            quoteJSON.portionAmount!
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

            GREENLIST_STABLE_TO_STABLE_PAIRS.forEach(([tokenIn, tokenOut]) => {
              sendPortionEnabledValues.forEach((sendPortionEnabled) => {
                // TODO: remove shouldSkip once the stable-to-stable is merged
                // portion service doesn't have the stable-to-stable merged yet
                // all tests are skipped for now
                const shouldSkip = sendPortionEnabled;

                shouldSkip
                  ? it.skip
                  : it(`stable-to-stable ${tokenIn.symbol} -> ${tokenOut.symbol} sendPortionEnabled = ${sendPortionEnabled}`, async () => {
                      const originalAmount = '10';
                      const tokenInSymbol = tokenIn.symbol!;
                      const tokenOutSymbol = tokenOut.symbol!;
                      const tokenInAddress = tokenIn.isNative ? tokenInSymbol : tokenIn.address;
                      const tokenOutAddress = tokenOut.isNative ? tokenOutSymbol : tokenOut.address;
                      const amount = await getAmountFromToken(type, tokenIn.wrapped, tokenOut.wrapped, originalAmount);
                      const getPortionResponse = await portionFetcher.getPortion(
                        tokenIn.chainId,
                        tokenInAddress,
                        tokenOut.chainId,
                        tokenOutAddress
                      );

                      // TODO: remove the if statement, once portion service doesn't return portion for stable-to-stable
                      if (sendPortionEnabled) {
                        expect(getPortionResponse.hasPortion).to.be.false;
                        expect(getPortionResponse.portion).to.be.undefined;
                      }

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
                        expect(quoteJSON.portionAmountDecimals).to.equal(0);
                      }

                      const {
                        tokenInBefore,
                        tokenInAfter,
                        tokenOutBefore,
                        tokenOutAfter,
                        tokenOutPortionRecipientBefore,
                        tokenOutPortionRecipientAfter,
                      } = await executeSwap(
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

                          const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                            tokenOut,
                            quoteJSON.portionAmount!
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

                          const expectedPortionAmount = CurrencyAmount.fromRawAmount(
                            tokenOut,
                            quoteJSON.portionAmount!
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
          });
        }
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

          expect(methodParameters).to.be.undefined;
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

          expect(methodParameters).to.be.undefined;
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
                recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aZZZZZZZ',
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
