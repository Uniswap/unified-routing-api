import { BigNumber } from 'ethers';

export const DEFAULT_AUCTION_PERIOD_SECS = 60;
export const DEFAULT_EXCLUSIVE_PERIOD_SECS = 16;
export const DEFAULT_SLIPPAGE_TOLERANCE = '2'; // 2%
export const HUNDRED_PERCENT = BigNumber.from(100_00); // 100.00%
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
