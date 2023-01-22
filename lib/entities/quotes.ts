import { BigNumber } from 'ethers';
import { DutchInput, DutchLimitOrderInfo, DutchLimitOrderInfoJSON, DutchOutput } from 'gouda-sdk';
import { QuoteResponse as ClassicQuoteResponse } from 'routing-api/lib/handlers/schema';

import { RoutingType } from './routing';

export { TradeType } from '@uniswap/sdk-core';

export type DutchLimitQuoteData = DutchLimitOrderInfo & {
  quoteId: string;
  routing: RoutingType;
};

export type DutchLimitQuoteJSON = DutchLimitOrderInfoJSON & {
  quoteId: string;
  routing: string;
};

export type ClassicQuoteData = ClassicQuoteResponse & {
  routing: RoutingType;
};

export type ClassicQuoteJSON = Omit<ClassicQuoteData, 'routingType'> & {
  routing: string;
};

export type QuoteData = DutchLimitQuoteData | ClassicQuoteData;

export type QuoteJSON = DutchLimitQuoteJSON | ClassicQuoteJSON;

export class DutchLimitQuote implements DutchLimitQuoteData {
  public static fromResponseBody(body: DutchLimitQuoteJSON): DutchLimitQuote {
    return new DutchLimitQuote(
      body.quoteId,
      RoutingType[body.routing as keyof typeof RoutingType],
      BigNumber.from(body.nonce),
      body.reactor,
      body.offerer,
      body.validationContract,
      body.validationData,
      body.deadline,
      body.startTime,
      body.endTime,
      {
        ...body.input,
        startAmount: BigNumber.from(body.input.startAmount),
        endAmount: BigNumber.from(body.input.endAmount),
      },
      body.outputs.map((output) => ({
        ...output,
        startAmount: BigNumber.from(output.startAmount),
        endAmount: BigNumber.from(output.endAmount),
      }))
    );
  }

  constructor(
    public readonly quoteId: string,
    public readonly routing: RoutingType,
    public readonly nonce: BigNumber,
    public readonly reactor: string,
    public readonly offerer: string,
    public readonly validationContract: string,
    public readonly validationData: string,
    public readonly deadline: number,
    public readonly startTime: number,
    public readonly endTime: number,
    public readonly input: DutchInput,
    public readonly outputs: DutchOutput[]
  ) {}

  public toJSON(): DutchLimitQuoteJSON {
    return {
      quoteId: this.quoteId,
      routing: RoutingType[this.routing],
      nonce: this.nonce.toString(),
      reactor: this.reactor,
      offerer: this.offerer,
      validationContract: this.validationContract,
      validationData: this.validationData,
      deadline: this.deadline,
      startTime: this.startTime,
      endTime: this.endTime,
      input: {
        ...this.input,
        startAmount: this.input.startAmount.toString(),
        endAmount: this.input.endAmount.toString(),
      },
      outputs: this.outputs.map((output) => ({
        ...output,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
      })),
    };
  }
}
