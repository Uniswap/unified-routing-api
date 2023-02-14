import axios from 'axios';
import Logger from 'bunyan';

import { ZERO_ADDRESS } from '../../constants';
import { DutchLimitQuote, DutchLimitRequest, Quote, RoutingType } from '../../entities';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;
  private log: Logger;

  constructor(_log: Logger, private rfqUrl: string, private serviceUrl: string) {
    this.log = _log.child({ quoter: 'RfqQuoter' });
  }

  async quote(request: DutchLimitRequest): Promise<Quote | null> {
    this.log.info(request, 'quoteRequest');
    this.log.info(this.rfqUrl, 'rfqUrl');

    if (request.routingType !== RoutingType.DUTCH_LIMIT) {
      throw new Error(`Invalid routing config type: ${request.routingType}`);
    }

    const offerer = request.config.offerer;
    try {
      const requests = [
        axios.post(`${this.rfqUrl}quote`, {
          chainId: request.info.tokenInChainId,
          tokenIn: request.info.tokenIn,
          amountIn: request.info.amount.toString(),
          tokenOut: request.info.tokenOut,
          offerer: offerer,
        }),
      ];

      if (request.config.offerer != ZERO_ADDRESS) {
        requests.push(axios.get(`${this.serviceUrl}dutch-auction/nonce?address=${offerer}`));
      }

      const [response, nonceResponse] = await Promise.all(requests);
      return DutchLimitQuote.fromResponseBody(request, response.data, nonceResponse?.data?.nonce);
    } catch (e) {
      this.log.error(e, 'RfqQuoterErr');
      return null;
    }
  }
}
