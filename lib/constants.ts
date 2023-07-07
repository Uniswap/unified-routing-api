import { BigNumber } from 'ethers';

export const DEFAULT_SLIPPAGE_TOLERANCE = '0.5'; // 0.5%
export const BPS = 10000; // 100.00%
export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';
// export const WETH_WRAP_GAS = 27938; // 27,938 warm deposit, 45,038 cold deposit
export const WETH_WRAP_GAS = 0; // TODO: remove
export const WETH_UNWRAP_GAS = 36000;
export const DEFAULT_EXCLUSIVITY_OVERRIDE_BPS = BigNumber.from(100); // non-exclusive fillers must override price by this much
export const UNISWAPX_BASE_GAS = 250000; // base gas overhead for filling an order through Gouda

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
}
