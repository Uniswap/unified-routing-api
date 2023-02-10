import { Quote, QuoteRequest } from '../../../entities';
import { QuoteTransformer } from '..';

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
