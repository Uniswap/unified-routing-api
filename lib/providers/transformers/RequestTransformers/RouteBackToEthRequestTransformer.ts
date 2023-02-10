import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { parseEther } from 'ethers/lib/utils';

import { RequestTransformer } from '..';
import { QuoteRequest } from '../../../entities';
import { ClassicRequest } from '../../../entities/request/ClassicRequest';
import { DutchLimitRequest, RequestByRoutingType, RoutingType } from '../../../entities/request/index';

/*
 * adds a synthetic classic request to check if the output token has route back to ETH
 */
export class RouteBackToEthTransformer implements RequestTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'RouteBackToEthTransformer' });
  }

  transform(requests: QuoteRequest[]): QuoteRequest[] {
    const requestByRoutingType: RequestByRoutingType = {};
    requests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    const dlRequest = requestByRoutingType[RoutingType.DUTCH_LIMIT] as DutchLimitRequest;
    if (!dlRequest) {
      this.log.info('UniswapX not requested, skipping transformer');
      return requests;
    }

    const synthClassicRequest = new ClassicRequest(
      {
        ...dlRequest.info,
        type: TradeType.EXACT_OUTPUT,
        tokenIn: dlRequest.info.tokenOut,
        amount: parseEther('1'),
        tokenOut: WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(dlRequest.info.tokenOutChainId)].address,
      },
      {
        protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
      }
    );
    this.log.info({ synthClassicRequest: synthClassicRequest });
    return [...requests, synthClassicRequest];
  }
}
