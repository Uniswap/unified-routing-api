import Logger from 'bunyan';

import { Quote, QuoteRequest, RequestByRoutingType } from '../../../entities';
import { QuoteTransformer } from '..';

// filters out any quote responses that came from unconfigured quoters
// sometimes we have to receive quotes even when not requested by the user
// i.e. from routing-api to get a basic price point
// this filter will remove any quotes that came from quoters that were not configured
export class OnlyConfiguredQuotersFilter implements QuoteTransformer {
  private log: Logger;

  constructor(_log: Logger) {
    this.log = _log.child({ quoter: 'OnlyConfiguredQuotersFilter' });
  }

  async transform(originalRequests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]> {
    const requestByRoutingType: RequestByRoutingType = {};
    originalRequests.forEach((r) => (requestByRoutingType[r.routingType] = r));

    return quotes.filter((quote) => {
      const request = requestByRoutingType[quote.routingType];
      if (!request) {
        this.log.debug(`Removing quote from unconfigured quoter type: ${quote.routingType}`);
        return false;
      }

      const requestInfo = request.info;
      const quoteInfo = quote.request.info;
      if (
        requestInfo.tokenIn !== quoteInfo.tokenIn ||
        requestInfo.tokenOut !== quoteInfo.tokenOut ||
        !requestInfo.amount.eq(quoteInfo.amount) ||
        requestInfo.type !== quoteInfo.type
      ) {
        this.log.debug('Removing quote from unconfigured quoter info', requestInfo, quoteInfo);
        return false;
      }

      return true;
    });
  }
}
