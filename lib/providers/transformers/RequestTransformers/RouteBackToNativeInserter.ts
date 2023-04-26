import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import Logger from 'bunyan';
import { parseEther } from 'ethers/lib/utils';

import { RequestTransformer } from '..';
import { RoutingType } from '../../../constants';
import { QuoteRequest } from '../../../entities';
import { ClassicRequest } from '../../../entities/request/ClassicRequest';
import { DutchLimitRequest, RequestByRoutingType } from '../../../entities/request/index';

/*
 * adds a synthetic classic request to check if the output token has route back to ETH
 */
export class RouteBackToNativeInserter implements RequestTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'RouteBackToEthTransformer' });
  }

  transform(requests: QuoteRequest[]): QuoteRequest[] {
    const requestByRoutingType: RequestByRoutingType = {};
    requests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    const dlRequest = requestByRoutingType[RoutingType.DUTCH_LIMIT] as DutchLimitRequest;
    if (!dlRequest) {
      this.log.info('UniswapX not requested, skipping transformer');
      return requests;
    }

    const native = WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(dlRequest.info.tokenOutChainId)].address;
    if (dlRequest.info.tokenOut === native) {
      this.log.info('Original output token is (wrapped) native token, skipping transformer');
      return requests;
    }

    const synthClassicRequest = new ClassicRequest(
      {
        ...dlRequest.info,
        type: TradeType.EXACT_OUTPUT,
        tokenIn: dlRequest.info.tokenOut,
        amount: parseEther('1'),
        tokenOut: native,
      },
      {
        protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
      }
    );
    this.log.info({ synthClassicRequest: synthClassicRequest.info }, 'Adding synthetic back to native classic request');
    return [...requests, synthClassicRequest];
  }
}
