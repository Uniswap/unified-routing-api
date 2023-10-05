import { Unit } from 'aws-embedded-metrics';
import * as http from 'http';
import * as https from 'https';
import NodeCache from 'node-cache';
import {
  BACKEND_CONTROLLED_ENABLE_PORTION,
  DEFAULT_NEGATIVE_CACHE_ENTRY_TTL,
  DEFAULT_POSITIVE_CACHE_ENTRY_TTL,
} from '../constants';
import axios from '../providers/quoters/helpers';
import { log } from '../util/log';
import { metrics } from '../util/metrics';

export enum PortionType {
  Flat = 'flat',
  Regressive = 'regressive',
}

export interface Portion {
  readonly bips: number;
  readonly recipient: string;
  readonly type: PortionType;
}

export interface GetPortionResponse {
  readonly hasPortion: boolean;
  readonly portion?: Portion;
}

export const GET_NO_PORTION_RESPONSE: GetPortionResponse = { hasPortion: false, portion: undefined };

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

    // we check ENABLE_PORTION for every request, so that the update to the lambda env var gets reflected
    // in real time
    if (!BACKEND_CONTROLLED_ENABLE_PORTION(process.env.ENABLE_PORTION)) {
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

      // TODO: ROUTE-96 - add dashboard for URA <-> portion integration monitoring
      metrics.putMetric(`Latency-GetPortion`, Date.now() - beforeGetPortion, Unit.Milliseconds);
      metrics.putMetric(`PortionFetcherSuccess`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      this.portionCache.set<GetPortionResponse>(
        this.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress),
        portionResponse.data,
        portionResponse.data.portion ? this.positiveCacheEntryTtl : this.negativeCacheEntryTtl
      );

      return portionResponse.data;
    } catch (e) {
      // TODO: ROUTE-96 - add alerting for URA <-> portion integration monitoring
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
