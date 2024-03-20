import Logger from 'bunyan';
import * as _ from 'lodash';

import { it } from '@jest/globals';
import { DEFAULT_START_TIME_BUFFER_SECS } from '../../../lib/constants';
import { RelayQuote } from '../../../lib/entities';
import {
    CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN,
  createClassicQuote,
  createRelayQuote,
  createRelayQuoteWithRequest,
  makeRelayRequest,
} from '../../utils/fixtures';
import { AMOUNT } from '../../constants';

describe('RelayQuote', () => {
  // silent logger in tests
  const logger = Logger.createLogger({ name: 'test' });
  logger.level(Logger.FATAL);

  describe('decay parameters', () => {
    it('uses default parameters', () => {
      const quote = createRelayQuoteWithRequest(
        {},
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: undefined,
          auctionPeriodSecs: undefined,
          deadlineBufferSecs: undefined,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(DEFAULT_START_TIME_BUFFER_SECS);
      expect(result.auctionPeriodSecs).toEqual(60);
      expect(result.deadlineBufferSecs).toEqual(12);
    });

    it('overrides parameters in request', () => {
      const quote = createRelayQuoteWithRequest(
        {},
        {},
        {
          swapper: '0x9999999999999999999999999999999999999999',
          startTimeBufferSecs: 111,
          auctionPeriodSecs: 222,
          deadlineBufferSecs: 333,
        }
      );
      const result = quote.toJSON();
      expect(result.startTimeBufferSecs).toEqual(111);
      expect(result.auctionPeriodSecs).toEqual(222);
      expect(result.deadlineBufferSecs).toEqual(333);
    });
  });

//   export const CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN = {
//     routing: RoutingType.CLASSIC,
//     quote: {
//       requestId: 'requestId',
//       quoteId: '1',
//       amount: AMOUNT,
//       amountDecimals: '18',
//       quote: AMOUNT,
//       quoteDecimals: '18',
//       quoteGasAdjusted: AMOUNT,
//       quoteGasAdjustedDecimals: '18',
//       gasUseEstimate: '100',
//       gasUseEstimateQuote: '100',
//       gasUseEstimateQuoteDecimals: '18',
//       gasUseEstimateGasToken: '10',
//       gasUseEstimateGasTokenDecimals: '10',
//       gasUseEstimateUSD: '100',
//       simulationStatus: 'start',
//       gasPriceWei: '10000',
//       blockNumber: '1234',
//       route: [],
//       routeString: 'USD-ETH',
//       permitNonce: '1',
//       tradeType: 'exactIn',
//       slippage: 0.5,
//       methodParameters: {
//         to: '0x',
//         calldata: '0x',
//         value: '0',
//       },
//       portionBips: 0, // always assume portion will get returned from routing-api
//       portionRecipient: '0x0000000000000000000000000000000000000000',
//     },
//   };

  describe('toJSON', () => {
    it('Succeeds', () => {
      const quote = createRelayQuote({ amountOut: '10000' }, 'EXACT_INPUT', '1');
      const quoteJSON = quote.toJSON();

      expect(quoteJSON).toMatchObject({
        requestId: 'requestId',
        quoteId: 'quoteId'
      });

      const order = quote.toOrder();
      // expect generated calldata from quote class to be added to order
      expect(quote.universalRouterCalldata).toEqual(order.info.universalRouterCalldata);
    });
  });

  describe('fromClassicQuote', () => {
    it('Succeeds - Generates nonce on initialization with portion flag %p', () => {
      const classicQuote = createClassicQuote(
        CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN.quote,
        {}
      );
      const relayRequest = makeRelayRequest({ type: 'EXACT_INPUT' });
      const quote = RelayQuote.fromClassicQuote(relayRequest, classicQuote);
      console.log(JSON.stringify(quote.toJSON()));
      expect(quote).toBeDefined();
      expect(quote.amountInGasTokenStart.eq(AMOUNT)).toBeTruthy();
      // Expect escalation to be applied to gas token amount
      expect(quote.amountInGasTokenEnd.gt(quote.amountInGasTokenStart)).toBeTruthy();
    });
  });
});
