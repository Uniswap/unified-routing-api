import { Unit } from 'aws-embedded-metrics';
import * as http from 'http';
import * as https from 'https';
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
  readonly hasPortion: boolean;
  readonly portion?: Portion;
}

export const GET_NO_PORTION_RESPONSE: GetPortionResponse = { hasPortion: false };
export const DEFAULT_POSITIVE_CACHE_ENTRY_TTL = 600; // 10 minutes
export const DEFAULT_NEGATIVE_CACHE_ENTRY_TTL = 600; // 10 minute

export class PortionFetcher {
  private PORTION_CACHE_KEY = (
    tokenInChainId: number,
    tokenInAddress: string,
    tokenOutChainId: number,
    tokenOutAddress: string
  ) =>
    `PortionFetcher-${tokenInChainId}-${tokenInAddress.toLowerCase()}-${tokenOutChainId}-${tokenOutAddress.toLowerCase()}`;

  private getPortionFullPath = `${this.portionApiUrl}/portion`;
  private portionServiceInstance = axios.create({
    baseURL: this.portionApiUrl,
    // keep connections alive,
    // maxSockets default is Infinity, so Infinity is read as 50 sockets
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
  });

  constructor(
    private portionApiUrl: string,
    private portionCache: NodeCache,
    private positiveCacheEntryTtl = DEFAULT_POSITIVE_CACHE_ENTRY_TTL,
    private negativeCacheEntryTtl = DEFAULT_NEGATIVE_CACHE_ENTRY_TTL
  ) {}

  async getPortion(
    tokenInChainId: number,
    tokenInAddress: string,
    tokenOutChainId: number,
    tokenOutAddress: string
  ): Promise<GetPortionResponse> {
    metrics.putMetric(`PortionFetcherRequest`, 1);

    // we check PORTION_FLAG for every request, so that the update to the lambda env var gets reflected
    // in real time
    if (process.env.PORTION_FLAG !== 'true') {
      metrics.putMetric(`PortionFetcherFlagDisabled`, 1);
      return GET_NO_PORTION_RESPONSE;
    }

    const portionFromCache = this.portionCache.get<GetPortionResponse>(
      this.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress)
    );

    if (portionFromCache) {
      metrics.putMetric(`PortionFetcherCacheHit`, 1);
      return portionFromCache;
    }

    try {
      const beforeGetPortion = Date.now();
      const portionResponse = await this.portionServiceInstance.get<GetPortionResponse>(this.getPortionFullPath, {
        params: {
          tokenInChainId: tokenInChainId,
          tokenInAddress: tokenInAddress,
          tokenOutChainId: tokenOutChainId,
          tokenOutAddress: tokenOutAddress,
        },
      });

      metrics.putMetric(`Latency-GetPortion`, Date.now() - beforeGetPortion, Unit.Milliseconds);
      metrics.putMetric(`PortionFetcherSuccess`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      this.portionCache.set<GetPortionResponse>(
        this.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress),
        portionResponse.data,
        portionResponse.data.hasPortion ? this.positiveCacheEntryTtl : this.negativeCacheEntryTtl
      );

      return portionResponse.data;
    } catch (e) {
      log.error({ e }, 'PortionFetcherErr');
      metrics.putMetric(`PortionFetcherErr`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      this.portionCache.set<GetPortionResponse>(
        this.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress),
        GET_NO_PORTION_RESPONSE,
        this.negativeCacheEntryTtl
      );

      return GET_NO_PORTION_RESPONSE;
    }
  }
}
