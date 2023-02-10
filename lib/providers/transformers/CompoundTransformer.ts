import { QuoteTransformer } from '.';
import { Quote, QuoteRequest } from '../../entities';
import { RequestTransformer } from './index';

/*
applies all supplied transformers one by one, in order
*/
export class CompoundQuoteTransformer implements QuoteTransformer {
  constructor(private transformers: QuoteTransformer[]) {}

  async transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    let result: Quote[] = quotes;
    for (const transformer of this.transformers) {
      result = await transformer.transform(requests, result);
    }
    return result;
  }
}

export class CompoundRequestTransformer implements RequestTransformer {
  constructor(private transformers: RequestTransformer[]) {}

  transform(requests: QuoteRequest[]): QuoteRequest[] {
    let result: QuoteRequest[] = requests;
    for (const transformer of this.transformers) {
      result = transformer.transform(requests);
    }
    return result;
  }
}
