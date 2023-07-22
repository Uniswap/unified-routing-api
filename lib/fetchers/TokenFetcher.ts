import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';

import { ChainId } from '@uniswap/sdk-core';
import {
  CachingTokenListProvider,
  ITokenListProvider,
  ITokenProvider,
  NATIVE_NAMES_BY_ID,
  NodeJSCache,
} from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { NATIVE_ADDRESS } from '../constants';
import { ValidationError } from '../util/errors';

type ITokenFetcherProvider = ITokenListProvider & ITokenProvider;
export class TokenFetcher {
  private _tokenListProviders: Map<ChainId, ITokenFetcherProvider> = new Map();

  private createTokenListProvider = (chainId: ChainId): ITokenFetcherProvider => {
    return new CachingTokenListProvider(chainId, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
  };

  /**
   * Gets the token list provider for the provided chainId. Creates a new one if it doesn't exist.
   * Allows us to cache the token list provider for each chainId for the lifetime of the lambda.
   */
  private getTokenListProvider(chainId: ChainId): ITokenFetcherProvider {
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
  public resolveTokenAddress = async (chainId: ChainId, symbolOrAddress: string): Promise<string> => {
    // check for native symbols first
    if (NATIVE_NAMES_BY_ID[chainId]!.includes(symbolOrAddress) || symbolOrAddress == NATIVE_ADDRESS) {
      return NATIVE_ADDRESS;
    }

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
