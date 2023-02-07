import { Quote, QuoteRequest } from '../../entities';
import { RoutingConfig } from '../../entities/routing';

export * from './RfqQuoter';
export * from './RoutingApiQuoter';

export enum QuoterType {
  ROUTING_API = 'ROUTING_API',
  GOUDA_RFQ = 'GOUDA_RFQ',
}

export interface Quoter {
  quote(params: QuoteRequest, config: RoutingConfig): Promise<Quote>;
}
