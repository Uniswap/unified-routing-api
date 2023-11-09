import { TradeType } from '@uniswap/sdk-core';
import querystring from 'querystring';
import { QuoteRequestInfo } from '../entities';
import { log } from '../util/log';
import axios from './quoters/helpers';

export type SyntheticStatus = {
  syntheticEnabled: boolean;
};

export interface SyntheticStatusProvider {
  getStatus(quoteRequest: QuoteRequestInfo): Promise<SyntheticStatus>;
}

// fetches synthetic status from UniswapX Param API
// TODO: add caching wrapper? Probably dont want to cache too aggressively
// at risk of missing an important switch-off
export class UPASyntheticStatusProvider implements SyntheticStatusProvider {
  constructor(private upaUrl: string, private paramApiKey: string) {
    // empty constructor
  }

  async getStatus(quoteRequest: QuoteRequestInfo): Promise<SyntheticStatus> {
    const { tokenIn, tokenInChainId, tokenOut, tokenOutChainId, amount, type } = quoteRequest;

    try {
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

      log.info(`Synthetic status for ${tokenIn} -> ${tokenOut}: ${result.data}`);
      return {
        syntheticEnabled: result.data.enabled,
      };
    } catch (e) {
      log.error('Error fetching synthetic status from UPA', e);
      return {
        syntheticEnabled: false,
      };
    }
  }
}

// disabled synthetic status
export class DisabledSyntheticStatusProvider implements SyntheticStatusProvider {
  constructor() {}

  async getStatus(_quoteRequest: QuoteRequestInfo): Promise<SyntheticStatus> {
    return {
      syntheticEnabled: false,
    };
  }
}
