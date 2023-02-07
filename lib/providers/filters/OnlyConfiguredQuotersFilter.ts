import Logger from 'bunyan';

import { QuoteRequest, QuoteResponse } from '../../entities';
import { QuoteFilter } from '.';

// filters out any quote responses that came from unconfigured quoters
// sometimes we have to receive quotes even when not requested by the user
// i.e. from routing-api to get a basic price point
// this filter will remove any quotes that came from quoters that were not configured
export class OnlyConfiguredQuotersFilter implements QuoteFilter {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'OnlyConfiguredQuotersFilter' });
  }

  async filter(request: QuoteRequest, quotes: QuoteResponse[]): Promise<QuoteResponse[]> {
    const configuredQuoters = request.configs.map((config) => config.routingType);
    return quotes.filter((quote) => {
      if (configuredQuoters.includes(quote.routing)) {
        return true;
      }

      this.log.debug(`Removing quote from unconfigured quoter: ${quote.routing}`);
      return false;
    });
  }
}
