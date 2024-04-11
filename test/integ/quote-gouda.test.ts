import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ID_TO_NETWORK_NAME, UNI_MAINNET, USDC_MAINNET, USDT_MAINNET } from '@uniswap/smart-order-router';
import { DutchOrder } from '@uniswap/uniswapx-sdk';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import qs from 'qs';
import { NATIVE_ADDRESS, RoutingType } from '../../lib/constants';
import { QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { RoutingApiQuoteResponse } from '../utils/quoteResponse';
import { getAmount } from '../utils/tokens';
import { axiosHelper, BaseIntegrationTestSuite, call, callAndExpectFail } from './base.test';

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

  before(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice] = await baseTest.before();
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
    });
  }
});
