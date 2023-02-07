import { Quote, QuoteRequest } from '../../entities';
import { QuoteFilter } from '.';

// filters out any quote responses that came from unconfigured quoters
// sometimes we have to receive quotes even when not requested by the user
// i.e. from routing-api to get a basic price point
// this filter will remove any quotes that came from quoters that were not configured
export class CompoundFilter implements QuoteFilter {
  constructor(private filters: QuoteFilter[]) {}

  async filter(request: QuoteRequest, quotes: Quote[]): Promise<Quote[]> {
    let result: Quote[] = quotes;
    for (const filter of this.filters) {
      result = await filter.filter(request, result);
    }
    return result;
  }
}
