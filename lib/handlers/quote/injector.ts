import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as bunyan, default as Logger } from 'bunyan';

import { ChainId } from '@uniswap/sdk-core';
import { MetricsLogger } from 'aws-embedded-metrics';
import { providers } from 'ethers';
import NodeCache from 'node-cache';
import { ChainConfigManager } from '../../config/ChainConfigManager';
import { RoutingType } from '../../constants';
import { QuoteRequestBodyJSON } from '../../entities';
import { Permit2Fetcher } from '../../fetchers/Permit2Fetcher';
import { PortionFetcher } from '../../fetchers/PortionFetcher';
import { TokenFetcher } from '../../fetchers/TokenFetcher';
import {
  DisabledSyntheticStatusProvider,
  Quoter,
  RfqQuoter,
  RoutingApiQuoter,
  SyntheticStatusProvider,
} from '../../providers';
import { setGlobalLogger } from '../../util/log';
import { setGlobalMetrics } from '../../util/metrics';
import { setGlobalForcePortion } from '../../util/portion';
import { checkDefined } from '../../util/preconditions';
import { ApiInjector, ApiRInj } from '../base/api-handler';

export type QuoterByRoutingType = {
  [key in RoutingType]?: Quoter;
};

export interface ContainerInjected {
  quoters: QuoterByRoutingType;
  tokenFetcher: TokenFetcher;
  portionFetcher: PortionFetcher;
  permit2Fetcher: Permit2Fetcher;
  syntheticStatusProvider: SyntheticStatusProvider;
  chainIdRpcMap: Map<ChainId, providers.StaticJsonRpcProvider>;
}

export class QuoteInjector extends ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const log: Logger = bunyan.createLogger({
      name: this.injectorName,
      serializers: bunyan.stdSerializers,
      level: bunyan.INFO,
    });
    setGlobalLogger(log);

    const paramApiUrl = checkDefined(process.env.PARAMETERIZATION_API_URL, 'PARAMETERIZATION_API_URL is not defined');
    const routingApiUrl = checkDefined(process.env.ROUTING_API_URL, 'ROUTING_API_URL is not defined');
    const routingApiKey = checkDefined(process.env.ROUTING_API_KEY, 'ROUTING_API_KEY is not defined');
    const paramApiKey = checkDefined(process.env.PARAMETERIZATION_API_KEY, 'PARAMETERIZATION_API_KEY is not defined');
    const serviceUrl = checkDefined(process.env.SERVICE_URL, 'SERVICE_URL is not defined');
    const portionApiUrl = checkDefined(process.env.PORTION_API_URL, 'PORTION_API_URL is not defined');

    const chainIdRpcMap = new Map<ChainId, providers.StaticJsonRpcProvider>();
    ChainConfigManager.getChainIdsByRoutingType(RoutingType.CLASSIC).forEach((chainId) => {
      const rpcUrl = checkDefined(process.env[`RPC_${chainId}`], `RPC_${chainId} is not defined`);
      const provider = new providers.StaticJsonRpcProvider(rpcUrl, chainId); // specify chainId to avoid detecctNetwork() call on initialization
      chainIdRpcMap.set(chainId, provider);
    });

    // single cache acting as both positive cache and negative cache,
    // for load reduction against portion service
    const portionCache = new NodeCache({ stdTTL: 600 });
    const tokenFetcher = new TokenFetcher();
    const portionFetcher = new PortionFetcher(portionApiUrl, portionCache);
    const rfqQuoter = new RfqQuoter(paramApiUrl, serviceUrl, paramApiKey);

    return {
      quoters: {
        [RoutingType.DUTCH_V2]: rfqQuoter,
        [RoutingType.DUTCH_LIMIT]: rfqQuoter,
        [RoutingType.CLASSIC]: new RoutingApiQuoter(routingApiUrl, routingApiKey),
      },
      chainIdRpcMap,
      tokenFetcher: tokenFetcher,
      portionFetcher: portionFetcher,
      permit2Fetcher: new Permit2Fetcher(chainIdRpcMap),
      syntheticStatusProvider: new DisabledSyntheticStatusProvider(),
    };
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    requestBody: QuoteRequestBodyJSON,
    _requestQueryParams: void,
    event: APIGatewayProxyEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<ApiRInj> {
    const requestId = context.awsRequestId;

    log = log.child({
      serializers: bunyan.stdSerializers,
      requestBody: requestBody,
      requestId,
    });

    setGlobalForcePortion(
      process.env.FORCE_PORTION_STRING !== undefined &&
        event.headers['X-UNISWAP-FORCE-PORTION-SECRET'] === process.env.FORCE_PORTION_STRING
    );

    setGlobalLogger(log);

    metrics.setNamespace('Uniswap');
    metrics.setDimensions({ Service: 'UnifiedRoutingAPI' });
    setGlobalMetrics(metrics);

    return {
      log,
      requestId,
      metrics,
    };
  }
}
