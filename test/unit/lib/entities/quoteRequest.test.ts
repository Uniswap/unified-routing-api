import { RoutingType } from '../../../../lib/constants';
import {
  ClassicConfigJSON,
  ClassicRequest,
  DutchLimitConfigJSON,
  DutchLimitRequest,
  parseQuoteRequests,
  QuoteRequestBodyJSON,
} from '../../../../lib/entities';
import { ValidationError } from '../../../../lib/util/errors';
import { AMOUNT_IN, CHAIN_IN_ID, CHAIN_OUT_ID, OFFERER, TOKEN_IN, TOKEN_OUT } from '../../../constants';

const MOCK_DL_CONFIG_JSON: DutchLimitConfigJSON = {
  routingType: RoutingType.DUTCH_LIMIT,
  offerer: OFFERER,
  exclusivityOverrideBps: 24,
  auctionPeriodSecs: 60,
};

const CLASSIC_CONFIG_JSON: ClassicConfigJSON = {
  routingType: RoutingType.CLASSIC,
  protocols: ['V3', 'V2', 'MIXED'],
  gasPriceWei: '1000000000',
};

const DUPLICATE_REQUEST_JSON = {
  requestId: 'requestId',
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_INPUT',
  configs: [MOCK_DL_CONFIG_JSON, CLASSIC_CONFIG_JSON, MOCK_DL_CONFIG_JSON],
  offerer: OFFERER,
};

const EXACT_INPUT_MOCK_REQUEST_JSON: QuoteRequestBodyJSON = {
  requestId: 'requestId',
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_INPUT',
  offerer: OFFERER,
  configs: [MOCK_DL_CONFIG_JSON, CLASSIC_CONFIG_JSON],
};

const EXACT_OUTPUT_MOCK_REQUEST_JSON: QuoteRequestBodyJSON = {
  requestId: 'requestId',
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  type: 'EXACT_OUTPUT',
  offerer: OFFERER,
  configs: [MOCK_DL_CONFIG_JSON, CLASSIC_CONFIG_JSON],
};

describe('QuoteRequest', () => {
  for (const request of [EXACT_INPUT_MOCK_REQUEST_JSON, EXACT_OUTPUT_MOCK_REQUEST_JSON]) {
    describe(request.type, () => {
      it('parses exactInput dutch limit order config properly', () => {
        const { quoteRequests: requests } = parseQuoteRequests(request);
        const info = requests[0].info;

        const config = DutchLimitRequest.fromRequestBody(info, MOCK_DL_CONFIG_JSON);
        expect(config.toJSON()).toEqual(MOCK_DL_CONFIG_JSON);
      });

      it('parses exactOutput dutch limit order config properly', () => {
        const { quoteRequests: requests } = parseQuoteRequests(request);
        const info = requests[0].info;

        const config = DutchLimitRequest.fromRequestBody(info, MOCK_DL_CONFIG_JSON);
        expect(config.toJSON()).toEqual(MOCK_DL_CONFIG_JSON);
      });

      it('parses basic classic quote order config properly', () => {
        const { quoteRequests: requests } = parseQuoteRequests(request);
        const info = requests[0].info;
        const config = ClassicRequest.fromRequestBody(info, CLASSIC_CONFIG_JSON);

        expect(config.toJSON()).toEqual(CLASSIC_CONFIG_JSON);
      });

      it('throws if more than one of the same type', () => {
        let threw = false;
        try {
          parseQuoteRequests(DUPLICATE_REQUEST_JSON);
        } catch (e) {
          threw = true;
          expect(e instanceof ValidationError).toBeTruthy();
          if (e instanceof ValidationError) {
            expect(e.message).toEqual('Duplicate routing type: DUTCH_LIMIT');
          }
        }
        expect(threw).toBeTruthy();
      });

      it('includes offerer in info for dutch limit', () => {
        const { quoteRequests: requests } = parseQuoteRequests(request);
        const info = requests[0].info;
        const config = DutchLimitRequest.fromRequestBody(info, MOCK_DL_CONFIG_JSON);

        expect(config.info.offerer).toEqual(OFFERER);
      });

      it('includes offerer in info for classic', () => {
        const { quoteRequests: requests } = parseQuoteRequests(request);
        const info = requests[0].info;
        const config = ClassicRequest.fromRequestBody(info, CLASSIC_CONFIG_JSON);

        expect(config.info.offerer).toEqual(OFFERER);
      });
    });
  }
});
