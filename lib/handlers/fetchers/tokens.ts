import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Token } from '@uniswap/sdk-core';
import {
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  ChainId,
  ITokenListProvider,
  ITokenProvider,
  NodeJSCache,
  TokenProvider,
  UniswapMulticallProvider,
} from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { ValidationError } from '../../util/errors';

export class TokenFetcher {
  private static ARBITRUM_TIMEOUT = 8000;
  private static DEFAULT_TIMEOUT = 5000;
  private _tokenListProviders: Map<number, ITokenProvider & ITokenListProvider> = new Map();
  private _tokenProviders: Map<number, ITokenProvider> = new Map();

  private static getTimeout(chainId: number): number {
    let timeout: number;
    switch (chainId) {
      case ChainId.ARBITRUM_ONE:
      case ChainId.ARBITRUM_RINKEBY:
        timeout = TokenFetcher.ARBITRUM_TIMEOUT;
        break;
      default:
        timeout = TokenFetcher.DEFAULT_TIMEOUT;
        break;
    }
    return timeout;
  }

  private createTokenListProvider = (id: ChainId): ITokenProvider & ITokenListProvider => {
    return new CachingTokenListProvider(id, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
  };

  private createTokenProvider = (chainId: ChainId): ITokenProvider => {
    const rpcUrl = process.env[`RPC_${chainId}`];
    if (!rpcUrl) {
      throw new Error(`RPC_${chainId} is not defined`);
    }

    const provider = new ethers.providers.JsonRpcProvider(
      {
        url: rpcUrl,
        timeout: TokenFetcher.getTimeout(chainId),
      },
      chainId
    );

    const tokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }));

    const multicall2Provider = new UniswapMulticallProvider(chainId, provider, 375_000);
    return new CachingTokenProviderWithFallback(
      chainId,
      tokenCache,
      this.createTokenListProvider(chainId),
      new TokenProvider(chainId, multicall2Provider)
    );
  };

  private getTokenProvider(chainId: number): ITokenProvider {
    let tokenProvider = this._tokenProviders.get(chainId);
    if (tokenProvider === undefined) {
      tokenProvider = this.createTokenProvider(chainId);
      this._tokenProviders.set(chainId, tokenProvider);
      return tokenProvider;
    }
    return tokenProvider;
  }

  private getTokenListProvider(chainId: number): ITokenProvider & ITokenListProvider {
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

  /**
   * Gets the token for the provided address from an RPC connection or the cache.
   * Throws an error if the token is not found.
   *
   */
  public getTokenByAddress = async (chainId: ChainId, address: string): Promise<Token> => {
    const tokenProvider = this.getTokenProvider(chainId);
    const tokenAccessor = await tokenProvider.getTokens([address]);
    const token = tokenAccessor.getTokenByAddress(address);
    if (token === undefined) {
      throw new Error(`Could not find token with symbol ${address}`);
    }
    return token;
  };
}
