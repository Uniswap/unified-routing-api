import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  ID_TO_NETWORK_NAME,
  USDC_MAINNET,
  USDT_MAINNET,
} from '@uniswap/smart-order-router';
import { RelayOrder } from '@uniswap/uniswapx-sdk';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import _ from 'lodash';
import { RoutingType } from '../../lib/constants';
import { QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { getAmount } from '../utils/tokens';
import { BaseIntegrationTestSuite, call } from './base.test';
import { RelayOrderReactor__factory } from '../../lib/types/ext';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const SLIPPAGE = '5';

describe('relayQuote', function () {
  let baseTest: BaseIntegrationTestSuite;
  let reactorAddress: string;

  // Help with test flakiness by retrying.
  this.retries(2);
  this.timeout(40000);

  let alice: SignerWithAddress;
  let filler: SignerWithAddress;

  before(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice, filler] = await baseTest.before();
    // deploy reactor
    const factory = new RelayOrderReactor__factory(alice);
    const reactorContract = (await baseTest.deployContract(factory, [
      PERMIT2_ADDRESS, UNIVERSAL_ROUTER_ADDRESS(1)
    ]));
    reactorAddress = reactorContract.address;
  });

  for (const type of ['EXACT_INPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, () => {
      describe(`+ Execute Swap`, () => {
        it(`stable -> stable, large trade should return valid quote`, async () => {
          const quoteReq: QuoteRequestBodyJSON = {
            requestId: 'id',
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

          order.info.reactor = reactorAddress;

          expect(order.info.swapper).to.equal(alice.address);
          expect(order.info.inputs.length).to.equal(2);
          expect(parseInt(order.info.inputs[0].startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.inputs[0].startAmount.toString())).to.be.lessThan(11000000000);

          const { tokenInBefore, tokenInAfter, gasTokenBefore, gasTokenAfter, tokenOutBefore, tokenOutAfter } = await baseTest.executeRelaySwap(
            alice,
            filler,
            order,
            USDC_MAINNET,
            USDC_MAINNET,
            USDT_MAINNET,
          );

          if (type === 'EXACT_INPUT') {
            // gte here because gas could be taken in the input token too
            console.log(tokenInBefore.subtract(tokenInAfter).toExact(), gasTokenBefore.subtract(gasTokenAfter).toExact());
            expect(tokenInBefore.subtract(tokenInAfter).greaterThan(10_000) || tokenInBefore.subtract(tokenInAfter).equalTo(10_000)).to.be.true;
            expect(gasTokenBefore.subtract(gasTokenAfter).greaterThan(0) || gasTokenBefore.subtract(gasTokenAfter).equalTo(0)).to.be.true;
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
