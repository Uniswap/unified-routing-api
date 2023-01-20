import { QuoteRequest } from '../../lib/entities/QuoteRequest';
import { ClassicConfig, DutchLimitConfig } from '../../lib/entities/routing';

const CHAIN_IN_ID = 1;
const CHAIN_OUT_ID = 2;
const OFFERER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const TOKEN_IN = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const TOKEN_OUT = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const AMOUNT_IN = '1000000000000000000';

const MOCK_DL_CONFIG_JSON = {
  routingType: 'DUTCH_LIMIT' as const,
  offerer: OFFERER,
  exclusivePeriodSecs: 24,
  auctionPeriodSecs: 60,
};

const CLASSIC_CONFIG_JSON = {
  routingType: 'CLASSIC' as const,
  protocols: ['V3', 'V2', 'MIXED'],
  gasPriceWei: '1000000000',
};

const MOCK_REQUEST_JSON = {
  tokenInChainId: CHAIN_IN_ID,
  tokenOutChainId: CHAIN_OUT_ID,
  requestId: 'requestId',
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: AMOUNT_IN,
  tradeType: 'EXACT_INPUT',
  configs: [MOCK_DL_CONFIG_JSON, CLASSIC_CONFIG_JSON],
};

describe('QuoteRequest', () => {
  it('parses dutch limit order config properly', () => {
    const config = DutchLimitConfig.fromRequestBody(MOCK_DL_CONFIG_JSON);
    expect(config.toJSON()).toEqual(MOCK_DL_CONFIG_JSON);
  });

  it('parses basic classic quote order config properly', () => {
    const config = ClassicConfig.fromRequestBody(CLASSIC_CONFIG_JSON);
    expect(config.toJSON()).toEqual(CLASSIC_CONFIG_JSON);
  });

  it('parses a complete quote request properly', () => {
    const request = QuoteRequest.fromRequestBody(MOCK_REQUEST_JSON);
    expect(request.toJSON()).toMatchObject(MOCK_REQUEST_JSON);
  });
});
