import { Quote, QuoteRequest } from '../../entities';

export * from './QuoteTransformers';
export * from './RequestTransformers';

export interface QuoteTransformer {
  transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}

export interface RequestTransformer {
  transform(requests: QuoteRequest[]): QuoteRequest[];
}
