import { Currency, CurrencyAmount, Ether, TradeType, WETH9 } from '@uniswap/sdk-core';
import { DAI_MAINNET, USDC_MAINNET as USDC, USDT_MAINNET, WBTC_MAINNET } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { TokenFetcher } from '../fetchers/TokenFetcher';
import { log } from './log';
import { metrics } from './metrics';

export enum QuoteType {
  CLASSIC = 'CLASSIC',
  SYNTHETIC = 'SYNTHETIC',
  RFQ = 'RFQ',
}

export class MetricPair {
  private INFINITY = 'X';

  constructor(
    public chainId: number,
    public tokenIn: Currency,
    public tokenOut: Currency,
    public buckets: [string, string][]
  ) {}

  public async emitMetricIfValid(
    tokenFetcher: TokenFetcher,
    tokenInAddress: string,
    tokenOutAddress: string,
    amount: string,
    bestQuoteType: QuoteType
  ): Promise<string | null> {
    try {
      const tokenIn = await tokenFetcher.resolveToken(this.chainId, tokenInAddress);
      const tokenOut = await tokenFetcher.resolveToken(this.chainId, tokenOutAddress);

      if (!tokenIn.equals(this.tokenIn) || !tokenOut.equals(this.tokenOut)) {
        return null;
      }

      log.info({ metrics, m: JSON.stringify(metrics) }, 'metrics logger class');

      const amountIn = CurrencyAmount.fromRawAmount(this.tokenIn, amount);
      for (const [low, high] of this.buckets) {
        const highAmount = this.parse(high, this.tokenIn);
        if (amountIn.lessThan(highAmount)) {
          const key = this.metricKey(low, high, bestQuoteType);
          metrics.putMetric(key, 1);

          return key;
        }
      }

      const key = this.metricKey(this.buckets[this.buckets.length - 1][1], this.INFINITY, bestQuoteType);
      metrics.putMetric(key, 1);

      return key;
    } catch (err) {
      log.info(
        {
          err,
          quoteTokenIn: tokenInAddress,
          metricTokenIn: this.tokenIn.wrapped.address,
          quoteTokenOut: tokenOutAddress,
          metricTokenOut: this.tokenOut.wrapped.address,
        },
        'Tried and failed to emit custom pair metric'
      );
      return null;
    }
  }

  private metricKey(low: string, high: string, bestQuoteType: QuoteType): string {
    return `${this.tokenIn.symbol!}-${this.tokenOut.symbol!}-${low}-${high}-${bestQuoteType}`;
  }

  public metricKeys(): string[][] {
    let bucketKeys: string[][] = [];
    for (const [low, high] of this.buckets) {
      bucketKeys.push([
        this.metricKey(low, high, QuoteType.CLASSIC),
        this.metricKey(low, high, QuoteType.RFQ),
        this.metricKey(low, high, QuoteType.SYNTHETIC),
      ]);
    }

    const highest = this.buckets[this.buckets.length - 1][1];

    bucketKeys.push([
      this.metricKey(highest, this.INFINITY, QuoteType.CLASSIC),
      this.metricKey(highest, this.INFINITY, QuoteType.RFQ),
      this.metricKey(highest, this.INFINITY, QuoteType.SYNTHETIC),
    ]);

    return bucketKeys;
  }

  private parse(value: string, currency: Currency): CurrencyAmount<Currency> {
    const typedValueParsed = parseUnits(value, currency.decimals).toString();
    log.info(`parsed value: ${typedValueParsed}`);
    return CurrencyAmount.fromRawAmount(currency, typedValueParsed);
  }
}

export const trackedPairs: MetricPair[] = [
  new MetricPair(1, Ether.onChain(1), USDC, [
    ['0', '0.05'],
    ['0.05', '0.5'],
    ['0.5', '2.5'],
    ['2.5', '10'],
    ['10', '50'],
    ['50', '250'],
  ]),
  new MetricPair(1, WETH9[1], USDC, [
    ['0', '0.05'],
    ['0.05', '0.5'],
    ['0.5', '2.5'],
    ['2.5', '10'],
    ['10', '50'],
    ['50', '250'],
  ]),
  new MetricPair(1, USDC, Ether.onChain(1), [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, USDC, WETH9[1], [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, USDT_MAINNET, Ether.onChain(1), [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, USDT_MAINNET, WETH9[1], [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, Ether.onChain(1), USDT_MAINNET, [
    ['0', '0.05'],
    ['0.05', '0.5'],
    ['0.5', '2.5'],
    ['2.5', '10'],
    ['10', '50'],
    ['50', '250'],
  ]),
  new MetricPair(1, WETH9[1], USDT_MAINNET, [
    ['0', '0.05'],
    ['0.05', '0.5'],
    ['0.5', '2.5'],
    ['2.5', '10'],
    ['10', '50'],
    ['50', '250'],
  ]),
  new MetricPair(1, USDC, USDT_MAINNET, [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, Ether.onChain(1), WBTC_MAINNET, [
    ['0', '0.05'],
    ['0.05', '0.5'],
    ['0.5', '2.5'],
    ['2.5', '10'],
    ['10', '50'],
    ['50', '250'],
  ]),
  new MetricPair(1, WETH9[1], WBTC_MAINNET, [
    ['0', '0.05'],
    ['0.05', '0.5'],
    ['0.5', '2.5'],
    ['2.5', '10'],
    ['10', '50'],
    ['50', '250'],
  ]),
  new MetricPair(1, WBTC_MAINNET, Ether.onChain(1), [
    ['0', '0.003'],
    ['0.003', '0.03'],
    ['0.03', '0.15'],
    ['0.15', '0.6'],
    ['0.6', '3'],
    ['3', '15'],
  ]),
  new MetricPair(1, WBTC_MAINNET, WETH9[1], [
    ['0', '0.003'],
    ['0.003', '0.03'],
    ['0.03', '0.15'],
    ['0.15', '0.6'],
    ['0.6', '3'],
    ['3', '15'],
  ]),
  new MetricPair(1, USDC, DAI_MAINNET, [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, DAI_MAINNET, USDC, [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
];

export const emitUniswapXPairMetricIfTracking = async (
  tokenFetcher: TokenFetcher,
  tokenInAddress: string,
  tokenOutAddress: string,
  amountIn: BigNumber,
  bestQuoteType: QuoteType,
  tradeType: TradeType
) => {
  if (tradeType == TradeType.EXACT_OUTPUT) {
    return;
  }

  for (const metricPair of trackedPairs) {
    const emitted = await metricPair.emitMetricIfValid(
      tokenFetcher,
      tokenInAddress,
      tokenOutAddress,
      amountIn.toString(),
      bestQuoteType
    );
    if (emitted) {
      log.info(`custom pair tracking metric emitted for ${emitted}`);
      return;
    }
  }
};
