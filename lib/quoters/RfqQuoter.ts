import axios from 'axios';
import Logger from 'bunyan';

import { QuoteRequest } from '../entities/QuoteRequest';
import { QuoteResponse } from '../entities/QuoteResponse';
import { DutchLimitQuote } from '../entities/quotes';
import { DutchLimitConfig, RoutingType } from '../entities/routing';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;
  private log: Logger;

  constructor(_log: Logger, private rfqUrl: string) {
    this.log = _log.child({ quoter: 'RfqQuoter' });
  }

  async quote(params: QuoteRequest, config: DutchLimitConfig): Promise<QuoteResponse> {
    this.log.info(params, 'quoteRequest');
    this.log.info(this.rfqUrl, 'rfqUrl');

    if (config.routingType !== RoutingType.DUTCH_LIMIT) {
      throw new Error(`Invalid routing config type: ${config.routingType}`);
    }

    try {
      const response = await axios.post(`${this.rfqUrl}quote`, {
        chainId: params.tokenInChainId,
        tokenIn: params.tokenIn,
        amountIn: params.amount.toString(),
        tokenOut: params.tokenOut,
        offerer: config.offerer,
      });
      return new QuoteResponse(
        RoutingType.DUTCH_LIMIT,
        DutchLimitQuote.fromResponseBodyAndConfig(config, response.data)
      );
    } catch (e) {
      this.log.error(e, 'RfqQuoterErr');
      throw e;
    }
  }
}
