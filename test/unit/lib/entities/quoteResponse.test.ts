import { DutchOrder, RelayOrder } from '@uniswap/uniswapx-sdk';
import { BigNumber } from 'ethers';

import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchQuoteJSON,
  DutchV1Request,
  RelayQuote,
  RelayQuoteJSON,
} from '../../../../lib/entities';
import { RelayRequest } from '../../../../lib/entities/request/RelayRequest';
import {
  AMOUNT,
  CHAIN_IN_ID,
  FILLER,
  PERMIT_DETAILS,
  PORTION_BIPS,
  PORTION_RECIPIENT,
  SWAPPER,
  TOKEN_IN,
  TOKEN_OUT,
} from '../../../constants';
import {
  CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN,
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_RELAY,
} from '../../../utils/fixtures';
import { DutchQuoteFactory } from '../../../../lib/entities/quote/DutchQuoteFactory';
import { DutchV1Quote } from '../../../../lib/entities/quote/DutchV1Quote';

const DL_QUOTE_JSON: DutchQuoteJSON = {
  chainId: CHAIN_IN_ID,
  requestId: '0xrequestId',
  quoteId: '0xquoteId',
  tokenIn: TOKEN_IN,
  amountIn: AMOUNT,
  tokenOut: TOKEN_OUT,
  amountOut: AMOUNT,
  swapper: SWAPPER,
  filler: FILLER,
};

const DL_QUOTE_JSON_RFQ: DutchQuoteJSON = {
  chainId: CHAIN_IN_ID,
  requestId: '0xrequestId',
  quoteId: '0xquoteId',
  tokenIn: TOKEN_IN,
  amountIn: AMOUNT,
  tokenOut: TOKEN_OUT,
  amountOut: AMOUNT,
  swapper: SWAPPER,
  filler: '0x1111111111111111111111111111111111111111',
};

const RELAY_QUOTE_JSON: RelayQuoteJSON = {
  chainId: 1,
  requestId: 'requestId',
  quoteId: 'quoteId',
  tokenIn: TOKEN_IN,
  amountIn: AMOUNT,
  tokenOut: TOKEN_OUT,
  amountOut: AMOUNT,
  gasToken: TOKEN_IN,
  feeAmountStart: AMOUNT,
  feeAmountEnd: AMOUNT,
  swapper: SWAPPER,
  classicQuoteData: CLASSIC_QUOTE_DATA_WITH_ROUTE_AND_GAS_TOKEN.quote,
};

const CLASSIC_QUOTE_JSON: ClassicQuoteDataJSON = {
  requestId: '0xrequestId',
  quoteId: '0xquoteId',
  amount: AMOUNT,
  amountDecimals: '18',
  quote: '2000000',
  quoteDecimals: '18',
  quoteGasAdjusted: AMOUNT,
  quoteGasAdjustedDecimals: '18',
  gasUseEstimate: '100',
  gasUseEstimateQuote: '100',
  gasUseEstimateQuoteDecimals: '18',
  gasUseEstimateUSD: '100',
  simulationStatus: 'asdf',
  gasPriceWei: '10000',
  blockNumber: '1234',
  route: [],
  routeString: 'USD-ETH',
  tradeType: 'EXACT_INPUT',
  slippage: 0.5,
  portionBips: PORTION_BIPS,
  portionRecipient: PORTION_RECIPIENT,
};

const UNIVERSAL_ROUTER_ADDRESS = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';

