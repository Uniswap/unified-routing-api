import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { WETH9 } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  parseAmount,
  UNI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '@uniswap/smart-order-router';
import { UnsignedV2DutchOrder } from '@uniswap/uniswapx-sdk';
import { AxiosResponse } from 'axios';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import { ethers } from 'ethers';
import { RoutingType } from '../../lib/constants';
import { QuoteRequestBodyJSON, RoutingConfigJSON } from '../../lib/entities';
import { QuoteResponseJSON } from '../../lib/handlers/quote/handler';
import { fund } from '../utils/forkAndFund';
import { agEUR_MAINNET, getAmount, XSGD_MAINNET } from '../utils/tokens';
import { BaseIntegrationTestSuite, callHard, callIndicative, HardQuoteResponseData } from './base.test';

chai.use(chaiAsPromised);
chai.use(chaiSubset);

const SLIPPAGE = '5';
const REQUEST_ID = 'bbe75c5f-8ae5-46a1-ab3d-ce201cf56689';

describe('quoteUniswapX-v2', function () {
  let baseTest: BaseIntegrationTestSuite;

  // Help with test flakiness by retrying.
  this.retries(2);
  this.timeout(100000);

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
      parseAmount('5000', agEUR_MAINNET),
      parseAmount('475000', XSGD_MAINNET),
    ]);
  });

  for (const type of ['EXACT_INPUT', 'EXACT_OUTPUT']) {
    describe(`${ID_TO_NETWORK_NAME(1)} ${type} 2xx`, async () => {
      describe(`+ Execute Swap`, () => {
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
                useSyntheticQuotes: false,
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
            expect(order.info.cosigner).to.equal(ethers.constants.AddressZero);
            expect(order.info.swapper).to.equal(alice.address);
            expect(order.info.outputs.length).to.equal(1);
          } catch (e: any) {
            expect(e.response.status).to.equal(404);
            expect(e.response.data.detail).to.equal('No quotes available');
          }
        });

        // TODO: maybe move this to param-api integ tests?
        it('stable -> stable, large trade', async () => {
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

          // user accepts and signs quote
          const { domain, types, values } = order.permitData();
          const signature = await alice._signTypedData(domain, types, values);
          const encodedInnerOrder = order.serialize();
          const hardQuoteReq = {
            requestId: REQUEST_ID,
            encodedInnerOrder,
            innerSig: signature,
            tokenInChainId: 1,
            tokenOutChainId: 1,
          };
          //TODO: other infras are in place we can remove the try catch
          try {
            const secondaryResponse: AxiosResponse<HardQuoteResponseData> = await callHard(hardQuoteReq);
            expect(secondaryResponse.status).to.equal(200);
          } catch (e: any) {
            expect([
              'Unknown cosigner',
              'Error posting order',
              'No quotes available',
              'Error posting order',
            ]).to.include(e.response.data.detail);
          }
        });
      });
    });
  }
});
