import { QuoteRequest, Quote } from '../../entities';

export * from './CompoundFilter';
export * from './OnlyConfiguredQuotersFilter';

export interface QuoteFilter {
  filter(request: QuoteRequest, quotes: Quote[]): Promise<Quote[]>;
}
