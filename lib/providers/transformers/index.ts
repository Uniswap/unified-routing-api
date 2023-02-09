import { Quote, QuoteRequest } from '../../entities';

export * from './CompoundTransformer';
export * from './GoudaOrderSizeFilter';
export * from './OnlyConfiguredQuotersFilter';
export * from './SyntheticUniswapXTransformer';

export interface QuoteTransformer {
  transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}
