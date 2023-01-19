import { Protocol } from '@uniswap/router-sdk';
import { BigNumber } from 'ethers';

export enum RoutingType {
  CLASSIC = 'CLASSIC',
  DUTCH_LIMIT = 'DUTCH_LIMIT',
}

export interface RoutingConfigData {
  routingType: RoutingType;
}

export interface DutchLimitConfigData extends RoutingConfigData {
  offerer: string;
  exclusivePeriodSecs: number;
  auctionPeriodSecs: number;
}

export interface DutchLimitConfigJSON extends Omit<DutchLimitConfigData, 'routingType'> {
  routingType: string;
}

export interface ClassicConfigData extends RoutingConfigData {
  protocols: Protocol[];
  gasPriceWei: string;
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
  routingType: string;
  protocols: string[];
  permitAmount?: string;
}

export type RoutingConfigJSON = DutchLimitConfigJSON | ClassicConfigJSON;

export class DutchLimitConfig implements DutchLimitConfigData {
  public static fromRequestBody(body: DutchLimitConfigJSON): DutchLimitConfig {
    return new DutchLimitConfig({
      offerer: body.offerer,
      exclusivePeriodSecs: body.exclusivePeriodSecs,
      auctionPeriodSecs: body.auctionPeriodSecs,
      routingType: RoutingType.DUTCH_LIMIT,
    });
  }

  constructor(private data: DutchLimitConfigData) {}

  public toJSON() {
    return {
      offerer: this.data.offerer,
      exclusivePeriodSecs: this.data.exclusivePeriodSecs,
      auctionPeriodSecs: this.data.auctionPeriodSecs,
      routingType: this.data.routingType,
    };
  }

  public get routingType(): RoutingType {
    return this.data.routingType;
  }

  public get offerer(): string {
    return this.data.offerer;
  }

  public get exclusivePeriodSecs(): number {
    return this.data.exclusivePeriodSecs;
  }

  public get auctionPeriodSecs(): number {
    return this.data.auctionPeriodSecs;
  }
}

export class ClassicConfig implements RoutingConfigData {
  public static fromRequestBody(body: ClassicConfigJSON): ClassicConfig {
    return new ClassicConfig({
      // protocols: body.protocols.map((p: string) => ClassicProtocols[p as keyof typeof ClassicProtocols]),
      protocols: body.protocols.flatMap((p: string) => {
        if (p in Protocol) {
          return [Protocol[p as keyof typeof Protocol]];
        } else {
          return [];
        }
      }),
      simulateFromAddress: body.simulateFromAddress,
      permitSignature: body.permitSignature,
      permitNonce: body.permitNonce,
      permitExpiration: body.permitExpiration,
      permitAmount: body.permitAmount ? BigNumber.from(body.permitAmount) : undefined,
      permitSigDeadline: body.permitSigDeadline,
      enableUniversalRouter: body.enableUniversalRouter,
      slippageTolerance: body.slippageTolerance,
      deadline: body.deadline,
      gasPriceWei: body.gasPriceWei,
      minSplits: body.minSplits,
      forceCrossProtocol: body.forceCrossProtocol,
      forceMixedRoutes: body.forceMixedRoutes,
      routingType: RoutingType.CLASSIC,
    });
  }

  constructor(private data: ClassicConfigData) {}

  public toJSON(): ClassicConfigJSON {
    return {
      protocols: this.data.protocols.map((p: Protocol) => p.toString()),
      simulateFromAddress: this.data.simulateFromAddress,
      permitSignature: this.data.permitSignature,
      permitNonce: this.data.permitNonce,
      permitExpiration: this.data.permitExpiration,
      permitAmount: this.data.permitAmount?.toString(),
      permitSigDeadline: this.data.permitSigDeadline,
      enableUniversalRouter: this.data.enableUniversalRouter,
      slippageTolerance: this.data.slippageTolerance,
      deadline: this.data.deadline,
      gasPriceWei: this.data.gasPriceWei,
      minSplits: this.data.minSplits,
      forceCrossProtocol: this.data.forceCrossProtocol,
      forceMixedRoutes: this.data.forceMixedRoutes,
      routingType: this.data.routingType,
    };
  }

  public get routingType(): RoutingType {
    return this.data.routingType;
  }

  public get protocols(): Protocol[] {
    return this.data.protocols;
  }

  public get simulateFromAddress(): string | undefined {
    return this.data.simulateFromAddress;
  }

  public get permitSignature(): string | undefined {
    return this.data.permitSignature;
  }
  public get permitNonce(): string | undefined {
    return this.data.permitNonce;
  }

  public get permitExpiration(): string | undefined {
    return this.data.permitExpiration;
  }

  public get permitAmount(): BigNumber | undefined {
    return this.data.permitAmount;
  }

  public get permitSigDeadline(): number | undefined {
    return this.data.permitSigDeadline;
  }

  public get enableUniversalRouter(): boolean | undefined {
    return this.data.enableUniversalRouter;
  }

  public get slippageTolerance(): number | undefined {
    return this.data.slippageTolerance;
  }

  public get deadline(): number | undefined {
    return this.data.deadline;
  }

  public get gasPriceWei(): string | undefined {
    return this.data.gasPriceWei;
  }

  public get minSplits(): number | undefined {
    return this.data.minSplits;
  }

  public get forceCrossProtocol(): boolean | undefined {
    return this.data.forceCrossProtocol;
  }

  public get forceMixedRoutes(): boolean | undefined {
    return this.data.forceMixedRoutes;
  }
}

export type RoutingConfig = DutchLimitConfig | ClassicConfig;
