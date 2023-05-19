import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import {
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  ChainId,
  NodeJSCache,
  TokenProvider,
  UniswapMulticallProvider,
} from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { ValidationError } from './errors';
import { Token } from '@uniswap/sdk-core'

export const ARBITRUM_TIMEOUT = 8000;
export const DEFAULT_TIMEOUT = 5000;

export const getTokenListProvider = (id: ChainId) => {
  return new CachingTokenListProvider(id, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
};

export const getTokenProvider = (chainId: ChainId) => {
  let timeout: number;
  switch (chainId) {
    case ChainId.ARBITRUM_ONE:
    case ChainId.ARBITRUM_RINKEBY:
      timeout = ARBITRUM_TIMEOUT;
      break;
    default:
      timeout = DEFAULT_TIMEOUT;
      break;
  }

  const rpcUrl = process.env[`RPC_${chainId}`];
  if (!rpcUrl) {
    throw new Error(`RPC_${chainId} is not defined`);
  }

  const provider = new ethers.providers.JsonRpcProvider(
    {
      url: rpcUrl,
      timeout,
    },
    chainId
  );

  const tokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }));

  const multicall2Provider = new UniswapMulticallProvider(chainId, provider, 375_000);
  return new CachingTokenProviderWithFallback(
    chainId,
    tokenCache,
    getTokenListProvider(chainId),
    new TokenProvider(chainId, multicall2Provider)
  );
};

export const getAddress = async (id: ChainId, symbolOrAddress: string): Promise<string> => {
  try {
    // try to parse address normal way
    return ethers.utils.getAddress(symbolOrAddress);
  } catch {
    // if invalid, try to parse as symbol
    const tokenListProvider = getTokenListProvider(id);
    const token = await tokenListProvider.getTokenBySymbol(symbolOrAddress);
    // if the token is not defined then throw
    if (token === undefined) {
      throw new ValidationError(`Could not find token with symbol ${symbolOrAddress}`);
    }
    return token.address;
  }
};
