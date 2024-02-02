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

  for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, () => {
      describe(`+ Execute Swap`, () => {
        it(`stable -> stable, gas token == input token, no encoded actions`, async () => {
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

          const gasInput = order.info.inputs.find((input) => input.recipient === "0x0000000000000000000000000000000000000000")!;

          const { tokenInBefore, tokenInAfter } = await baseTest.executeRelaySwap(
            alice,
            filler,
            order,
            USDC_MAINNET,
            USDC_MAINNET,
            USDT_MAINNET,
          );

          const netMaxInputAmount = Number(gasInput.maxAmount as unknown as string) + 10_000
          expect(tokenInAfter.subtract(tokenInBefore).lessThan(netMaxInputAmount) || tokenInAfter.subtract(tokenInBefore).equalTo(netMaxInputAmount)).to.be.true;
        });
      });
    });
  }
});
