import Logger from 'bunyan';

import { QuoteRequest } from '../entities/QuoteRequest';
import { QuoteResponse } from '../entities/QuoteResponse';
import { DutchLimitQuote } from '../entities/quotes';
import { RoutingType } from '../entities/routing';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;
  private log: Logger;

  constructor(_log: Logger, private routingApiUrl: string) {
    this.log = _log.child({ quoter: 'RfqQuoter' });
  }

  async quote(params: QuoteRequest): Promise<QuoteResponse> {
    this.log.info(params, 'quoteRequest');
    this.log.info(this.routingApiUrl, 'routingApiUrl');
    return new QuoteResponse(
      RoutingType.DUTCH_LIMIT,
      DutchLimitQuote.fromResponseBody({
        chainId: 1,
        requestId: '0x123',
        tokenIn: 'tokenIn',
        amountIn: '1',
        tokenOut: 'tokenOut',
        amountOut: '2',
        offerer: 'offerer',
      })
    );
  }
}
