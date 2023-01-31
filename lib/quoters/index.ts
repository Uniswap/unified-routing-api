import { QuoteRequest } from '../entities/QuoteRequest';
import { QuoteResponse } from '../entities/QuoteResponse';

export enum QuoterType {
  ROUTING_API = 'ROUTING_API',
  GOUDA_RFQ = 'GOUDA_RFQ',
}

export interface Quoter {
  quote(params: QuoteRequest): Promise<QuoteResponse>;
}
