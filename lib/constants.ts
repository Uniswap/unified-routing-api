import { BigNumber } from 'ethers';

export const DEFAULT_AUCTION_PERIOD_SECS = 60;
export const DEFAULT_EXCLUSIVE_PERIOD_SECS = 16;
export const DEFAULT_SLIPPAGE_TOLERANCE = '0.5'; // 0.5%
export const HUNDRED_PERCENT = BigNumber.from(100_00); // 100.00%
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// if the gas is greater than this proportion of the whole trade size
// then we will not route the order
// TODO: lower threshold after bug bash
export const GAS_PROPORTION_THRESHOLD_BPS = 1000;
export const BPS = 10000;
