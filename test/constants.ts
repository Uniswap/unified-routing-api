import { RoutingType } from '../lib/util/types';

export const CHAIN_IN_ID = 1;
export const CHAIN_OUT_ID = 1;
export const OFFERER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const TOKEN_IN = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
export const TOKEN_OUT = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
export const AMOUNT_IN = '1000000000000000000';
export const FILLER = '0x0000000000000000000000000000000000000000';

export const DL_CONFIG = {
  routingType: RoutingType.DUTCH_LIMIT,
  offerer: OFFERER,
  exclusivePeriodSecs: 24,
  auctionPeriodSecs: 60,
};

export const CLASSIC_CONFIG = {
  routingType: RoutingType.CLASSIC,
  protocols: ['V2', 'V3', 'MIXED'],
};
