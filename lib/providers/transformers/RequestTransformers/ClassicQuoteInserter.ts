import { Protocol } from '@uniswap/router-sdk';
import Logger from 'bunyan';

import { RequestTransformer } from '..';
import { DutchLimitRequest, RequestsByRoutingType } from '../../../entities';
import { ClassicRequest } from '../../../entities/request/ClassicRequest';
import { RoutingType } from '../../../util/types';

/*
 * Adds a synthetic classic request if none given to compare against UniswapX RFQ quotes
 */
export class ClassicQuoteInserter implements RequestTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ transformer: 'ClassicQuoteInserter' });
  }

  transform(requests: RequestsByRoutingType) {
    const dutchLimitRequest = requests[RoutingType.DUTCH_LIMIT].original as DutchLimitRequest;

    const classicRequest = new ClassicRequest(dutchLimitRequest.info, {
      protocols: [Protocol.MIXED, Protocol.V2, Protocol.V3],
    });
    this.log.info({ classicRequest: classicRequest.info }, 'Adding synthetic classic request');
    requests.CLASSIC.synthetic = classicRequest;
  }
}
