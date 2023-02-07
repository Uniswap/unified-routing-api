import { QuoteRequest, QuoteResponse } from '../../entities';

export * from './CompoundFilter';
export * from './OnlyConfiguredQuotersFilter';

export interface QuoteFilter {
  filter(request: QuoteRequest, quotes: QuoteResponse[]): Promise<QuoteResponse[]>;
}
