import { QuoteTransformer } from '..';
import { Quote, QuoteRequest } from '../../../entities';

export class CompoundQuoteTransformer implements QuoteTransformer {
  constructor(private inserters: QuoteTransformer[], private filters: QuoteTransformer[]) {}

  async transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    let result: Quote[] = quotes;
    for (const transformer of this.inserters) {
      result = await transformer.transform(requests, result);
    }
    for (const transformer of this.filters) {
      result = await transformer.transform(requests, result);
    }
    return result;
  }
}
