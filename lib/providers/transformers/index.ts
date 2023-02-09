import { Quote, QuoteRequest } from '../../entities';

export * from './CompoundTransformer';
export * from './OnlyConfiguredQuotersFilter';
export * from './SyntheticUniswapXTransformer';
export * from './UniswapXOrderSizeFilter';

export interface QuoteTransformer {
  transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}
