import { Unit } from 'aws-embedded-metrics';
import * as http from 'http';
import * as https from 'https';
import NodeCache from 'node-cache';
import { DEFAULT_NEGATIVE_CACHE_ENTRY_TTL, DEFAULT_POSITIVE_CACHE_ENTRY_TTL, uraEnablePortion } from '../constants';
import { RequestSource } from '../entities';
import axios from '../providers/quoters/helpers';
import { log } from '../util/log';
import { metrics } from '../util/metrics';
import { forcePortion } from '../util/portion';

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
  public static PORTION_CACHE_KEY = (
    tokenInChainId: number,
    tokenInAddress: string,
    tokenOutChainId: number,
    tokenOutAddress: string,
    requestSource: RequestSource
  ) =>
    `PortionFetcher-${tokenInChainId}-${tokenInAddress.toLowerCase()}-${tokenOutChainId}-${tokenOutAddress.toLowerCase()}-${requestSource}`;

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
    tokenOutAddress: string,
    requestSource: RequestSource
  ): Promise<GetPortionResponse> {
    metrics.putMetric(`PortionFetcherRequest`, 1);

    // we check ENABLE_PORTION for every request, so that the update to the lambda env var gets reflected
    // in real time
    if (!uraEnablePortion()) {
      metrics.putMetric(`PortionFetcherFlagDisabled`, 1);
      return GET_NO_PORTION_RESPONSE;
    }

    // We bypass the cache if `forcePortion` is true.
    // We do it to avoid cache conflicts since `forcePortion` is only for testing purposes.
    const portionFromCache =
      !forcePortion &&
      this.portionCache.get<GetPortionResponse>(
        PortionFetcher.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress, requestSource)
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
          requestSource: requestSource
        },
      });

      // TODO: ROUTE-96 - add dashboard for URA <-> portion integration monitoring
      metrics.putMetric(`Latency-GetPortion`, Date.now() - beforeGetPortion, Unit.Milliseconds);
      metrics.putMetric(`PortionFetcherSuccess`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      // We bypass the cache if `forcePortion` is true.
      // We do it to avoid cache conflicts since `forcePortion` is only for testing purposes.
      if (!forcePortion) {
        this.portionCache.set<GetPortionResponse>(
          PortionFetcher.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress, requestSource),
          portionResponse.data,
          portionResponse.data.portion ? this.positiveCacheEntryTtl : this.negativeCacheEntryTtl
        );
      }

      return portionResponse.data;
    } catch (e) {
      // TODO: ROUTE-96 - add alerting for URA <-> portion integration monitoring
      log.error({ e }, 'PortionFetcherErr');
      metrics.putMetric(`PortionFetcherErr`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      return GET_NO_PORTION_RESPONSE;
    }
  }
}
