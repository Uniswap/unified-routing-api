import { TradeType } from '@uniswap/sdk-core';
import { ID_TO_CHAIN_ID, WRAPPED_NATIVE_CURRENCY } from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';
import axios from './helpers';

import { NATIVE_ADDRESS, RoutingType } from '../../constants';
import { DutchQuote, DutchRequest, Quote } from '../../entities';
import { PostQuoteResponseJoi } from '../../handlers/quote';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';
import { generateRandomNonce } from '../../util/nonce';
import { Quoter, QuoterType } from './index';

export class RfqQuoter implements Quoter {
  static readonly type: QuoterType.UNISWAPX_RFQ;

  constructor(private rfqUrl: string, private serviceUrl: string, private paramApiKey: string) {}

  async quote(request: DutchRequest): Promise<Quote | null> {
    if (request.routingType !== RoutingType.DUTCH_LIMIT) {
      log.error(`Invalid routing config type: ${request.routingType}`);
      return null;
    }

    const swapper = request.config.swapper;
    const requests = [
      axios.post(
        `${this.rfqUrl}quote`,
        {
          tokenInChainId: request.info.tokenInChainId,
          tokenOutChainId: request.info.tokenOutChainId,
          tokenIn: mapNative(request.info.tokenIn, request.info.tokenInChainId),
          tokenOut: mapNative(request.info.tokenOut, request.info.tokenInChainId),
          amount: request.info.amount.toString(),
          swapper: swapper,
          requestId: request.info.requestId,
          type: TradeType[request.info.type],
        },
        { headers: { 'x-api-key': this.paramApiKey } }
      ),
      axios.get(`${this.serviceUrl}dutch-auction/nonce?address=${swapper}&chainId=${request.info.tokenInChainId}`), // should also work for cross-chain?
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
          if (results[1].status == 'rejected') {
            log.debug(results[1].reason, 'RfqQuoterErr: GET nonce failed');
            metrics.putMetric(`RfqQuoterNonceErr`, 1);
            quote = DutchQuote.fromResponseBody(request, response, generateRandomNonce());
          } else {
            log.info(results[1].value.data, 'RfqQuoter: GET nonce success');
            metrics.putMetric(`RfqQuoterSuccess`, 1);
            quote = DutchQuote.fromResponseBody(
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
