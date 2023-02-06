import { Protocol } from '@uniswap/router-sdk';
import { BigNumber } from 'ethers';
import invariant from 'tiny-invariant';

import { DEFAULT_AUCTION_PERIOD_SECS, DEFAULT_EXCLUSIVE_PERIOD_SECS, DUMMY_GAS_WEI, ZERO_ADDRESS } from '../constants';

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
}

export interface RoutingConfigData {
  routingType: RoutingType;
}

export interface DutchLimitConfigData extends RoutingConfigData {
  offerer?: string;
  exclusivePeriodSecs?: number;
  auctionPeriodSecs?: number;
}

export interface DutchLimitConfigJSON extends Omit<DutchLimitConfigData, 'routingType'> {
  routingType: 'DUTCH_LIMIT';
}

export interface ClassicConfigData extends RoutingConfigData {
  protocols: Protocol[];
  gasPriceWei?: string;
  simulateFromAddress?: string;
  permitSignature?: string;
  permitNonce?: string;
  permitExpiration?: string;
  permitAmount?: BigNumber;
  permitSigDeadline?: number;
  enableUniversalRouter?: boolean;
  slippageTolerance?: number;
  deadline?: number;
  minSplits?: number;
  forceCrossProtocol?: boolean;
  forceMixedRoutes?: boolean;
}

export interface ClassicConfigJSON extends Omit<ClassicConfigData, 'routingType' | 'protocols' | 'permitAmount'> {
  routingType: 'CLASSIC';
  protocols: string[];
  permitAmount?: string;
}

export type RoutingConfigJSON = DutchLimitConfigJSON | ClassicConfigJSON;

export class DutchLimitConfig implements DutchLimitConfigData {
  public static fromRequestBody(body: DutchLimitConfigJSON): DutchLimitConfig {
    invariant(body.routingType == 'DUTCH_LIMIT', 'routingType must be DUTCH_LIMIT');
    return new DutchLimitConfig(
      RoutingType.DUTCH_LIMIT as const,
      body.offerer ?? ZERO_ADDRESS,
      body.exclusivePeriodSecs ?? DEFAULT_EXCLUSIVE_PERIOD_SECS,
      body.auctionPeriodSecs ?? DEFAULT_AUCTION_PERIOD_SECS
    );
  }

  constructor(
    public readonly routingType: RoutingType,
    public readonly offerer: string,
    public readonly exclusivePeriodSecs: number,
    public readonly auctionPeriodSecs: number
  ) {}

  public toJSON() {
    return {
      offerer: this.offerer,
      exclusivePeriodSecs: this.exclusivePeriodSecs,
      auctionPeriodSecs: this.auctionPeriodSecs,
      routingType: 'DUTCH_LIMIT',
    };
  }
}

export class ClassicConfig implements RoutingConfigData {
  public static fromRequestBody(body: ClassicConfigJSON): ClassicConfig {
    invariant(body.routingType == 'CLASSIC', 'routingType must be CLASSIC');
    return new ClassicConfig(
      RoutingType.CLASSIC,
      body.protocols.flatMap((p: string) => {
        if (p in Protocol) {
          return Protocol[p as keyof typeof Protocol];
        } else {
          return [];
        }
      }),
      body.gasPriceWei ?? DUMMY_GAS_WEI,
      body.simulateFromAddress,
      body.permitSignature,
      body.permitNonce,
      body.permitExpiration,
      body.permitAmount ? BigNumber.from(body.permitAmount) : undefined,
      body.permitSigDeadline,
      body.enableUniversalRouter,
      body.slippageTolerance,
      body.deadline,
      body.minSplits,
      body.forceCrossProtocol,
      body.forceMixedRoutes
    );
  }

  constructor(
    public readonly routingType: RoutingType,
    public readonly protocols: Protocol[],
    public readonly gasPriceWei: string,
    public readonly simulateFromAddress?: string,
    public readonly permitSignature?: string,
    public readonly permitNonce?: string,
    public readonly permitExpiration?: string,
    public readonly permitAmount?: BigNumber,
    public readonly permitSigDeadline?: number,
    public readonly enableUniversalRouter?: boolean,
    public readonly slippageTolerance?: number,
    public readonly deadline?: number,
    public readonly minSplits?: number,
    public readonly forceCrossProtocol?: boolean,
    public readonly forceMixedRoutes?: boolean
  ) {}

  public toJSON(): ClassicConfigJSON {
    return {
      protocols: this.protocols.map((p: Protocol) => p.toString()),
      simulateFromAddress: this.simulateFromAddress,
      permitSignature: this.permitSignature,
      permitNonce: this.permitNonce,
      permitExpiration: this.permitExpiration,
      permitAmount: this.permitAmount?.toString(),
      permitSigDeadline: this.permitSigDeadline,
      enableUniversalRouter: this.enableUniversalRouter,
      slippageTolerance: this.slippageTolerance,
      deadline: this.deadline,
      gasPriceWei: this.gasPriceWei,
      minSplits: this.minSplits,
      forceCrossProtocol: this.forceCrossProtocol,
      forceMixedRoutes: this.forceMixedRoutes,
      routingType: 'CLASSIC',
    };
  }
}

export type RoutingConfig = DutchLimitConfig | ClassicConfig;
