import { TradeType } from '@uniswap/sdk-core';
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
    const { tokenIn, tokenInChainId, tokenOut, tokenOutChainId, amount, type } = quoteRequest;
    const result = await axios.get(
      `${this.upaUrl}synthetic-switch/enabled?` +
        querystring.stringify({
          tokenIn,
          tokenInChainId,
          tokenOut,
          tokenOutChainId,
          amount: amount.toString(),
          type: TradeType[type],
        }),
      { headers: { 'x-api-key': this.paramApiKey } }
    );

    return {
      useSynthetic: result.data.useSynthetic,
    };
  }
}
