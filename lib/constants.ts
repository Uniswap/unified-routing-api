import { BigNumber } from 'ethers';

export const DEFAULT_SLIPPAGE_TOLERANCE = '0.5'; // 0.5%
export const DEFAULT_ROUTING_API_DEADLINE = 600; // 10 minutes
export const BPS = 10000; // 100.00%
export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';
export const LARGE_TRADE_USD_THRESHOLD = 10_000;

// Because we don't natively support ETH input and require users to wrap their ETH before swapping,
// the user experience is significantly worse (requiring 3 user interactions).
// Thus, we add a negative bias towards ETH input trades through adding a gas adjustment in an effort
// to route users towards classic swaps unless UniswapX is significantly better.
export const WETH_WRAP_GAS = 27938 * 3; // 27,938 warm deposit, 45,038 cold deposit
export const WETH_WRAP_GAS_ALREADY_APPROVED = 27938 * 2;
export const WETH_UNWRAP_GAS = 36000;

export const DEFAULT_EXCLUSIVITY_OVERRIDE_BPS = BigNumber.from(100); // non-exclusive fillers must override price by this much
export const UNISWAPX_BASE_GAS = 275000; // base gas overhead for filling an order through Gouda
export const RELAY_BASE_GAS = 130_000; // base gas overhead for filling a relayed swap
export const DEFAULT_START_TIME_BUFFER_SECS = 45;
export const OPEN_QUOTE_START_TIME_BUFFER_SECS = 60;
export const DEFAULT_AUCTION_PERIOD_SECS = 60;
export const DEFAULT_DEADLINE_BUFFER_SECS = 12;
export const DEFAULT_V2_DEADLINE_BUFFER_SECS = 30;

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
  RELAY = 'RELAY',
  DUTCH_V2 = 'DUTCH_V2',
}

export enum QuoteType {
  CLASSIC,
  RFQ,
  SYNTHETIC,
}

export const DEFAULT_POSITIVE_CACHE_ENTRY_TTL = 300; // 5 minutes
export const DEFAULT_NEGATIVE_CACHE_ENTRY_TTL = 300; // 5 minutes

export const frontendEnablePortion = (sendPortionFlag?: boolean) => {
  return sendPortionFlag;
};

export const frontendAndUraEnablePortion = (sendPortionFlag?: boolean) => {
  return frontendEnablePortion(sendPortionFlag);
};
