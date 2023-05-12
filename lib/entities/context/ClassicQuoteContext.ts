import Logger from 'bunyan';
import { QuoteByKey, QuoteContext } from '.';
import { ClassicRequest, Quote, QuoteRequest } from '../../entities';

// manages context around a single top level classic quote request
export class ClassicQuoteContext implements QuoteContext {
  private log: Logger;

  constructor(_log: Logger, public request: ClassicRequest) {
    this.log = _log.child({ context: 'ClassicQuoteContext' });
  }

  // classic quotes have no explicit dependencies and can be resolved by themselves
  dependencies(): QuoteRequest[] {
    return [this.request];
  }

  resolve(dependencies: QuoteByKey): Quote | null {
    this.log.info({ dependencies }, 'Resolving classic quote');
    const quote = dependencies[this.request.key()];

    if (!quote) return null;

    return quote;
  }
}
