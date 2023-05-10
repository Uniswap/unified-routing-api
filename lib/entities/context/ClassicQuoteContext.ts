import { QuoteContext } from '.';
import { ClassicRequest, Quote, QuoteRequest } from '../../entities';

// manages context around a single top level classic quote request
export class ClassicQuoteContext implements QuoteContext {
  constructor(public request: ClassicRequest) {}

  // classic quotes have no explicit dependencies and can be resolved by themselves
  // other than their original one
  dependencies(): QuoteRequest[] {
    return [];
  }

  resolve(dependencies: (Quote | null)[]): Quote | null {
    if (dependencies.length !== 1) {
      throw new Error(`Invalid quote result: ${dependencies}`);
    }

    if (dependencies[0] === null) return null;

    return dependencies[0];
  }
}
