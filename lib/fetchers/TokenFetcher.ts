import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import {
  CachingTokenListProvider,
  ChainId,
  ITokenListProvider,
  ITokenProvider,
  NodeJSCache,
} from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { ValidationError } from '../util/errors';

export class TokenFetcher {
  private _tokenListProviders: Map<ChainId, ITokenProvider & ITokenListProvider> = new Map();

  private createTokenListProvider = (id: ChainId): ITokenProvider & ITokenListProvider => {
    return new CachingTokenListProvider(id, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
  };

  private getTokenListProvider(chainId: ChainId): ITokenProvider & ITokenListProvider {
    let tokenListProvider = this._tokenListProviders.get(chainId);
    if (tokenListProvider === undefined) {
      tokenListProvider = this.createTokenListProvider(chainId);
      this._tokenListProviders.set(chainId, tokenListProvider);
    }
    return tokenListProvider;
  }

  /**
   * Gets the token address for the provided token symbol or address from the DEFAULT_TOKEN_LIST.
   * Throws an error if the token is not found.
   */
  public getTokenAddressFromList = async (chainId: ChainId, symbolOrAddress: string): Promise<string> => {
    try {
      // try to parse address normal way
      return ethers.utils.getAddress(symbolOrAddress);
    } catch {
      // if invalid, try to parse as symbol
      const tokenListProvider = this.getTokenListProvider(chainId);
      const token = await tokenListProvider.getTokenBySymbol(symbolOrAddress);
      if (token === undefined) {
        throw new ValidationError(`Could not find token with symbol ${symbolOrAddress}`);
      }
      return token.address;
    }
  };
}
