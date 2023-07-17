import { ChainId } from '@uniswap/sdk-core';
import { RoutingType } from '../constants';

export const SUPPORTED_CHAINS = {
  [RoutingType.CLASSIC]: [
    ChainId.MAINNET,
    ChainId.OPTIMISM,
    ChainId.OPTIMISM_GOERLI,
    ChainId.ARBITRUM_ONE,
    ChainId.ARBITRUM_GOERLI,
    ChainId.POLYGON,
    ChainId.POLYGON_MUMBAI,
    ChainId.GOERLI,
    ChainId.CELO,
    ChainId.CELO_ALFAJORES,
    ChainId.BNB,
    ChainId.AVALANCHE,
  ],
  [RoutingType.DUTCH_LIMIT]: [ChainId.MAINNET, ChainId.POLYGON, ChainId.GOERLI],
};
