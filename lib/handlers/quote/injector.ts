import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as bunyan, default as Logger } from 'bunyan';

import { MetricsLogger } from 'aws-embedded-metrics';
import { RoutingType } from '../../constants';
import { QuoteRequestBodyJSON } from '../../entities';
import { TokenFetcher } from '../../fetchers/TokenFetcher';
import { Quoter, RfqQuoter, RoutingApiQuoter } from '../../providers/quoters';
import { setGlobalLogger } from '../../util/log';
import { setGlobalMetrics } from '../../util/metrics';
import { checkDefined } from '../../util/preconditions';
import { ApiInjector, ApiRInj } from '../base/api-handler';

export type QuoterByRoutingType = {
  [key in RoutingType]?: Quoter;
};

export interface ContainerInjected {
  quoters: QuoterByRoutingType;
  tokenFetcher: TokenFetcher;
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
    const serviceUrl = checkDefined(process.env.SERVICE_URL, 'SERVICE_URL is not defined');

    return {
      quoters: {
        [RoutingType.DUTCH_LIMIT]: new RfqQuoter(paramApiUrl, serviceUrl),
        [RoutingType.CLASSIC]: new RoutingApiQuoter(routingApiUrl),
      },
      tokenFetcher: new TokenFetcher(),
    };
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    requestBody: QuoteRequestBodyJSON,
    _requestQueryParams: void,
    _event: APIGatewayProxyEvent,
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
