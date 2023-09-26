import { Unit } from 'aws-embedded-metrics';
import NodeCache from 'node-cache';
import axios from '../providers/quoters/helpers';
import { log } from '../util/log';
import { metrics } from '../util/metrics';

export enum PortionType {
  Flat = 'flat',
  Regressive = 'regressive',
}

export interface Portion {
  readonly bips: number;
  readonly receiver: string;
  readonly type: PortionType;
}

export interface GetPortionResponse {
  readonly hasPortion: true;
  readonly portion: Portion;
}

export interface GetNoPortionResponse {
  readonly hasPortion: false;
}

export type AllPortionResponse = GetPortionResponse | GetNoPortionResponse

export const GET_NO_PORTION_RESPONSE: GetNoPortionResponse = { hasPortion: false }

export class PortionFetcher {
  private PORTION_CACHE_KEY = (
    tokenInChainId: number,
    tokenOutChainId: number,
    tokenInAddress: string,
    tokenOutAddress: string
  ) => `PortionFetcher-${tokenInChainId}-${tokenOutChainId}-${tokenInAddress}-${tokenOutAddress}`;
  // single cache acting as both positive cache and negative cache,
  // for load reduction against portion service
  private portionCache = new NodeCache({ stdTTL: 600 });

  private getPortionFullPath = `${this.portionApiUrl}/portion`;
  private portionServiceInstance = axios.create({
    baseURL: this.getPortionFullPath,
    // TODO: use short timeouts
    // timeout: 100, // short response timeout
    // signal: AbortSignal.timeout(100), // short connection timeout
  });

  constructor(private portionApiUrl: string) {}

  async getPortion(
    tokenInChainId: number,
    tokenOutChainId: number,
    tokenInAddress: string,
    tokenOutAddress: string
  ): Promise<AllPortionResponse> {
    metrics.putMetric(`PortionFetcherRequest`, 1);

    // we check PORTION_FLAG for every request, so that the update to the lambda env var gets reflected
    // in real time
    if (process.env.PORTION_FLAG !== 'true') {
      metrics.putMetric(`PortionFetcherFlagDisabled`, 1);
      return GET_NO_PORTION_RESPONSE;
    }

    const portionFromCache = this.portionCache.get<AllPortionResponse>(
      this.PORTION_CACHE_KEY(tokenInChainId, tokenOutChainId, tokenInAddress, tokenOutAddress)
    );

    if (portionFromCache) {
      metrics.putMetric(`PortionFetcherCacheHit`, 1);
      return portionFromCache;
    }

    try {
      const beforeGetPortion = Date.now();
      const portionResponse = await this.portionServiceInstance.get<AllPortionResponse>(this.getPortionFullPath, {
        params: {
          tokenInChainId: tokenInChainId,
          tokenOutChainId: tokenOutChainId,
          tokenInAddress: tokenInAddress,
          tokenOutAddress: tokenOutAddress,
        },
      });

      metrics.putMetric(`Latency-GetPortion`, Date.now() - beforeGetPortion, Unit.Milliseconds);
      metrics.putMetric(`PortionFetcherSuccess`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      this.portionCache.set<AllPortionResponse>(
        this.PORTION_CACHE_KEY(tokenInChainId, tokenOutChainId, tokenInAddress, tokenOutAddress),
        portionResponse.data
      );

      return portionResponse.data;
    } catch (e) {
      log.error({ e }, 'PortionFetcherErr');
      metrics.putMetric(`PortionFetcherErr`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      return GET_NO_PORTION_RESPONSE;
    }
  }
}
