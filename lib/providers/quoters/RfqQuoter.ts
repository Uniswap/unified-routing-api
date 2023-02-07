import axios from 'axios';
import Logger from 'bunyan';

import { Quote, DutchLimitQuote, DutchLimitRequest, RoutingType } from '../../entities';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;
  private log: Logger;

  constructor(_log: Logger, private rfqUrl: string) {
    this.log = _log.child({ quoter: 'RfqQuoter' });
  }

  async quote(request: DutchLimitRequest): Promise<Quote | null> {
    this.log.info(request, 'quoteRequest');
    this.log.info(this.rfqUrl, 'rfqUrl');

    if (request.routingType !== RoutingType.DUTCH_LIMIT) {
      throw new Error(`Invalid routing config type: ${request.routingType}`);
    }

    try {
      const response = await axios.post(`${this.rfqUrl}quote`, {
        chainId: request.info.tokenInChainId,
        tokenIn: request.info.tokenIn,
        amountIn: request.info.amount.toString(),
        tokenOut: request.info.tokenOut,
        offerer: request.config.offerer,
      });
      return DutchLimitQuote.fromResponseBody(request, response.data);
    } catch (e) {
      this.log.error(e, 'RfqQuoterErr');
      return null;
    }
  }
}
