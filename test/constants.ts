import { getAddress } from 'ethers/lib/utils';
import { RoutingType } from '../lib/entities';

export const CHAIN_IN_ID = 1;
export const CHAIN_OUT_ID = 1;
export const OFFERER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const CHECKSUM_OFFERER = getAddress(OFFERER);
export const TOKEN_IN = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
export const TOKEN_OUT = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const AMOUNT_IN = '1000000000000000000';
export const FILLER = '0x0000000000000000000000000000000000000000';

export const DL_CONFIG = {
  routingType: RoutingType.DUTCH_LIMIT,
  offerer: OFFERER,
  exclusivityOverrideBps: 24,
  auctionPeriodSecs: 60,
};

export const CLASSIC_CONFIG = {
  routingType: RoutingType.CLASSIC,
  protocols: ['V2', 'V3', 'MIXED'],
};
