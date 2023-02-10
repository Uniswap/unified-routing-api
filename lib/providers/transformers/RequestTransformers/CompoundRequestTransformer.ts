import { QuoteRequest } from '../../../entities';
import { RequestTransformer } from '..';

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
