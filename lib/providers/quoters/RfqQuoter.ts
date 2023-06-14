import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';
import axios from './helpers';

import { NATIVE_ADDRESS, RoutingType } from '../../constants';
import { DutchLimitQuote, DutchLimitRequest, Quote } from '../../entities';
import { PostQuoteResponseJoi } from '../../handlers/quote';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.GOUDA_RFQ;

  constructor(private rfqUrl: string, private serviceUrl: string, private paramApiKey: string) {}

  async quote(request: DutchLimitRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.DUTCH_LIMIT) {
      log.error(`Invalid routing config type: ${request.routingType}`);
      return null;
    }

    const offerer = request.config.offerer;
    const requests = [
      axios.post(
        `${this.rfqUrl}quote`,
        {
          tokenInChainId: request.info.tokenInChainId,
          tokenOutChainId: request.info.tokenOutChainId,
          tokenIn: mapNative(request.info.tokenIn, request.info.tokenInChainId),
          tokenOut: mapNative(request.info.tokenOut, request.info.tokenInChainId),
          amount: request.info.amount.toString(),
          offerer: offerer,
          requestId: request.info.requestId,
          type: TradeType[request.info.type],
        },
        { headers: { 'x-api-key': this.paramApiKey } }
      ),
      axios.get(`${this.serviceUrl}dutch-auction/nonce?address=${offerer}&chainId=${request.info.tokenInChainId}`), // should also work for cross-chain?
    ];

    let quote: Quote | null = null;
    metrics.putMetric(`RfqQuoterRequest`, 1);
    await Promise.allSettled(requests).then((results) => {
      if (results[0].status == 'rejected') {
        log.error(results[0].reason, 'RfqQuoterErr');
        metrics.putMetric(`RfqQuoterRfqErr`, 1);
      } else {
        const response = results[0].value.data;
        log.info(response, 'RfqQuoter: POST quote request success');
        const validated = PostQuoteResponseJoi.validate(response);
        if (validated.error) {
          log.error({ validationError: validated.error }, 'RfqQuoterErr: POST quote response invalid');
          metrics.putMetric(`RfqQuoterValidationErr`, 1);
        } else {
          quote = DutchLimitQuote.fromResponseBody(request, response);
          if (results[1].status == 'rejected') {
            log.debug(results[1].reason, 'RfqQuoterErr: GET nonce failed');
            metrics.putMetric(`RfqQuoterNonceErr`, 1);
            quote = DutchLimitQuote.fromResponseBody(request, response);
          } else {
            log.info(results[1].value.data, 'RfqQuoter: GET nonce success');
            metrics.putMetric(`RfqQuoterSuccess`, 1);
            quote = DutchLimitQuote.fromResponseBody(
              request,
              response,
              BigNumber.from(results[1].value.data.nonce).add(1).toString()
            );
          }
        }
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
