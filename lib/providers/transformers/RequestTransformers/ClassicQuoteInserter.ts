import { Protocol } from '@uniswap/router-sdk';
import Logger from 'bunyan';

import { QuoteRequest, requestInfoEquals } from '../../../entities';
import { ClassicRequest } from '../../../entities/request/ClassicRequest';
import { RequestByRoutingType, RoutingType } from '../../../entities/request/index';
import { RequestTransformer } from '..';

/*
 * Adds a synthetic classic request if none given to compare against UniswapX RFQ quotes
 */
export class ClassicQuoteInserter implements RequestTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'ClassicQuoteInserter' });
  }

  transform(requests: QuoteRequest[]): QuoteRequest[] {
    const requestByRoutingType: RequestByRoutingType = {};
    requests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    const dutchLimitRequest = requestByRoutingType[RoutingType.DUTCH_LIMIT];
    if (!dutchLimitRequest) {
      this.log.info('UniswapX not requested, skipping transformer');
      return requests;
    }

    // theres already a classic request so we dont need to add one
    if (requestByRoutingType[RoutingType.CLASSIC]) {
      const classicRequest = requestByRoutingType[RoutingType.CLASSIC];
      if (requestInfoEquals(classicRequest.info, dutchLimitRequest.info)) {
        return requests;
      }
    }

    const classicRequest = new ClassicRequest(dutchLimitRequest.info, {
      protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
    });
    this.log.info({ classicRequest });
    return [...requests, classicRequest];
  }
}
