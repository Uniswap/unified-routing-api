import Logger from 'bunyan';
import { DutchQuoteContext, DutchQuoteContextProviders, QuoteByKey } from '.';
import { RoutingType } from '../../constants';
import { DutchQuote, DutchV2Quote, DutchV2Request, Quote } from '../../entities';

// use all standard quote generation logic from v1
// but rebuild order in v2 format
export class DutchV2QuoteContext extends DutchQuoteContext {
  public routingType = RoutingType.DUTCH_V2;

  constructor(_log: Logger, public originalRequest: DutchV2Request, providers: DutchQuoteContextProviders) {
    super(_log, originalRequest.toDutchRequest(), providers);
  }

  // return either the rfq quote or a synthetic quote from the classic dependency
  async resolve(dependencies: QuoteByKey): Promise<Quote | null> {
    const quote = await super.resolve(dependencies);
    if (!quote) return null;
    return DutchV2Quote.fromV1Quote(this.originalRequest, quote as DutchQuote);
  }
}
