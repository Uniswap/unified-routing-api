import { RequestTransformer } from '..';
import { RequestsByRoutingType } from '../../../entities/request/index';

export class CompoundRequestTransformer implements RequestTransformer {
  constructor(private inserters: RequestTransformer[], private filters: RequestTransformer[]) {}

  transform(requests: RequestsByRoutingType) {
    for (const transformer of this.inserters) {
      transformer.transform(requests);
    }
    for (const transformer of this.filters) {
      transformer.transform(requests);
    }
  }
}
