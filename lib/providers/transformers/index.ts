import { Quote, QuoteRequest, RequestsByRoutingType } from '../../entities';

export * from './RequestTransformers';

export interface QuoteTransformer {
  transform(requests: QuoteRequest[], quotes: Quote[]): Promise<Quote[]>;
}

export interface RequestTransformer {
  transform(requests: RequestsByRoutingType): void;
}
