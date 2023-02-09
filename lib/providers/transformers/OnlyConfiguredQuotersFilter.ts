import Logger from 'bunyan';

import { Quote, QuoteRequest } from '../../entities';
import { QuoteTransformer } from '.';

// filters out any quote responses that came from unconfigured quoters
// sometimes we have to receive quotes even when not requested by the user
// i.e. from routing-api to get a basic price point
// this filter will remove any quotes that came from quoters that were not configured
export class OnlyConfiguredQuotersFilter implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'OnlyConfiguredQuotersFilter' });
  }

  async transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const configuredQuoters = requests.map((request) => request.routingType);
    return quotes.filter((quote) => {
      if (configuredQuoters.includes(quote.routingType)) {
        return true;
      }

      this.log.debug(`Removing quote from unconfigured quoter: ${quote.routingType}`);
      return false;
    });
  }
}
