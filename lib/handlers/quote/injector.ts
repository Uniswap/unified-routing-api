import { setGlobalLogger } from '@uniswap/smart-order-router';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as bunyan, default as Logger } from 'bunyan';

import { QuoteRequestBodyJSON, RoutingType } from '../../entities';
import { Quoter, RfqQuoter, RoutingApiQuoter } from '../../providers/quoters';
import {
  CompoundTransformer,
  GoudaOrderSizeFilter,
  OnlyConfiguredQuotersFilter,
  QuoteTransformer,
} from '../../providers/transformers';
import { SyntheticGoudaTransformer } from '../../providers/transformers/SyntheticUniswapXTransformer';
import { checkDefined } from '../../util/preconditions';
import { ApiInjector, ApiRInj } from '../base/api-handler';

export type QuoterByRoutingType = {
  [key in RoutingType]?: Quoter[];
};

export interface ContainerInjected {
  quoters: QuoterByRoutingType;
  quoteTransformer: QuoteTransformer;
}

export class QuoteInjector extends ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const log: Logger = bunyan.createLogger({
      name: this.injectorName,
      serializers: bunyan.stdSerializers,
      level: bunyan.INFO,
    });

    const paramApiUrl = checkDefined(process.env.PARAMETERIZATION_API_URL, 'PARAMETERIZATION_API_URL is not defined');
    const routingApiUrl = checkDefined(process.env.ROUTING_API_URL, 'ROUTING_API_URL is not defined');

    // TODO: consider instantiating one quoter per routing type instead
    return {
      quoters: {
        [RoutingType.DUTCH_LIMIT]: [new RfqQuoter(log, paramApiUrl)],
        [RoutingType.CLASSIC]: [new RoutingApiQuoter(log, routingApiUrl)],
      },
      quoteTransformer: new CompoundTransformer([
        new SyntheticGoudaTransformer(log),
        new GoudaOrderSizeFilter(log),
        new OnlyConfiguredQuotersFilter(log),
      ]),
    };
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    requestBody: QuoteRequestBodyJSON,
    _requestQueryParams: void,
    _event: APIGatewayProxyEvent,
    context: Context,
    log: Logger
  ): Promise<ApiRInj> {
    const requestId = context.awsRequestId;

    log = log.child({
      serializers: bunyan.stdSerializers,
      requestBody,
      requestId,
    });
    setGlobalLogger(log);

    return {
      log,
      requestId,
    };
  }
}
