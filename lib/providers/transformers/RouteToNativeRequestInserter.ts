import { Protocol, WRAPPED_NATIVE_CURRENCY } from '@uniswap/router-sdk';
import Logger from 'bunyan';

import { ClassicRequest, QuoteRequest, RoutingType } from '../../entities';
import { QuoteRequestTransformer } from '.';

// filters out any UniswapX orders which are too small to be worth filling
// NOTE: there must also be a routing-api quote response for this filter to function
// as that is where we get the gas cost information from
export class RouteToNativeRequestInserter implements QuoteRequestTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'RouteToNativeRequestInserter' });
  }

  async transform(originalRequests: QuoteRequest[], currentRequests: QuoteRequest[]): Promise<QuoteRequest[]> {
    const requestByRoutingType: { [key in RoutingType]?: QuoteRequest } = {};
    originalRequests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    const dutchLimitRequest = requestByRoutingType[RoutingType.DUTCH_LIMIT];
    if (!dutchLimitRequest) {
      this.log.info('UniswapX not requested, skipping transformer');
      return currentRequests;
    }

    const routeToNativeRequest = new ClassicRequest(
      {
        ...dutchLimitRequest.info,
        tokenIn: dutchLimitRequest.info.tokenOut,
        tokenOut: WRAPPED_NATIVE_CURRENCY[dutchLimitRequest.info.tokenOutChainId],
      },
      {
        protocols: [Protocol.V3, Protocol.V2, Protocol.MIXED],
      }
    );

    return [routeToNativeRequest, ...currentRequests];
  }
}
