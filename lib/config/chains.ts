import { ChainId } from '@uniswap/smart-order-router';
import { RoutingType } from '../constants';

export const SUPPORTED_CHAINS = {
  [RoutingType.CLASSIC]: [
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
  ],
  [RoutingType.DUTCH_LIMIT]: [ChainId.MAINNET, ChainId.POLYGON, ChainId.GÖRLI],
};
