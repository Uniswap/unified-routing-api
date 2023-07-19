import { Currency, CurrencyAmount, Ether, WETH9 } from '@uniswap/sdk-core';
import { USDC_MAINNET as USDC, USDT_MAINNET } from '@uniswap/smart-order-router';
import { StorageResolution, Unit } from 'aws-embedded-metrics';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { TokenFetcher } from '../fetchers/TokenFetcher';
import { log } from './log';

export interface IMetrics {
  putMetric(key: string, value: number, unit?: Unit | string, storageResolution?: StorageResolution | number): void;
}

export class NullMetrics implements IMetrics {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  putMetric(_key: string, _value: number, _unit?: Unit | string, _storageResolution?: StorageResolution | number) {}
}

export let metrics: IMetrics = new NullMetrics();

export const setGlobalMetrics = (_metric: IMetrics) => {
  metrics = _metric;
};

export enum QuoteType {
  CLASSIC = 'CLASSIC',
  SYNTHETIC = 'SYNTHETIC',
  RFQ = 'RFQ',
}

export class MetricPair {
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
  ): Promise<boolean> {
    try {
      const tokenIn = await tokenFetcher.resolveToken(this.chainId, tokenInAddress);
      const tokenOut = await tokenFetcher.resolveToken(this.chainId, tokenOutAddress);

      if (!tokenIn.equals(this.tokenIn) || !tokenOut.equals(this.tokenOut)) {
        log.info(`${tokenIn.symbol} != ${this.tokenIn} OR ${tokenOut.symbol} != ${this.tokenOut}`)
        return false;
      }

      const amountIn = this.parse(amount, this.tokenIn);
      for (const [low, high] of this.buckets) {
        if (amountIn.lessThan(this.parse(high, this.tokenIn))) {
          log.info('emitting ' + this.metricKey(low, high, bestQuoteType))
          metrics.putMetric(this.metricKey(low, high, bestQuoteType), 1);
          return true;
        }
      }

      metrics.putMetric(this.metricKey(this.buckets[this.buckets.length - 1][1], 'X', bestQuoteType), 1);
      return true;
    } catch (err) {
      return false;
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
      this.metricKey(highest, 'X', QuoteType.CLASSIC),
      this.metricKey(highest, 'X', QuoteType.RFQ),
      this.metricKey(highest, 'X', QuoteType.SYNTHETIC),
    ]);

    return bucketKeys;
  }

  private parse(value: string, currency: Currency): CurrencyAmount<Currency> {
    const typedValueParsed = parseUnits(value, currency.decimals).toString();
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
  new MetricPair(1, USDT_MAINNET, Ether.onChain(1), [
    ['0', '100'],
    ['100', '1000'],
    ['1000', '5000'],
    ['5000', '20000'],
    ['20000', '100000'],
    ['100000', '500000'],
  ]),
  new MetricPair(1, WETH9[1], USDC, [
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
  new MetricPair(1, USDC, Ether.onChain(1), [
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
  bestQuoteType: QuoteType
) => {
  for (const metricPair of trackedPairs) {
    if (
      await metricPair.emitMetricIfValid(
        tokenFetcher,
        tokenInAddress,
        tokenOutAddress,
        amountIn.toString(),
        bestQuoteType
      )
    ) {
      return;
    }
  }
};
