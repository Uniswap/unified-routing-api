import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';
import axios from './helpers';

import { NATIVE_ADDRESS, RoutingType } from '../../constants';
import { DutchLimitQuote, DutchLimitRequest, Quote } from '../../entities';
import { log as globalLog } from '../../util/log';
import { metrics } from '../../util/metrics';
import { Quoter, QuoterType } from './index';

const log = globalLog.child({ quoter: 'RfqQuoter' });

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;

  constructor(private rfqUrl: string, private serviceUrl: string) {}

  async quote(request: DutchLimitRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.DUTCH_LIMIT) {
      log.error(`Invalid routing config type: ${request.routingType}`);
      return null;
    }

    const offerer = request.config.offerer;
    const requests = [
      axios.post(`${this.rfqUrl}quote`, {
        tokenInChainId: request.info.tokenInChainId,
        tokenOutChainId: request.info.tokenOutChainId,
        tokenIn: mapNative(request.info.tokenIn, request.info.tokenInChainId),
        tokenOut: mapNative(request.info.tokenOut, request.info.tokenInChainId),
        amount: request.info.amount.toString(),
        offerer: offerer,
        requestId: request.info.requestId,
        type: TradeType[request.info.type],
      }),
      axios.get(`${this.serviceUrl}dutch-auction/nonce?address=${offerer}`),
    ];

    let quote: Quote | null = null;
    metrics.putMetric(`RfqQuoterRequest`, 1);
    await Promise.allSettled(requests).then((results) => {
      if (results[0].status == 'rejected') {
        log.error(results[0].reason, 'RfqQuoterErr');
        metrics.putMetric(`RfqQuoterRfqErr`, 1);
      } else if (results[1].status == 'rejected') {
        log.debug(results[1].reason, 'RfqQuoterErr: GET nonce failed');
        log.info(results[0].value.data, 'RfqQuoter: POST quote request success');
        metrics.putMetric(`RfqQuoterNonceErr`, 1);
        quote = DutchLimitQuote.fromResponseBody(request, results[0].value.data);
      } else {
        log.info(results[1].value.data, 'RfqQuoter: GET nonce success');
        log.info(results[0].value.data, 'RfqQuoter: POST quote request success');
        metrics.putMetric(`RfqQuoterSuccess`, 1);
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

function mapNative(token: string, chainId: number): string {
  if (token === NATIVE_ADDRESS) {
    const wrapped = WRAPPED_NATIVE_CURRENCY[ID_TO_CHAIN_ID(chainId)].address;
    return wrapped;
  }
  return token;
}
