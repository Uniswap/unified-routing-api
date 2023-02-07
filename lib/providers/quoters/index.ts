import { Quote, QuoteRequest } from '../../entities';

export * from './RfqQuoter';
export * from './RoutingApiQuoter';

export enum QuoterType {
  ROUTING_API = 'ROUTING_API',
  GOUDA_RFQ = 'GOUDA_RFQ',
}

export interface Quoter {
  quote(params: QuoteRequest): Promise<Quote | null>;
}
