import { BigNumber } from 'ethers';
import { DutchInput, DutchLimitOrderInfo } from 'gouda-sdk';
import { QuoteResponse as ClassicQuoteResponse } from 'routing-api/lib/handlers/schema';

import { RoutingType } from './routing';

export { TradeType } from '@uniswap/sdk-core';

export type DutchLimitQuoteData = DutchLimitOrderInfo & {
  quoteId: string;
  routing: RoutingType;
};

export type DutchInputJSON = Omit<DutchInput, 'startAmount' | 'endAmount'> & {
  startAmount: string;
  endAmount: string;
};

export type DutchOutputJSON = DutchInputJSON & {
  recipient: string;
  isFeeOutput: boolean;
};

export type DutchLimitQuoteJSON = Omit<DutchLimitQuoteData, 'nonce' | 'routingType' | 'input' | 'outputs'> & {
  nonce: string;
  routing: string;
  input: DutchInputJSON;
  outputs: DutchOutputJSON[];
};

export type ClassicQuoteData = ClassicQuoteResponse & {
  routing: RoutingType;
};

export type ClassicQuoteJSON = Omit<ClassicQuoteData, 'routingType'> & {
  routing: string;z
};

export type QuoteData = DutchLimitQuoteData | ClassicQuoteData;

export type QuoteJSON = DutchLimitQuoteJSON | ClassicQuoteJSON;

export class DutchLimitQuote implements DutchLimitQuote {
  public static fromResponseBody(body: DutchLimitQuoteJSON): DutchLimitQuote {
    return new DutchLimitQuote({
      quoteId: 
      routing: RoutingType[body.routing as keyof typeof RoutingType],
      nonce: BigNumber.from(body.nonce),
      reactor: body.reactor,
      offerer: body.offerer,
      validationContract: body.validationContract,
      validationData: body.validationData,
      deadline: body.deadline,
      startTime: body.startTime,
      endTime: body.endTime,
      input: {
        ...body.input,
        startAmount: BigNumber.from(body.input.startAmount),
        endAmount: BigNumber.from(body.input.endAmount),
      },
      outputs: body.outputs.map((output) => ({
        ...output,
        startAmount: BigNumber.from(output.startAmount),
        endAmount: BigNumber.from(output.endAmount),
      })),
    });
  }

  constructor(private data: DutchLimitQuoteData) {}

  public toJSON(): DutchLimitQuoteJSON {
    return {
      ...this.data,
      nonce: this.data.nonce.toString(),
      input: {
        ...this.data.input,
        startAmount: this.data.input.startAmount.toString(),
        endAmount: this.data.input.endAmount.toString(),
      },
      outputs: this.data.outputs.map((output) => ({
        ...output,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
      })),
    };
  }

  public get routing(): RoutingType {
    return this.data.routing;
  }

  public get quoteId(): string {
    return this.data.quoteId;
  }

  public get nonce(): BigNumber {
    return this.data.nonce;
  }

  public get input(): DutchInput {
    return this.data.input;
  }

  public get outputs(): DutchOutput[] {
    return this.data.outputs;
  }
}
