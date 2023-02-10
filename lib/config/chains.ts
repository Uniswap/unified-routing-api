import { ChainId } from '@uniswap/smart-order-router';

import { RoutingType } from '../entities';

export const ROUTING_API_CHAINS = [
  ChainId.MAINNET,
  ChainId.RINKEBY,
  ChainId.ROPSTEN,
  ChainId.KOVAN,
  ChainId.OPTIMISM,
  ChainId.OPTIMISTIC_KOVAN,
  ChainId.ARBITRUM_ONE,
  ChainId.ARBITRUM_RINKEBY,
  ChainId.ARBITRUM_GOERLI,
  ChainId.POLYGON,
  ChainId.POLYGON_MUMBAI,
  ChainId.GÖRLI,
  ChainId.CELO,
  ChainId.CELO_ALFAJORES,
];

export const SUPPORTED_CHAINS = {
  [RoutingType.CLASSIC]: ROUTING_API_CHAINS,
  [RoutingType.DUTCH_LIMIT]: [ChainId.MAINNET, ChainId.GÖRLI],
};
