import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { BaseIntegrationTestSuite, call, checkQuoteToken } from './base.test';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { fund } from '../utils/forkAndFund';
import {
  DAI_MAINNET,
  parseAmount,
  UNI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET, WRAPPED_NATIVE_CURRENCY
} from '@uniswap/smart-order-router';
import { ChainId, CurrencyAmount, WETH9 } from '@uniswap/sdk-core';
import { agEUR_MAINNET, getAmount, XSGD_MAINNET } from '../utils/tokens';
import { ClassicQuoteDataJSON, QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { RoutingType } from '../../lib/constants';
import { AxiosResponse } from 'axios';
import { QuoteResponseJSON } from '../../lib/handlers/quote';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { DutchOrder } from '@uniswap/uniswapx-sdk';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const SLIPPAGE = '5';

describe('quoteClassic and quoteUniswapX competition trade', function () {
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

  for (const algorithm of ['alpha']) {
    it(`WETH -> USDC, large trade`, async () => {
      const exactInQuoteRequest: QuoteRequestBodyJSON = {
        requestId: 'id',
        useUniswapX: true,
        tokenIn: USDC_MAINNET.address,
        tokenInChainId: 1,
        tokenOut: USDT_MAINNET.address,
        tokenOutChainId: 1,
        amount: await getAmount(1, 'EXACT_INPUT', 'WETH', 'USDC', '900000'),
        type: 'EXACT_INPUT',
        slippageTolerance: SLIPPAGE,
        configs: [
          {
            routingType: RoutingType.DUTCH_LIMIT,
            swapper: alice.address,
            useSyntheticQuotes: true,
          },
          {
            routingType: RoutingType.CLASSIC,
            recipient: alice.address,
            deadline: 360,
            algorithm,
            enableUniversalRouter: true,
          },
        ] as RoutingConfigJSON[],
      };

      const response: AxiosResponse<QuoteResponseJSON> = await call(exactInQuoteRequest);
      const {
        status,
        data: { quote: quoteJSON, routing: routing },
      } = response;
      expect(status).to.equal(200);

      if (routing === RoutingType.CLASSIC) {
        const { quote, quoteDecimals, quoteGasAdjustedDecimals,quoteGasAndPortionAdjusted, methodParameters } =
          quoteJSON as ClassicQuoteDataJSON;

        expect(parseFloat(quoteGasAdjustedDecimals)).to.be.lessThanOrEqual(parseFloat(quoteDecimals));

        expect(methodParameters).to.not.be.undefined;
        expect(methodParameters?.to).to.equal(UNIVERSAL_ROUTER_ADDRESS);

        const { tokenOutBefore: tokenOutBefore, tokenOutAfter: tokenOutAfter } = await baseTest.executeSwap(
          alice,
          methodParameters!,
          WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET],
          USDC_MAINNET
        );
        checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote));

        const exactOutQuoteRequest: QuoteRequestBodyJSON = {
          requestId: 'id',
          useUniswapX: true,
          tokenIn: USDC_MAINNET.address,
          tokenInChainId: 1,
          tokenOut: USDT_MAINNET.address,
          tokenOutChainId: 1,
          amount: quoteGasAndPortionAdjusted!,
          type: 'EXACT_OUTPUT',
          slippageTolerance: SLIPPAGE,
          configs: [
            {
              routingType: RoutingType.DUTCH_LIMIT,
              swapper: alice.address,
              useSyntheticQuotes: true,
            },
            {
              routingType: RoutingType.CLASSIC,
              recipient: alice.address,
              deadline: 360,
              algorithm,
              enableUniversalRouter: true,
            },
          ] as RoutingConfigJSON[],
        };
        const response: AxiosResponse<QuoteResponseJSON> = await call(exactOutQuoteRequest);
        const {
          status,
          data: { routing: routing },
        } = response;
        expect(status).to.equal(200);
        expect(routing).to.equal(RoutingType.CLASSIC);
      } else if (routing === RoutingType.DUTCH_LIMIT) {
        const order = new DutchOrder((quoteJSON as any).orderInfo, 1);
        const { tokenOutBefore: tokenOutBefore, tokenOutAfter: tokenOutAfter } = await baseTest.executeDutchSwap(
          alice,
          filler,
          order,
          WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET],
          USDC_MAINNET
        );
        checkQuoteToken(
          tokenOutBefore,
          tokenOutAfter,
          CurrencyAmount.fromRawAmount(USDC_MAINNET, order.info.outputs[0].startAmount.toString())
        );

        const exactOutQuoteRequest: QuoteRequestBodyJSON = {
          requestId: 'id',
          useUniswapX: true,
          tokenIn: USDC_MAINNET.address,
          tokenInChainId: 1,
          tokenOut: USDT_MAINNET.address,
          tokenOutChainId: 1,
          amount: order.info.outputs[0].startAmount.toString(),
          type: 'EXACT_OUTPUT',
          slippageTolerance: SLIPPAGE,
          configs: [
            {
              routingType: RoutingType.DUTCH_LIMIT,
              swapper: alice.address,
              useSyntheticQuotes: true,
            },
            {
              routingType: RoutingType.CLASSIC,
              recipient: alice.address,
              deadline: 360,
              algorithm,
              enableUniversalRouter: true,
            },
          ] as RoutingConfigJSON[],
        };
        const response: AxiosResponse<QuoteResponseJSON> = await call(exactOutQuoteRequest);
        const {
          status,
          data: { routing: routing },
        } = response;
        expect(status).to.equal(200);
        expect(routing).to.equal(RoutingType.DUTCH_LIMIT);
      }
    });
  }
});