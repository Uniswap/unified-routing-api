import { Quote, QuoteRequest } from '../../entities';

export * from './CompoundTransformer';
export * from './QuoteTransformers/OnlyConfiguredQuotersFilter';
export * from './QuoteTransformers/SyntheticUniswapXTransformer';
export * from './QuoteTransformers/UniswapXOrderSizeFilter';

export interface QuoteTransformer {
  transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}

export interface RequestTransformer {
  transform(requests: QuoteRequest[], gasPriceWei: string): QuoteRequest[];
}
