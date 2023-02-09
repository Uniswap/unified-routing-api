import { QuoteTransformer } from '.';
import { Quote, QuoteRequest } from '../../entities';

/*
applies all supplied transformers one by one, in order
*/
export class CompoundTransformer implements QuoteTransformer {
  constructor(private transformers: QuoteTransformer[]) {}

  async transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    let result: Quote[] = quotes;
    for (const transformer of this.transformers) {
      result = await transformer.transform(requests, result);
    }
    return result;
  }
}
