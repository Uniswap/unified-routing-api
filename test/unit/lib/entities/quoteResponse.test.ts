import { DutchOrder, RelayOrder } from '@uniswap/uniswapx-sdk';
import { BigNumber } from 'ethers';

import { ClassicQuote, ClassicQuoteDataJSON, DutchQuote, DutchQuoteJSON, DutchRequest, RelayQuote, RelayQuoteJSON } from '../../../../lib/entities';
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
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_RELAY,
} from '../../../utils/fixtures';
import { RelayRequest } from '../../../../lib/entities/request/RelayRequest';

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
  chainId: CHAIN_IN_ID,
  requestId: '0xrequestId',
  quoteId: '0xquoteId',
  tokenIn: TOKEN_IN,
  amountIn: AMOUNT,
  tokenOut: TOKEN_OUT,
  amountOut: AMOUNT,
  swapper: SWAPPER,
  gasToken: TOKEN_IN,
  amountInGasToken: AMOUNT,
  classicAmountInGasAndPortionAdjusted: AMOUNT,
  classicAmountOutGasAndPortionAdjusted: AMOUNT,
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

const UNIVERSAL_ROUTER_ADDRESS = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD";
const FILLER_SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000000";

describe('QuoteResponse', () => {
  const config: DutchRequest = QUOTE_REQUEST_DL;
  const relayConfig: RelayRequest = QUOTE_REQUEST_RELAY;

  it('parses dutch limit quote from param-api properly', () => {
    expect(() => DutchQuote.fromResponseBody(config, DL_QUOTE_JSON)).not.toThrow();
  });

  it('parses relay quote properly', () => {
    expect(() => RelayQuote.fromResponseBody(relayConfig, RELAY_QUOTE_JSON)).not.toThrow();
  });

  it('produces dutch limit order info from param-api response and config', () => {
    const quote = DutchQuote.fromResponseBody(config, DL_QUOTE_JSON_RFQ);
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
    const order = DutchOrder.fromJSON(quote.toOrder().toJSON(), quote.chainId);
    expect(order.info.exclusiveFiller).toEqual('0x1111111111111111111111111111111111111111');
    expect(order.info.exclusivityOverrideBps.toString()).toEqual('12');

    expect(BigNumber.from(quote.toOrder().toJSON().nonce).gt(0)).toBeTruthy();
  });

  it('produces relay order info from quote', () => {
    const quote = RelayQuote.fromResponseBody(relayConfig, RELAY_QUOTE_JSON);
    expect(quote.toOrder().toJSON()).toMatchObject({
      swapper: SWAPPER,
      inputs: [
        {
          token: TOKEN_IN,
          startAmount: AMOUNT,
          maxAmount: AMOUNT,
          recipient: UNIVERSAL_ROUTER_ADDRESS
        },
        {
          token: TOKEN_IN,
          startAmount: AMOUNT,
          maxAmount: AMOUNT,
          recipient: FILLER_SENTINEL_ADDRESS
        },
      ],
      actions: []
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
    expect(quote.getPortionBips()).toEqual(CLASSIC_QUOTE_JSON.portionBips);
    expect(quote.getPortionRecipient()).toEqual(CLASSIC_QUOTE_JSON.portionRecipient);
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
    expect(quote.getPortionBips()).toEqual(CLASSIC_QUOTE_JSON.portionBips);
    expect(quote.getPortionRecipient()).toEqual(CLASSIC_QUOTE_JSON.portionRecipient);
  });
});
