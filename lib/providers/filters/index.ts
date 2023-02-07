import { Quote, QuoteRequest } from '../../entities';

export * from './CompoundFilter';
export * from './OnlyConfiguredQuotersFilter';

export interface QuoteFilter {
  filter(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}
