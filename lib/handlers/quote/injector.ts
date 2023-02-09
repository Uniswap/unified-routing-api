import { setGlobalLogger } from '@uniswap/smart-order-router';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as bunyan, default as Logger } from 'bunyan';
import { ethers } from 'ethers';

import { ROUTING_API_CHAINS } from '../../config/chains';
import { QuoteRequestBodyJSON, RoutingType } from '../../entities';
import { Quoter, RfqQuoter, RoutingApiQuoter } from '../../providers/quoters';
import {
  CompoundTransformer,
  OnlyConfiguredQuotersFilter,
  QuoteTransformer,
  UniswapXOrderSizeFilter,
} from '../../providers/transformers';
import { SyntheticUniswapXTransformer } from '../../providers/transformers/SyntheticUniswapXTransformer';
import { checkDefined } from '../../util/preconditions';
import { ApiInjector, ApiRInj } from '../base/api-handler';

export type QuoterByRoutingType = {
  [key in RoutingType]?: Quoter[];
};

export type ProviderByChain = { [chainId: number]: ethers.providers.JsonRpcProvider };

export interface ContainerInjected {
  quoters: QuoterByRoutingType;
  quoteTransformer: QuoteTransformer;
  providerByChain: ProviderByChain;
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

    const providerByChain: ProviderByChain = {};
    ROUTING_API_CHAINS.forEach((chainId) => {
      const rpc = checkDefined(process.env[`WEB3_RPC_${chainId}`], `WEB3_RPC_${chainId} is not defined`);
      const provider = new ethers.providers.JsonRpcProvider({ url: rpc, timeout: 5000 }, chainId);
      providerByChain[chainId] = provider;
    });

    // TODO: consider instantiating one quoter per routing type instead
    return {
      quoters: {
        [RoutingType.DUTCH_LIMIT]: [new RfqQuoter(log, paramApiUrl)],
        [RoutingType.CLASSIC]: [new RoutingApiQuoter(log, routingApiUrl)],
      },
      // transformer ordering matters! transformers should generally come before filters
      quoteTransformer: new CompoundTransformer([
        new SyntheticUniswapXTransformer(log),
        new UniswapXOrderSizeFilter(log),
        new OnlyConfiguredQuotersFilter(log),
      ]),
      providerByChain: providerByChain,
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
