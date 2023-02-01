import Logger from 'bunyan';

import { QuoteRequest } from '../entities/QuoteRequest';
import { QuoteResponse } from '../entities/QuoteResponse';
import { DutchLimitQuote } from '../entities/quotes';
import { RoutingConfig, RoutingType } from '../entities/routing';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;
  private log: Logger;

  constructor(_log: Logger, private routingApiUrl: string) {
    this.log = _log.child({ quoter: 'RfqQuoter' });
  }

  async quote(params: QuoteRequest, _config: RoutingConfig): Promise<QuoteResponse> {
    this.log.info(params, 'quoteRequest');
    this.log.info(this.routingApiUrl, 'routingApiUrl');
    return new QuoteResponse(
      RoutingType.DUTCH_LIMIT,
      DutchLimitQuote.fromResponseBody({
        chainId: 1,
        requestId: 'requestId',
        tokenIn: '0x0000000000000000000000000000000000000000',
        amountIn: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        tokenOut: '0x0000000000000000000000000000000000000000',
        amountOut: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        offerer: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      })
    );
  }
}
