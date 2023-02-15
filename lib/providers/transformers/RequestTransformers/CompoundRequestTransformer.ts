import { RequestTransformer } from '..';
import { QuoteRequest } from '../../../entities';

export class CompoundRequestTransformer implements RequestTransformer {
  constructor(private inserters: RequestTransformer[], private filters: RequestTransformer[]) {}

  transform(requests: QuoteRequest[]): QuoteRequest[] {
    let result: QuoteRequest[] = requests;
    for (const transformer of this.inserters) {
      result = transformer.transform(result);
    }
    for (const transformer of this.filters) {
      result = transformer.transform(result);
    }
    return result;
  }
}
