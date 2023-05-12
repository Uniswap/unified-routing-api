import Logger from 'bunyan';
import { QuoteContext } from '.';
import { ClassicRequest, Quote, QuoteRequest } from '../../entities';

// manages context around a single top level classic quote request
export class ClassicQuoteContext implements QuoteContext {
  private log: Logger;

  constructor(_log: Logger, public request: ClassicRequest) {
    this.log = _log.child({ context: 'DutchQuoteContext' });
  }

  // classic quotes have no explicit dependencies and can be resolved by themselves
  dependencies(): QuoteRequest[] {
    return [];
  }

  resolve(dependencies: (Quote | null)[]): Quote | null {
    this.log.info({ dependencies }, 'Resolving classic quote');
    if (dependencies.length !== 1) {
      throw new Error(`Invalid quote result: ${dependencies}`);
    }

    if (dependencies[0] === null) return null;

    return dependencies[0];
  }
}
