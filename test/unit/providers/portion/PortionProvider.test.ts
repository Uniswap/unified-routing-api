import axios from '../../../../lib/providers/quoters/helpers';
import { AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import { GetPortionResponse, PortionFetcher, PortionType } from '../../../../lib/fetchers/PortionFetcher';
import { TokenFetcher } from '../../../../lib/fetchers/TokenFetcher';
import { PortionProvider } from '../../../../lib/providers';
import { QuoteRequestInfo } from '../../../../lib/entities';
import { v4 as uuid } from 'uuid';
import { ChainId, Currency, Ether, Fraction, Token, TradeType, WETH9 } from '@uniswap/sdk-core';
import {
  BUSD_MAINNET,
  DAI_ON, EUROC_MAINNET,
  GUSD_MAINNET,
  LUSD_MAINNET,
  USDC_ON,
  USDT_ON
} from '../../../utils/tokens';
import { parseAmount, WBTC_MAINNET } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';
import { BaseCurrency } from '@uniswap/sdk-core/dist/entities/baseCurrency';
import { log } from '../../../../lib/util/log';
import { metrics } from '../../../../lib/util/metrics';
import { PORTION_BIPS, PORTION_RECIPIENT } from '../../../constants';

describe('PortionProvider test', () => {
  const expectedQuote = '1605.56'
  const expectedGas = '2.35'
  process.env.ENABLE_PORTION = 'true';

  describe('getPortion test', () => {
    describe('exact in quote test', () => {

      const portionResponse: GetPortionResponse = {
        hasPortion: true,
        portion: {
          bips: PORTION_BIPS,
          recipient: PORTION_RECIPIENT,
          type: PortionType.Flat,
        }
      }

      const createSpy = jest.spyOn(axios, 'create');
      // @ts-ignore
      const axiosInstanceMock: AxiosInstance = {
        get: jest.fn().mockResolvedValue({ data: portionResponse }),
        // You can optionally mock other methods here, such as post, put, etc.
      };
      createSpy.mockReturnValueOnce(axiosInstanceMock);

      const portionCache = new NodeCache({ stdTTL: 600 });
      const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
      const portionProvider = new PortionProvider(portionFetcher);

      const allPairs: Array<Array<BaseCurrency>> = [
        [Ether.onChain(ChainId.MAINNET), USDC_ON(ChainId.MAINNET)],
        [WETH9[ChainId.MAINNET], USDT_ON(ChainId.MAINNET)],
        [DAI_ON(ChainId.MAINNET), WBTC_MAINNET],
        [BUSD_MAINNET, EUROC_MAINNET],
        [GUSD_MAINNET, LUSD_MAINNET],
        // [agEUR_MAINNET, XSGD_MAINNET], TODO: add agEUR_MAINNET and XSGD_MAINNET into default token list
      ]

      allPairs.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? pair[0] as Currency : pair[0].wrapped
        const token2: Currency | Token = pair[1].isNative ? pair[1] as Currency : pair[1].wrapped
        const tokenSymbol1 = token1.symbol!
        const tokenSymbol2 = token2.symbol!
        const tokenAddress1 = token1.wrapped.address
        const tokenAddress2 = token2.wrapped.address

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount('1.01', token1).quotient.toString())
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenAddress1,
            tokenOut: tokenAddress2,
            amount: requestedAmount,
            type: TradeType.EXACT_INPUT,
            slippageTolerance: "0.5",
            swapper: uuid(),
            useUniswapX: false,
          }
          await exactInGetPortionAndAssert(sharedInfo, token2)
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount('1.01', token1).quotient.toString())
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenSymbol1,
            tokenOut: tokenSymbol2,
            amount: requestedAmount,
            type: TradeType.EXACT_INPUT,
            slippageTolerance: "0.5",
            swapper: uuid(),
            useUniswapX: false,
          }

          await exactInGetPortionAndAssert(sharedInfo, token2)
        });
      })

      async function exactInGetPortionAndAssert(sharedInfo: QuoteRequestInfo, token2: Currency | Token) {
        let [resolvedTokenIn, resolveTokenOut]: [Currency | undefined, Currency | undefined] = [undefined, undefined];

        try {
          const tokenFetcher = new TokenFetcher();
          // we will need to call token fetcher to resolve the tokenIn and tokenOut
          // there's no guarantee that the tokenIn and tokenOut are in the token address
          // also the tokenIn and tokenOut can be native token
          // portion service only accepts wrapped token address
          [resolvedTokenIn, resolveTokenOut] = await Promise.all([
            tokenFetcher.resolveTokenBySymbolOrAddress(sharedInfo.tokenInChainId, sharedInfo.tokenIn),
            tokenFetcher.resolveTokenBySymbolOrAddress(sharedInfo.tokenOutChainId, sharedInfo.tokenOut),
          ]);
        } catch (e) {
          // possible to throw validation error, we have to catch here because we have to proceed
          log.error({ e }, 'Failed to resolve tokenIn & tokenOut');
          metrics.putMetric(`PortionProvider.resolveTokenErr`, 1);
        }

        const quoteAmount = parseAmount(expectedQuote, token2);
        const quoteGasAdjustedAmount = quoteAmount.subtract(parseAmount(expectedGas, token2));

        const getPortionResponse = await portionProvider.getPortion(sharedInfo, resolvedTokenIn?.wrapped.address, resolveTokenOut?.wrapped.address);
        expect(getPortionResponse?.hasPortion).toBe(portionResponse.hasPortion);
        expect(getPortionResponse?.portion).toBeDefined();
        expect(getPortionResponse?.portion).toStrictEqual(portionResponse.portion);

        const portionAmount = portionProvider.getPortionAmount(quoteAmount.quotient.toString(), getPortionResponse.portion, resolveTokenOut);
        const portionAdjustedQuote = portionProvider.getPortionAdjustedQuote(sharedInfo, quoteAmount.quotient.toString(), quoteGasAdjustedAmount.quotient.toString(), portionAmount, resolvedTokenIn, resolveTokenOut);

        // 1605.56 * 10^8 * 5 / 10000 = 80278000
        const expectedPortionAmount = quoteAmount.multiply(new Fraction(portionResponse.portion?.bips ?? 0, 10000))

        // important assertions
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

        // not important assertions
        // (1605.56 - 2.35) * 10^8 - 80278000 = 160240722000
        const expectedQuoteGasAndPortionAdjusted = quoteGasAdjustedAmount.subtract(expectedPortionAmount);
        expect(portionAdjustedQuote?.quotient.toString()).toBe(expectedQuoteGasAndPortionAdjusted.quotient.toString());

        // 160240722000 / 10^8 = 1602.40722000
        expect(portionAdjustedQuote?.toExact()).toBe(expectedQuoteGasAndPortionAdjusted.toExact());
      }
    });

    describe('exact out quote test', () => {
      const portionResponse = {
        hasPortion: true,
        portion: {
          bips: 5,
          recipient: "0x0000000",
          type: "flat",
        }
      }

      const createSpy = jest.spyOn(axios, 'create');
      // @ts-ignore
      const axiosInstanceMock: AxiosInstance = {
        get: jest.fn().mockResolvedValue({ data: portionResponse }),
        // You can optionally mock other methods here, such as post, put, etc.
      };
      createSpy.mockReturnValueOnce(axiosInstanceMock);

      const portionCache = new NodeCache({ stdTTL: 600 });
      const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
      const portionProvider = new PortionProvider(portionFetcher);

      const allPairs: Array<Array<BaseCurrency>> = [
        [Ether.onChain(ChainId.MAINNET), USDC_ON(ChainId.MAINNET)],
        [WETH9[ChainId.MAINNET], USDT_ON(ChainId.MAINNET)],
        [DAI_ON(ChainId.MAINNET), WBTC_MAINNET],
        [BUSD_MAINNET, EUROC_MAINNET],
        [GUSD_MAINNET, LUSD_MAINNET],
        // [agEUR_MAINNET, XSGD], TODO: add agEUR_MAINNET and XSGD into default token list
      ]

      allPairs.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? pair[0] as Currency : pair[0].wrapped
        const token2: Currency | Token = pair[1].isNative ? pair[1] as Currency : pair[1].wrapped
        const tokenSymbol1 = token1.symbol!
        const tokenSymbol2 = token2.symbol!
        const tokenAddress1 = token1.wrapped.address
        const tokenAddress2 = token2.wrapped.address

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount('1.01', token1).quotient.toString())
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenAddress1,
            tokenOut: tokenAddress2,
            amount: requestedAmount,
            type: TradeType.EXACT_OUTPUT,
            slippageTolerance: "0.5",
            swapper: uuid(),
            useUniswapX: false,
          }
          await exactOutGetPortionAndAssert(sharedInfo, token2)
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount('1.01', token1).quotient.toString())
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenSymbol1,
            tokenOut: tokenSymbol2,
            amount: requestedAmount,
            type: TradeType.EXACT_OUTPUT,
            slippageTolerance: "0.5",
            swapper: uuid(),
            useUniswapX: false,
          }

          await exactOutGetPortionAndAssert(sharedInfo, token2)
        });
      })

      async function exactOutGetPortionAndAssert(sharedInfo: QuoteRequestInfo, token2: Currency | Token) {
        let [resolvedTokenIn, resolveTokenOut]: [Currency | undefined, Currency | undefined] = [undefined, undefined];

        try {
          const tokenFetcher = new TokenFetcher();
          // we will need to call token fetcher to resolve the tokenIn and tokenOut
          // there's no guarantee that the tokenIn and tokenOut are in the token address
          // also the tokenIn and tokenOut can be native token
          // portion service only accepts wrapped token address
          [resolvedTokenIn, resolveTokenOut] = await Promise.all([
            tokenFetcher.resolveTokenBySymbolOrAddress(sharedInfo.tokenInChainId, sharedInfo.tokenIn),
            tokenFetcher.resolveTokenBySymbolOrAddress(sharedInfo.tokenOutChainId, sharedInfo.tokenOut),
          ]);
        } catch (e) {
          // possible to throw validation error, we have to catch here because we have to proceed
          log.error({ e }, 'Failed to resolve tokenIn & tokenOut');
          metrics.putMetric(`PortionProvider.resolveTokenErr`, 1);
        }

        const userTypedTokenOutAmount = parseAmount(expectedQuote, token2);
        const getPortionResponse = await portionProvider.getPortion(sharedInfo, resolvedTokenIn?.wrapped.address, resolveTokenOut?.wrapped.address);
        expect(getPortionResponse?.hasPortion).toBe(portionResponse.hasPortion);
        expect(getPortionResponse?.portion).toBeDefined;
        expect(getPortionResponse?.portion).toStrictEqual(portionResponse.portion);

        const quote = userTypedTokenOutAmount.quotient.toString();
        const portionAmount = portionProvider.getPortionAmount(quote, getPortionResponse.portion, resolveTokenOut);
        const quoteGasAdjusted = portionAmount?.add(userTypedTokenOutAmount).quotient.toString() ?? quote
        const portionAdjustedQuote = portionProvider.getPortionAdjustedQuote(sharedInfo, quote, quoteGasAdjusted, portionAmount, resolvedTokenIn, resolveTokenOut);

        // 1605.56 * 10^8 * 5 / 10000 = 80278000
        const expectedPortionAmount = userTypedTokenOutAmount.multiply(new Fraction(portionResponse.portion.bips, 10000))

        // important assertions
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

        // 1605.56 * 10^8 + 80278000 = 160636278000
        // not important assertions
        const expectedPortionAdjustedTokenOutAmount = userTypedTokenOutAmount.add(expectedPortionAmount);
        expect(portionAdjustedQuote?.quotient.toString()).toBe(expectedPortionAdjustedTokenOutAmount.quotient.toString());
      }
    });
  });
});