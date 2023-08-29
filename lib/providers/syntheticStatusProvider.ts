import querystring from 'querystring';
import { QuoteRequestInfo } from '../entities';
import axios from './quoters/helpers';

export type SyntheticStatus = {
  useSynthetic: boolean;
};

export interface SyntheticStatusProvider {
  getStatus(quoteRequest: QuoteRequestInfo): Promise<SyntheticStatus>;
}

// fetches synthetic status from UniswapX Param API
// TODO: add caching wrapper? Probably dont want to cache too aggressively
// at risk of missing an important switch-off
export class UPASyntheticStatusProvider implements SyntheticStatusProvider {
  constructor(private upaUrl: string, private paramApiKey: string) {}

  async getStatus(quoteRequest: QuoteRequestInfo): Promise<SyntheticStatus> {
    const { tokenIn, tokenOut, amount } = quoteRequest;
    const result = await axios.get(
      `${this.upaUrl}synthetic-quote/enabled?` +
        querystring.stringify({
          tokenIn,
          tokenOut,
          amount: amount.toString(),
        }),
      { headers: { 'x-api-key': this.paramApiKey } }
    );

    return {
      useSynthetic: result.data.useSynthetic,
    };
  }
}
