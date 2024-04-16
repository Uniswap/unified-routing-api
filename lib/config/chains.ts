import { ChainId } from '@uniswap/sdk-core';
import { RoutingType } from '../constants';

type ChainConfig = {
  routingTypes: RoutingType [],
  alarmEnabled: boolean
}

export abstract class ChainConfigManager {

  public static chainConfigs: { [chainId:number] : ChainConfig } = {
    [ChainId.MAINNET]: {
      routingTypes: [
        RoutingType.CLASSIC, 
        RoutingType.DUTCH_LIMIT, 
        RoutingType.RELAY, 
        RoutingType.DUTCH_V2
      ],
      alarmEnabled: true
    },
    [ChainId.OPTIMISM]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: true
    },
    [ChainId.OPTIMISM_GOERLI]: {
      // TODO: add back optimism GOERLI once we are sure routing api supports it
      routingTypes: [],
      alarmEnabled: false
    },
    [ChainId.ARBITRUM_ONE]: {
      routingTypes: [RoutingType.CLASSIC, RoutingType.DUTCH_V2],
      alarmEnabled: true
    },
    [ChainId.ARBITRUM_GOERLI]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: false
    },
    [ChainId.POLYGON]: {
      routingTypes: [RoutingType.CLASSIC, RoutingType.DUTCH_LIMIT],
      alarmEnabled: true
    },
    [ChainId.POLYGON_MUMBAI]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: false
    },
    [ChainId.GOERLI]: {
      routingTypes: [RoutingType.CLASSIC, RoutingType.DUTCH_LIMIT],
      alarmEnabled: true
    },
    [ChainId.SEPOLIA]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: false
    },
    [ChainId.CELO]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: true
    },
    [ChainId.CELO_ALFAJORES]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: false
    },
    [ChainId.BNB]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: true
    },
    [ChainId.AVALANCHE]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: true
    },
    [ChainId.BASE_GOERLI]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: false
    },
    [ChainId.BASE]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: true
    },
    [ChainId.BLAST]: {
      routingTypes: [RoutingType.CLASSIC],
      alarmEnabled: true
    },
  }

  public static getChainIds(): ChainId[] {
    return Object.keys(ChainConfigManager.chainConfigs).map(c => Number.parseInt(c))
  }

  public static getChainIdsByRoutingType(routingType: RoutingType): ChainId[] {
    const chainIds: ChainId[] = []
    for (const chainId in ChainConfigManager.chainConfigs) {
      if (ChainConfigManager.chainConfigs[chainId].routingTypes.includes(routingType)) {
        chainIds.push(Number.parseInt(chainId))
      }
    }
    return chainIds
  }

  public static getChainIdsByAlarmSetting(alarmEnabled: boolean): ChainId[] {
    const chainIds: ChainId[] = []
    for (const chainId in ChainConfigManager.chainConfigs) {
      if (ChainConfigManager.chainConfigs[chainId].alarmEnabled == alarmEnabled) {
        chainIds.push(Number.parseInt(chainId))
      }
    }
    return chainIds
  }

  public static chainSupportsRoutingType(chainId: ChainId, routingType: RoutingType) {
    return ChainConfigManager.chainConfigs[chainId].routingTypes.includes(routingType)
  }
}