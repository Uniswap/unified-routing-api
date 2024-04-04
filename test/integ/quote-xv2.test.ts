import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ID_TO_NETWORK_NAME, USDC_MAINNET, USDT_MAINNET } from '@uniswap/smart-order-router';
import { UnsignedV2DutchOrder } from '@uniswap/uniswapx-sdk';
import { AxiosError, AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { RoutingType } from '../../lib/constants';
import { QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { getAmount } from '../utils/tokens';
import { BaseIntegrationTestSuite, callIndicative } from './base.test';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const SLIPPAGE = '5';

describe('quoteUniswapX-v2', function () {
  let baseTest: BaseIntegrationTestSuite;

  // Help with test flakiness by retrying.
  this.retries(2);
  this.timeout(100000);

  let alice: SignerWithAddress;

  before(async function () {
    baseTest = new BaseIntegrationTestSuite();
    [alice] = await baseTest.before();
  });

  for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, async () => {
      it('valid request should either return quote or 404 no quotes available', async () => {
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
              routingType: RoutingType.DUTCH_V2,
              swapper: alice.address,
              useSyntheticQuotes: true,
            },
          ] as RoutingConfigJSON[],
        };

        try {
          const response: AxiosResponse<QuoteResponseJSON> = await callIndicative(quoteReq);
          const {
            data: { quote },
            status,
          } = response;

          const order = new UnsignedV2DutchOrder((quote as any).orderInfo, 1);
          expect(status).to.equal(200);
  
          expect(order.info.swapper).to.equal(alice.address);

          expect(order.info.outputs.length).to.equal(1);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.outputs[0].startAmount.toString())).to.be.lessThan(11000000000);
          expect(parseInt(order.info.input.startAmount.toString())).to.be.greaterThan(9000000000);
          expect(parseInt(order.info.input.startAmount.toString())).to.be.lessThan(11000000000);
        } catch (e: any) {
          if(e instanceof AxiosError && e.response) {
            expect(e.response.status).to.equal(404);
            expect(e.response.data.detail).to.equal('No quotes available');
          }
          else {
            // throw if not an axios error to debug
            throw e;
          }
        }
      });
    });
  }
});
