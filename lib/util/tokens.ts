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
import { NATIVE_ADDRESS } from '../constants';

export const getTokenListProvider = (id: ChainId) => {
  return new CachingTokenListProvider(id, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
};

export const getTokenProvider = (chainId: ChainId) => {
  let timeout: number;
  switch (chainId) {
    case ChainId.ARBITRUM_ONE:
    case ChainId.ARBITRUM_RINKEBY:
      timeout = 8000;
      break;
    default:
      timeout = 5000;
      break;
  }

  const rpcUrl = process.env[`RPC_${chainId}`]
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
  if (symbolOrAddress === 'ETH') {
    return NATIVE_ADDRESS;
  }

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

export const getDecimals = async (chainId: ChainId, address: string): Promise<number> => {
  // if invalid, try to parse as symbol
  const tokenProvider = getTokenProvider(chainId);
  const tokenAccessor = await tokenProvider.getTokens([address]);
  const token = tokenAccessor.getTokenByAddress(address);
  // if the token is not defined then throw
  if (token === undefined) {
    throw new ValidationError(`Could not find token with symbol ${address}`);
  }
  return token.decimals;
};
