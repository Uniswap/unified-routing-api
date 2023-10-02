import { BigNumber } from 'ethers';

export const DEFAULT_SLIPPAGE_TOLERANCE = '0.5'; // 0.5%
export const DEFAULT_ROUTING_API_DEADLINE = 600; // 10 minutes
export const BPS = 10000; // 100.00%
export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

// Because we don't natively support ETH input and require users to wrap their ETH before swapping,
// the user experience is significantly worse (requiring 3 user interactions).
// Thus, we add a negative bias towards ETH input trades through adding a gas adjustment in an effort
// to route users towards classic swaps unless UniswapX is significantly better.
export const WETH_WRAP_GAS = 27938 * 3; // 27,938 warm deposit, 45,038 cold deposit
export const WETH_WRAP_GAS_ALREADY_APPROVED = 27938 * 2;
export const WETH_UNWRAP_GAS = 36000;

export const DEFAULT_EXCLUSIVITY_OVERRIDE_BPS = BigNumber.from(100); // non-exclusive fillers must override price by this much
export const UNISWAPX_BASE_GAS = 275000; // base gas overhead for filling an order through Gouda
export const DEFAULT_START_TIME_BUFFER_SECS = 30;
export const OPEN_QUOTE_START_TIME_BUFFER_SECS = 60;

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
}

export const DEFAULT_POSITIVE_CACHE_ENTRY_TTL = 600; // 10 minutes
export const DEFAULT_NEGATIVE_CACHE_ENTRY_TTL = 600; // 10 minute

export const ENABLE_PORTION = (portionFlag?: string) => {
  return portionFlag === 'true';
};
