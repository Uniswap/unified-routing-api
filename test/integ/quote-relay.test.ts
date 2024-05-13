import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
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
import { BaseIntegrationTestSuite, call, callAndExpectFail } from './base.test';

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

  beforeEach(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice] = await baseTest.before();
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
        });

        it('missing gasToken in request config' , async () => {
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
              },
            ] as RoutingConfigJSON[],
          };

          await callAndExpectFail(quoteReq, {
            status: 400,
            data: {
              detail: `"configs[0]" does not match any of the allowed types`,
              errorCode: 'VALIDATION_ERROR',
            },
          });
        })
      });
    });
  }
});
