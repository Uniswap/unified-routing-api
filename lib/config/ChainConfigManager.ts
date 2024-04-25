import { ChainId } from '@uniswap/sdk-core';
import { RoutingType } from '../constants';

type CommonConfig = {
  routingType: RoutingType;
  priceImprovementBps?: number;
  stdAuctionPeriodSecs?: number;
  deadlineBufferSecs?: number;
}

export type DutchConfig = CommonConfig & {
  routingType: RoutingType.DUTCH_LIMIT | RoutingType.DUTCH_V2;
  skipRFQ?: boolean;
}

type ChainConfig = {
  routingTypes: (
    | CommonConfig & {
        routingType: RoutingType.CLASSIC | RoutingType.RELAY;
      }
    | DutchConfig & {
        routingType: RoutingType.DUTCH_V2;
      }
    | DutchConfig & {
        routingType: RoutingType.DUTCH_LIMIT;
        largeAuctionPeriodSecs?: number;
      }
  )[];
  alarmEnabled: boolean;
};

export abstract class ChainConfigManager {
  // Represents the other route dependencies for each route type
  // If a route is added in to the supported routingTypes for a chain,
  // all dependencies will also be supported
  private static readonly _routeDependencies: { [routingType: string]: RoutingType[] } = {
    [RoutingType.DUTCH_LIMIT]: [RoutingType.CLASSIC],
    [RoutingType.DUTCH_V2]: [RoutingType.CLASSIC],
  };
  private static readonly _chainConfigs: { [chainId: number]: ChainConfig } = {
    [ChainId.MAINNET]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
        {
          routingType: RoutingType.DUTCH_LIMIT,
          largeAuctionPeriodSecs: 120,
        },
        {
          routingType: RoutingType.RELAY,
        },
        {
          routingType: RoutingType.DUTCH_V2,
          // 25 blocks from now
          // to cover time to sign, run secondary auction, and some blocks for decay
          deadlineBufferSecs: 300,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.OPTIMISM]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.OPTIMISM_GOERLI]: {
      // TODO: add back optimism GOERLI once we are sure routing api supports it
      routingTypes: [],
      alarmEnabled: false,
    },
    [ChainId.ARBITRUM_ONE]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
        {
          routingType: RoutingType.DUTCH_V2,
          skipRFQ: true,
          priceImprovementBps: 2,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.ARBITRUM_GOERLI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: false,
    },
    [ChainId.POLYGON]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
        {
          routingType: RoutingType.DUTCH_LIMIT,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.POLYGON_MUMBAI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: false,
    },
    [ChainId.GOERLI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
        {
          routingType: RoutingType.DUTCH_LIMIT,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.SEPOLIA]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: false,
    },
    [ChainId.CELO]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.CELO_ALFAJORES]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: false,
    },
    [ChainId.BNB]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.AVALANCHE]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.BASE_GOERLI]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: false,
    },
    [ChainId.BASE]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: true,
    },
    [ChainId.BLAST]: {
      routingTypes: [
        {
          routingType: RoutingType.CLASSIC,
        },
      ],
      alarmEnabled: true,
    },
  };

  private static _chainConfigsWithDependencies: { [chainId: number]: ChainConfig };
  private static _reverseConfigs: { [routeType: string]: number[] };

  /**
   * Lazy load the full list
   * Adds dependencies if they don't already exist
   */
  static get chainConfigsWithDependencies(): { [chainId: number]: ChainConfig } {
    if (ChainConfigManager._chainConfigsWithDependencies) {
      return ChainConfigManager._chainConfigsWithDependencies;
    }
    ChainConfigManager._chainConfigsWithDependencies = ChainConfigManager._chainConfigs;
    for (const dependencyMapping in ChainConfigManager._routeDependencies) {
      for (const dependency of ChainConfigManager._routeDependencies[dependencyMapping]) {
        for (const chainId in ChainConfigManager._chainConfigs) {
          let dependentPresent = false;
          let dependencyPresent = false;
          for (const supportedRoutingType of ChainConfigManager._chainConfigs[chainId].routingTypes) {
            dependentPresent = dependentPresent || supportedRoutingType.routingType == dependencyMapping;
            dependencyPresent = dependencyPresent || supportedRoutingType.routingType == dependency;
          }
          // If we have the dependent but not the dependency, add it
          if (dependentPresent && !dependencyPresent) {
            ChainConfigManager._chainConfigsWithDependencies[chainId].routingTypes.push({
              routingType: dependency as RoutingType,
            });
          }
        }
      }
    }
    return ChainConfigManager._chainConfigsWithDependencies;
  }

  static get reverseConfigs(): { [routeType: string]: number[] } {
    if (ChainConfigManager._reverseConfigs) {
      return ChainConfigManager._reverseConfigs;
    }
    ChainConfigManager._reverseConfigs = {};
    for (const chainId in ChainConfigManager.chainConfigsWithDependencies) {
      for (const supportedRoutingType of ChainConfigManager.chainConfigsWithDependencies[chainId].routingTypes) {
        if (!ChainConfigManager._reverseConfigs[supportedRoutingType.routingType]) {
          ChainConfigManager._reverseConfigs[supportedRoutingType.routingType] = [];
        }
        ChainConfigManager._reverseConfigs[supportedRoutingType.routingType].push(parseInt(chainId));
      }
    }
    return ChainConfigManager._reverseConfigs;
  }

  /**
   * @returns all ChainIds
   */
  public static getChainIds(): ChainId[] {
    return Object.keys(ChainConfigManager.chainConfigsWithDependencies).map((c) => Number.parseInt(c));
  }

  /**
   * @param routingType The RoutingType to check
   * @returns all chains that support given RoutingType
   */
  public static getChainIdsByRoutingType(routingType: RoutingType): ChainId[] {
    return ChainConfigManager.reverseConfigs[routingType] || [];
  }

  /**
   * @param alarmEnabled Alarms set or not
   * @returns all chains that have the given alarm setting
   */
  public static getAlarmedChainIds(): ChainId[] {
    const chainIds: ChainId[] = [];
    for (const chainId in ChainConfigManager.chainConfigsWithDependencies) {
      if (ChainConfigManager.chainConfigsWithDependencies[chainId].alarmEnabled) {
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
    return (
      chainId in ChainConfigManager.chainConfigsWithDependencies &&
      ChainConfigManager.chainConfigsWithDependencies[chainId].routingTypes.some((r) => r.routingType == routingType)
    );
  }

  /**
   * @param chainId the ChainId to check
   * @param routingType the RoutingType to check
   * @returns the QuoteConfig for the provided ChainId and RoutingType
   */
  public static getQuoteConfig(chainId: ChainId, routingType: RoutingType) {
    if (!(chainId in ChainConfigManager.chainConfigsWithDependencies)) {
      throw new Error(`Unexpected chainId ${chainId}`);
    }
    // Should only return one element if exists
    const quoteConfig = ChainConfigManager.chainConfigsWithDependencies[chainId].routingTypes.find(
      (r) => r.routingType == routingType
    );
    if (!quoteConfig) {
      throw new Error(`Routing type ${routingType} not supported on chain ${chainId}`);
    }
    return quoteConfig;
  }
}
