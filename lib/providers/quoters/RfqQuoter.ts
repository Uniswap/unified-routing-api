import { TradeType } from '@uniswap/sdk-core';
import axios from 'axios';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';

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
      this.log.error(`Invalid routing config type: ${request.routingType}`);
      return null;
    }
    if (request.info.type === TradeType.EXACT_OUTPUT) {
      this.log.error(`Invalid trade type: ${request.info.type}`);
      return null;
    }

    const offerer = request.config.offerer;
    const requests = [
      axios.post(`${this.rfqUrl}quote`, {
        chainId: request.info.tokenInChainId,
        tokenIn: request.info.tokenIn,
        amountIn: request.info.amount.toString(),
        tokenOut: request.info.tokenOut,
        offerer: offerer,
      }),
      axios.get(`${this.serviceUrl}dutch-auction/nonce?address=${offerer}`),
    ];

    let quote: Quote | null = null;
    await Promise.allSettled(requests).then((results) => {
      if (results[0].status == 'rejected') {
        this.log.error(results[0].reason, 'RfqQuoterErr');
      } else if (results[1].status == 'rejected') {
        this.log.debug(results[1].reason, 'RfqQuoterErr: GET nonce failed');
        quote = DutchLimitQuote.fromResponseBody(request, results[0].value.data);
      } else {
        quote = DutchLimitQuote.fromResponseBody(
          request,
          results[0].value.data,
          BigNumber.from(results[1].value.data.nonce).add(1).toString()
        );
      }
    });
    return quote;
  }
}
