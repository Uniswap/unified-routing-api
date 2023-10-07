import { ChainId, Currency, Ether, Fraction, Token, TradeType, WETH9 } from '@uniswap/sdk-core';
import { BaseCurrency } from '@uniswap/sdk-core/dist/entities/baseCurrency';
import { parseAmount, WBTC_MAINNET } from '@uniswap/smart-order-router';
import { AxiosInstance } from 'axios';
import { BigNumber } from 'ethers';
import NodeCache from 'node-cache';
import { v4 as uuid } from 'uuid';
import { QuoteRequestInfo } from '../../../../lib/entities';
import { GetPortionResponse, PortionFetcher } from '../../../../lib/fetchers/PortionFetcher';
import { PortionProvider } from '../../../../lib/providers';
import axios from '../../../../lib/providers/quoters/helpers';
import { FLAT_PORTION, GREENLIST_TOKEN_PAIRS, PORTION_BIPS, PORTION_RECIPIENT } from '../../../constants';
import {
  BUSD_MAINNET,
  DAI_ON,
  EUROC_MAINNET,
  GUSD_MAINNET,
  LUSD_MAINNET,
  USDC_ON,
  USDT_ON,
} from '../../../utils/tokens';

describe('PortionProvider test', () => {
  const expectedRequestAmount = '1.01';
  const expectedQuote = '1605.56';
  const expectedGas = '2.35';
  process.env.ENABLE_PORTION = 'true';

  describe('getPortion test', () => {
    describe('exact in quote test', () => {
      const portionResponse: GetPortionResponse = {
        hasPortion: true,
        portion: FLAT_PORTION,
      };

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

      GREENLIST_TOKEN_PAIRS.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? (pair[0] as Currency) : pair[0].wrapped;
        const token2: Currency | Token = pair[1].isNative ? (pair[1] as Currency) : pair[1].wrapped;
        const tokenSymbol1 = token1.symbol!;
        const tokenSymbol2 = token2.symbol!;
        const tokenAddress1 = token1.wrapped.address;
        const tokenAddress2 = token2.wrapped.address;

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount(expectedRequestAmount, token1).quotient.toString());
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenAddress1,
            tokenOut: tokenAddress2,
            amount: requestedAmount,
            type: TradeType.EXACT_INPUT,
            slippageTolerance: '0.5',
            swapper: uuid(),
            useUniswapX: false,
          };
          await exactInGetPortionAndAssert(sharedInfo, token1, token2);
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount(expectedRequestAmount, token1).quotient.toString());
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenSymbol1,
            tokenOut: tokenSymbol2,
            amount: requestedAmount,
            type: TradeType.EXACT_INPUT,
            slippageTolerance: '0.5',
            swapper: uuid(),
            useUniswapX: false,
          };

          await exactInGetPortionAndAssert(sharedInfo, token1, token2);
        });
      });

      async function exactInGetPortionAndAssert(
        sharedInfo: QuoteRequestInfo,
        token1: Currency | Token,
        token2: Currency | Token
      ) {
        const quoteAmount = parseAmount(expectedQuote, token2);
        const quoteGasAdjustedAmount = quoteAmount.subtract(parseAmount(expectedGas, token2));

        const getPortionResponse = await portionProvider.getPortion(
          sharedInfo,
          token1.wrapped.address,
          token2.wrapped.address
        );
        expect(getPortionResponse?.hasPortion).toBe(portionResponse.hasPortion);
        expect(getPortionResponse?.portion).toBeDefined();
        expect(getPortionResponse?.portion).toStrictEqual(portionResponse.portion);

        const portionAmount = portionProvider.getPortionAmount(
          quoteAmount.quotient.toString(),
          getPortionResponse.portion,
          token2
        );
        const portionAdjustedQuote = portionProvider.getPortionAdjustedQuote(
          sharedInfo,
          quoteAmount.quotient.toString(),
          quoteGasAdjustedAmount.quotient.toString(),
          portionAmount,
          token1,
          token2
        );

        // 1605.56 * 10^8 * 5 / 10000 = 80278000
        const expectedPortionAmount = quoteAmount.multiply(new Fraction(portionResponse.portion?.bips ?? 0, 10000));
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

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
          bips: PORTION_BIPS,
          recipient: PORTION_RECIPIENT,
          type: 'flat',
        },
      };

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
      ];

      allPairs.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? (pair[0] as Currency) : pair[0].wrapped;
        const token2: Currency | Token = pair[1].isNative ? (pair[1] as Currency) : pair[1].wrapped;
        const tokenSymbol1 = token1.symbol!;
        const tokenSymbol2 = token2.symbol!;
        const tokenAddress1 = token1.wrapped.address;
        const tokenAddress2 = token2.wrapped.address;

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount(expectedRequestAmount, token2).quotient.toString());
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenAddress1,
            tokenOut: tokenAddress2,
            amount: requestedAmount,
            type: TradeType.EXACT_OUTPUT,
            slippageTolerance: '0.5',
            swapper: uuid(),
            useUniswapX: false,
          };
          await exactOutGetPortionAndAssert(sharedInfo, token1, token2);
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          const requestedAmount = BigNumber.from(parseAmount(expectedRequestAmount, token2).quotient.toString());
          const sharedInfo: QuoteRequestInfo = {
            requestId: uuid(),
            tokenInChainId: ChainId.MAINNET,
            tokenOutChainId: ChainId.MAINNET,
            tokenIn: tokenSymbol1,
            tokenOut: tokenSymbol2,
            amount: requestedAmount,
            type: TradeType.EXACT_OUTPUT,
            slippageTolerance: '0.5',
            swapper: uuid(),
            useUniswapX: false,
          };

          await exactOutGetPortionAndAssert(sharedInfo, token1, token2);
        });
      });

      async function exactOutGetPortionAndAssert(
        sharedInfo: QuoteRequestInfo,
        token1: Currency | Token,
        token2: Currency | Token
      ) {
        const amount = parseAmount(expectedRequestAmount, token2);
        const quoteAmount = parseAmount(expectedQuote, token1);
        const getPortionResponse = await portionProvider.getPortion(
          sharedInfo,
          token1?.wrapped.address,
          token2?.wrapped.address
        );
        expect(getPortionResponse?.hasPortion).toBe(portionResponse.hasPortion);
        expect(getPortionResponse?.portion).toBeDefined;
        expect(getPortionResponse?.portion).toStrictEqual(portionResponse.portion);

        const quote = quoteAmount.quotient.toString();
        const portionAmount = portionProvider.getPortionAmount(
          amount.quotient.toString(),
          getPortionResponse.portion,
          token2
        );
        const quoteGasAdjustedAmount = quoteAmount.add(parseAmount(expectedGas, token1));
        const portionAdjustedQuote = portionProvider.getPortionAdjustedQuote(
          sharedInfo,
          quote,
          quoteGasAdjustedAmount.quotient.toString(),
          portionAmount,
          token1,
          token2
        );

        // 1.01 * 10^8 * 12 / 10000 = 121200
        // (exact out requested amount) * (USDC decimal scale) * (portion bips) / 10000 = portion amount
        const expectedPortionAmount = amount.multiply(new Fraction(portionResponse.portion.bips, 10000));
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

        const expectedPortionQuoteAmount = portionProvider.getPortionQuoteAmount(expectedPortionAmount, quoteAmount, amount);

        // 1605.56 * 10^18 + 121200 / (1.01 * 10^8 + 121200) * 1605.56 * 10^18 = 1.6074867e+21
        // (exact in quote amount) * (ETH decimal scale) + (portion amount) / (exact out requested amount + portion amount) * (exact in quote amount) * (ETH decimal scale) = portion adjusted quote amount
        const expectedQuoteGasAndPortionAdjusted = quoteGasAdjustedAmount.add(expectedPortionQuoteAmount);
        expect(portionAdjustedQuote?.quotient.toString()).toBe(expectedQuoteGasAndPortionAdjusted.quotient.toString());
      }
    });
  });
});
