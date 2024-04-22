import { ChainId } from '@uniswap/sdk-core';
import { RoutingType } from '../constants';

type ChainConfig = {
  routingTypes: (
    |
    {
      routingType: RoutingType.CLASSIC | RoutingType.DUTCH_V2 | RoutingType.RELAY,
      skipRFQ?: boolean,
      priceImprovementBps?: number,
      stdAuctionPeriodSecs?: number,
      deadlineBufferSecs?: number
    }
    | 
    {
      routingType: RoutingType.DUTCH_LIMIT,
      skipRFQ?: boolean,
      priceImprovementBps?: number,
      stdAuctionPeriodSecs?: number,
      lrgAuctionPeriodSecs?: number,
      deadlineBufferSecs?: number
    }
  )[],
  alarmEnabled: boolean
}

export abstract class ChainConfigManager {

  public static readonly chainConfigs: { [chainId:number] : ChainConfig } = {
    [ChainId.MAINNET]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
        {
          routingType: RoutingType.DUTCH_LIMIT,
          lrgAuctionPeriodSecs: 120
        },
        {
          routingType: RoutingType.RELAY 
        },
        {
          routingType: RoutingType.DUTCH_V2,
          // 10 blocks from now
          // to cover time to sign, run secondary auction, and some blocks for decay
          deadlineBufferSecs: 120
        }
      ],
      alarmEnabled: true
    },
    [ChainId.OPTIMISM]: {
      routingTypes: [
          {
            routingType: RoutingType.CLASSIC 
          },
      ],
      alarmEnabled: true
    },
    [ChainId.OPTIMISM_GOERLI]: {
      // TODO: add back optimism GOERLI once we are sure routing api supports it
      routingTypes: [],
      alarmEnabled: false
    },
    [ChainId.ARBITRUM_ONE]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
        {
          routingType: RoutingType.DUTCH_V2,
          skipRFQ: true,
          priceImprovementBps: 2
        },
      ],
      alarmEnabled: true
    },
    [ChainId.ARBITRUM_GOERLI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: false
    },
    [ChainId.POLYGON]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
        {
          routingType: RoutingType.DUTCH_LIMIT
        },
      ],
      alarmEnabled: true
    },
    [ChainId.POLYGON_MUMBAI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: false
    },
    [ChainId.GOERLI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
        {
          routingType: RoutingType.DUTCH_LIMIT
        },
      ],
      alarmEnabled: true
    },
    [ChainId.SEPOLIA]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: false
    },
    [ChainId.CELO]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: true
    },
    [ChainId.CELO_ALFAJORES]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: false
    },
    [ChainId.BNB]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: true
    },
    [ChainId.AVALANCHE]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: true
    },
    [ChainId.BASE_GOERLI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: false
    },
    [ChainId.BASE]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: true
    },
    [ChainId.BLAST]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC 
        },
    ],
      alarmEnabled: true
    },
  };

  /**
   * @returns all ChainIds
   */
  public static getChainIds(): ChainId[] {
    return Object.keys(ChainConfigManager.chainConfigs).map(c => Number.parseInt(c));
  }

  /**
   * @param routingType The RoutingType to check
   * @returns all chains that support given RoutingType
   */
  public static getChainIdsByRoutingType(routingType: RoutingType): ChainId[] {
    const chainIds: ChainId[] = [];
    for (const chainId in ChainConfigManager.chainConfigs) {
      for (const supportedRoutingType of ChainConfigManager.chainConfigs[chainId].routingTypes) {
        if (supportedRoutingType.routingType == routingType) {
          chainIds.push(Number.parseInt(chainId));
        }
      }
    }
    return chainIds;
  }

  /**
   * @param alarmEnabled Alarms set or not
   * @returns all chains that have the given alarm setting
   */
  public static getChainIdsByAlarmSetting(alarmEnabled: boolean): ChainId[] {
    const chainIds: ChainId[] = [];
    for (const chainId in ChainConfigManager.chainConfigs) {
      if (ChainConfigManager.chainConfigs[chainId].alarmEnabled == alarmEnabled) {
        chainIds.push(Number.parseInt(chainId));
      }
    }
    return chainIds;
  }

  /**
   * @param chainId the ChainId to check
   * @param routingType the RoutingType to check
   * @returns true when ChainId supports provided RoutingType
   */
  public static chainSupportsRoutingType(chainId: ChainId, routingType: RoutingType) {
    return chainId in ChainConfigManager.chainConfigs && 
      ChainConfigManager.chainConfigs[chainId].routingTypes.some(r => r.routingType == routingType);
  }

  /**
   * @param chainId the ChainId to check
   * @param routingType the RoutingType to check
   * @returns the QuoteConfig for the provided ChainId and RoutingType
   */
  public static getQuoteConfig(chainId: ChainId, routingType: RoutingType) {
    if (!(chainId in ChainConfigManager.chainConfigs)) {
      throw new Error(`Unexpected chainId ${chainId}`);
    }
    // Should only return one element if exists
    const quoteConfig = ChainConfigManager.chainConfigs[chainId].routingTypes.filter(r => r.routingType == routingType);
    if (quoteConfig.length == 0) {
      throw new Error(`Routing type ${routingType} not supported on chain ${chainId}`);
    }
    return quoteConfig[0];
  }
}