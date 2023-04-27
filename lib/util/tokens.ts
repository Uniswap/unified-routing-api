import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { CachingTokenListProvider, ChainId, NodeJSCache } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';

export const getTokenListProvider = (id: ChainId) => {
  return new CachingTokenListProvider(id, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
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
      throw new Error(`Could not find token with symbol ${symbolOrAddress}`);
    }
    return token.address;
  }
};
