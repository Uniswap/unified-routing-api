import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { DAI_MAINNET, ID_TO_NETWORK_NAME, USDC_MAINNET, USDT_MAINNET } from '@uniswap/smart-order-router';
import { RelayOrder } from '@uniswap/uniswapx-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import _ from 'lodash';
import { RoutingType } from '../../lib/constants';
import { QuoteRequestBodyJSON, RelayQuoteDataJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { RelayOrderReactor__factory } from '../../lib/types/ext';
import { getAmount } from '../utils/tokens';
import { BaseIntegrationTestSuite, call } from './base.test';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const SLIPPAGE = '5';

describe.skip('relayQuote', function () {
  let baseTest: BaseIntegrationTestSuite;
  let reactorAddress: string;

  // Help with test flakiness by retrying.
  this.retries(2);
  this.timeout(40000);

  let alice: SignerWithAddress;
  let filler: SignerWithAddress;

  beforeEach(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice, filler] = await baseTest.before();
    // deploy reactor
    const factory = new RelayOrderReactor__factory(alice);
    const reactorContract = await baseTest.deployContract(factory, [UNIVERSAL_ROUTER_ADDRESS(1)]);
    reactorAddress = reactorContract.address;
  });

  for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, () => {
      describe(`+ Execute Swap`, () => {
        it(`stable -> stable, gas token == input token`, async () => {
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
                routingType: RoutingType.RELAY,
                protocols: ['V2', 'V3', 'MIXED'],
                swapper: alice.address,
                gasToken: USDC_MAINNET.address,
              },
            ] as RoutingConfigJSON[],
          };

          const response: AxiosResponse<QuoteResponseJSON> = await call(quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          expect(status).to.equal(200);
          const order = RelayOrder.parse((quote as RelayQuoteDataJSON).encodedOrder, 1);
          order.info.reactor = reactorAddress;

          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.input).to.not.be.undefined;
          expect(order.info.fee).to.not.be.undefined;
          expect(order.info.universalRouterCalldata).to.not.be.undefined;

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeRelaySwap(
            alice,
            filler,
            order,
            USDC_MAINNET, // tokenIn
            USDC_MAINNET, // gasToken
            USDT_MAINNET // outputToken
          );

          const expectedMinAmountOut = CurrencyAmount.fromRawAmount(
            USDT_MAINNET,
            (quote as RelayQuoteDataJSON).classicQuoteData.quote
          )
            .multiply(95)
            .divide(100); // apply slippage

          const expectedMaxAmountIn = CurrencyAmount.fromRawAmount(
            USDC_MAINNET,
            parseInt(order.info.fee.endAmount.toString()) + parseInt(order.info.input.amount.toString())
          );
          // at most netMaxAmountIn of tokenIn should be spent
          expect(
            tokenInBefore.subtract(tokenInAfter).lessThan(expectedMaxAmountIn) ||
              tokenInBefore.subtract(tokenInAfter).equalTo(expectedMaxAmountIn)
          ).to.be.true;
          // user should have received at least expectedAmountOut of tokenOut
          expect(
            tokenOutAfter.subtract(tokenOutBefore).greaterThan(expectedMinAmountOut) ||
              tokenOutAfter.subtract(tokenOutBefore).equalTo(expectedMinAmountOut)
          ).to.be.true;
        });

        it(`stable -> stable, gas token != input token`, async () => {
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
                routingType: RoutingType.RELAY,
                protocols: ['V2', 'V3', 'MIXED'],
                swapper: alice.address,
                gasToken: DAI_MAINNET.address,
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

          order.info.reactor = reactorAddress;

          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.input).to.not.be.undefined;
          expect(order.info.fee).to.not.be.undefined;
          expect(order.info.universalRouterCalldata).to.not.be.undefined;

          const { tokenInBefore, tokenInAfter, gasTokenBefore, gasTokenAfter, tokenOutBefore, tokenOutAfter } =
            await baseTest.executeRelaySwap(alice, filler, order, USDC_MAINNET, DAI_MAINNET, USDT_MAINNET);

          const expectedMinAmountOut = CurrencyAmount.fromRawAmount(
            USDT_MAINNET,
            (quote as RelayQuoteDataJSON).classicQuoteData.quote
          )
            .multiply(95)
            .divide(100); // apply slippage

          const tokenInMaxAmount = CurrencyAmount.fromRawAmount(
            USDC_MAINNET,
            parseInt(order.info.input.amount.toString())
          );
          const gasMaxAmount = CurrencyAmount.fromRawAmount(DAI_MAINNET, parseInt(order.info.fee.endAmount.toString()));

          expect(
            tokenInBefore.subtract(tokenInAfter).lessThan(tokenInMaxAmount) ||
              tokenInBefore.subtract(tokenInAfter).equalTo(tokenInMaxAmount)
          ).to.be.true;
          expect(
            gasTokenBefore.subtract(gasTokenAfter).lessThan(gasMaxAmount) ||
              gasTokenBefore.subtract(gasTokenAfter).equalTo(gasMaxAmount)
          ).to.be.true;
          // user should have received at least expectedAmountOut of tokenOut
          expect(
            tokenOutAfter.subtract(tokenOutBefore).greaterThan(expectedMinAmountOut) ||
              tokenOutAfter.subtract(tokenOutBefore).equalTo(expectedMinAmountOut)
          ).to.be.true;
        });
      });
    });
  }
});
