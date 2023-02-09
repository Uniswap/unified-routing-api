import { Quote, QuoteRequest } from '../../entities';

export * from './CompoundTransformer';
export * from './OnlyConfiguredQuotersFilter';
export * from './SyntheticUniswapXTransformer';
export * from './UniswapXOrderSizeFilter';

export interface QuoteTransformer {
  transform(originalRequests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}

export interface QuoteRequestTransformer {
  transform(originalRequests: QuoteRequest[], currentRequests: QuoteRequest[]): Promise<QuoteRequest[]>;
}