describe('QuoteResponse', () => {
  const config: DutchV1Request = QUOTE_REQUEST_DL;
  const relayConfig: RelayRequest = QUOTE_REQUEST_RELAY;

  it('parses dutch limit quote from param-api properly', () => {
    expect(() => DutchQuoteFactory.fromResponseBody(config, DL_QUOTE_JSON)).not.toThrow();
  });

  it('parses relay quote properly', () => {
    expect(() => RelayQuote.fromResponseBody(relayConfig, RELAY_QUOTE_JSON)).not.toThrow();
  });

  it('produces dutch limit order info from param-api response and config', () => {
    const quote = DutchQuoteFactory.fromResponseBody(config, DL_QUOTE_JSON_RFQ);
    expect(quote.toOrder().toJSON()).toMatchObject({
      swapper: SWAPPER,
      input: {
        token: TOKEN_IN,
        startAmount: AMOUNT,
        endAmount: AMOUNT,
      },
      outputs: [
        {
          token: TOKEN_OUT,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(AMOUNT).mul(995).div(1000).toString(), // default 5% slippage
          recipient: SWAPPER,
        },
      ],
    });
    const order = DutchOrder.fromJSON((quote as DutchV1Quote).toOrder().toJSON(), quote.chainId);
    expect(order.info.exclusiveFiller).toEqual('0x1111111111111111111111111111111111111111');
    expect(order.info.exclusivityOverrideBps.toString()).toEqual('12');

    expect(BigNumber.from(quote.toOrder().toJSON().nonce).gt(0)).toBeTruthy();
  });

  it('produces relay order info from quote', () => {
    const quote = RelayQuote.fromResponseBody(relayConfig, RELAY_QUOTE_JSON);
    expect(quote.toOrder().toJSON()).toMatchObject({
      swapper: SWAPPER,
      input: {
        token: TOKEN_IN,
        amount: AMOUNT,
        recipient: UNIVERSAL_ROUTER_ADDRESS,
      },
      fee: {
        token: TOKEN_IN,
        startAmount: AMOUNT,
        endAmount: AMOUNT,
        startTime: expect.any(Number),
        endTime: expect.any(Number),
      },
      universalRouterCalldata:
        '0x24856bc30000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000100000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000dc46ef164c4a49e00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f984000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    });
    const order = RelayOrder.fromJSON(quote.toOrder().toJSON(), quote.chainId);
    expect(BigNumber.from(order.toJSON().nonce).gt(0)).toBeTruthy();
  });

  it('parses classic quote exactInput', () => {
    const quote = ClassicQuote.fromResponseBody(CLASSIC_QUOTE_EXACT_IN_BETTER.request, CLASSIC_QUOTE_JSON);
    quote.setAllowanceData(PERMIT_DETAILS);
    expect(quote.toJSON()).toMatchObject({
      ...CLASSIC_QUOTE_JSON,
      quoteId: expect.any(String),
      requestId: expect.any(String),
      tradeType: 'EXACT_INPUT',
    });
    expect(quote.amountIn.toString()).toEqual(CLASSIC_QUOTE_JSON.amount);
    expect(quote.amountOut.toString()).toEqual(CLASSIC_QUOTE_JSON.quote);
    expect(quote.portion?.bips).toEqual(CLASSIC_QUOTE_JSON.portionBips);
    expect(quote.portion?.recipient).toEqual(CLASSIC_QUOTE_JSON.portionRecipient);
  });

  it('parses classic quote exactOutput', () => {
    const quote = ClassicQuote.fromResponseBody(CLASSIC_QUOTE_EXACT_OUT_BETTER.request, CLASSIC_QUOTE_JSON);
    quote.setAllowanceData(PERMIT_DETAILS);
    expect(quote.toJSON()).toMatchObject({
      ...CLASSIC_QUOTE_JSON,
      quoteId: expect.any(String),
      requestId: expect.any(String),
      tradeType: 'EXACT_OUTPUT',
    });
    expect(quote.amountIn.toString()).toEqual(CLASSIC_QUOTE_JSON.quote);
    expect(quote.amountOut.toString()).toEqual(CLASSIC_QUOTE_JSON.amount);
    expect(quote.portion?.bips).toEqual(CLASSIC_QUOTE_JSON.portionBips);
    expect(quote.portion?.recipient).toEqual(CLASSIC_QUOTE_JSON.portionRecipient);
  });
});
