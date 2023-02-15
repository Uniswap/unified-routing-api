import { RequestTransformer } from '..';
import { QuoteRequest } from '../../../entities';

export class CompoundRequestTransformer implements RequestTransformer {
  constructor(private inserters: RequestTransformer[], private filters: RequestTransformer[]) {}

  transform(requests: QuoteRequest[]): QuoteRequest[] {
    let result: QuoteRequest[] = requests;
    for (const transformer of this.inserters) {
      result = transformer.transform(requests);
    }
    for (const transformer of this.filters) {
      result = transformer.transform(requests);
    }
    return result;
  }
}
