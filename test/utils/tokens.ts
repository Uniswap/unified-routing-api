import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { ChainId, Token } from '@uniswap/sdk-core';
import {
  CachingTokenListProvider,
  DAI_ARBITRUM,
  DAI_AVAX,
  DAI_BNB,
  DAI_GOERLI,
  DAI_MAINNET,
  DAI_OPTIMISM,
  DAI_OPTIMISM_GOERLI,
  DAI_POLYGON,
  DAI_POLYGON_MUMBAI,
  DAI_SEPOLIA,
  NodeJSCache,
  USDC_ARBITRUM,
  USDC_AVAX,
  USDC_BASE,
  USDC_BASE_GOERLI,
  USDC_BNB,
  USDC_GOERLI,
  USDC_MAINNET,
  USDC_OPTIMISM,
  USDC_OPTIMISM_GOERLI,
  USDC_POLYGON,
  USDC_POLYGON_MUMBAI,
  USDC_SEPOLIA, USDCE_ZKSYNC,
  USDT_ARBITRUM,
  USDT_BNB,
  USDT_GOERLI,
  USDT_MAINNET,
  USDT_OPTIMISM,
  WRAPPED_NATIVE_CURRENCY
} from '@uniswap/smart-order-router';
import { BigNumber, ethers } from 'ethers';
import NodeCache from 'node-cache';

export const getTokenListProvider = (id: ChainId) => {
  return new CachingTokenListProvider(id, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));
};

export const getAmount = async (id: ChainId, type: string, symbolIn: string, symbolOut: string, amount: string) => {
  if (type == 'EXACT_INPUT' ? symbolIn == 'ETH' : symbolOut == 'ETH') {
    return ethers.utils.parseUnits(amount, 18).toString();
  }

  const tokenListProvider = getTokenListProvider(id);
  const decimals = (await tokenListProvider.getTokenBySymbol(type == 'EXACT_INPUT' ? symbolIn : symbolOut))!.decimals;

  return ethers.utils.parseUnits(amount, decimals).toString();
};

export const getAmountFromToken = async (type: string, tokenIn: Token, tokenOut: Token, amount: string) => {
  const decimals = (type == 'EXACT_INPUT' ? tokenIn : tokenOut).decimals;
  return ethers.utils.parseUnits(amount, decimals).toString();
};

export const UNI_MAINNET = new Token(
  ChainId.MAINNET,
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  18,
  'UNI',
  'Uniswap'
);

export const UNI_GORLI = new Token(
  ChainId.GOERLI,
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  18,
  'UNI',
  'Uni token'
);

export const BUSD_MAINNET = new Token(
  ChainId.MAINNET,
  '0x4fabb145d64652a948d72533023f6e7a623c7c53',
  18,
  'BUSD',
  'BUSD Token'
);

export const agEUR_MAINNET = new Token(
  ChainId.MAINNET,
  '0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8',
  18,
  'agEUR',
  'agEur'
);

export const GUSD_MAINNET = new Token(
  ChainId.MAINNET,
  '0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd',
  2,
  'GUSD',
  'Gemini dollar'
);

export const LUSD_MAINNET = new Token(
  ChainId.MAINNET,
  '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
  18,
  'LUSD',
  'LUSD Stablecoin'
);

export const EUROC_MAINNET = new Token(
  ChainId.MAINNET,
  '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c',
  6,
  'EUROC',
  'EUROC'
);

export const XSGD_MAINNET = new Token(ChainId.MAINNET, '0x70e8dE73cE538DA2bEEd35d14187F6959a8ecA96', 6, 'XSGD', 'XSGD');

export const BULLET = new Token(
  ChainId.MAINNET,
  '0x8ef32a03784c8Fd63bBf027251b9620865bD54B6',
  8,
  'BULLET',
  'Bullet Game Betting Token'
);
export const BULLET_WHT_FOT_TAX = new Token(
  ChainId.MAINNET,
  '0x8ef32a03784c8Fd63bBf027251b9620865bD54B6',
  8,
  'BULLET',
  'Bullet Game Betting Token',
  false,
  BigNumber.from(500),
  BigNumber.from(500)
);

export const DAI_ON = (chainId: ChainId): Token => {
  switch (chainId) {
    case ChainId.MAINNET:
      return DAI_MAINNET;
    case ChainId.GOERLI:
      return DAI_GOERLI;
    case ChainId.SEPOLIA:
      return DAI_SEPOLIA;
    case ChainId.OPTIMISM:
      return DAI_OPTIMISM;
    case ChainId.OPTIMISM_GOERLI:
      return DAI_OPTIMISM_GOERLI;
    case ChainId.ARBITRUM_ONE:
      return DAI_ARBITRUM;
    case ChainId.POLYGON:
      return DAI_POLYGON;
    case ChainId.POLYGON_MUMBAI:
      return DAI_POLYGON_MUMBAI;
    case ChainId.BNB:
      return DAI_BNB;
    case ChainId.AVALANCHE:
      return DAI_AVAX;
    default:
      throw new Error(`Chain id: ${chainId} not supported`);
  }
};

export const USDT_ON = (chainId: ChainId): Token => {
  switch (chainId) {
    case ChainId.MAINNET:
      return USDT_MAINNET;
    case ChainId.GOERLI:
      return USDT_GOERLI;
    case ChainId.OPTIMISM:
      return USDT_OPTIMISM;
    case ChainId.ARBITRUM_ONE:
      return USDT_ARBITRUM;
    case ChainId.BNB:
      return USDT_BNB;
    default:
      throw new Error(`Chain id: ${chainId} not supported`);
  }
};

export const USDC_ON = (chainId: ChainId): Token => {
  switch (chainId) {
    case ChainId.MAINNET:
      return USDC_MAINNET;
    case ChainId.GOERLI:
      return USDC_GOERLI;
    case ChainId.SEPOLIA:
      return USDC_SEPOLIA;
    case ChainId.OPTIMISM:
      return USDC_OPTIMISM;
    case ChainId.OPTIMISM_GOERLI:
      return USDC_OPTIMISM_GOERLI;
    case ChainId.ARBITRUM_ONE:
      return USDC_ARBITRUM;
    case ChainId.POLYGON:
      return USDC_POLYGON;
    case ChainId.POLYGON_MUMBAI:
      return USDC_POLYGON_MUMBAI;
    case ChainId.BNB:
      return USDC_BNB;
    case ChainId.AVALANCHE:
      return USDC_AVAX;
    case ChainId.BASE_GOERLI:
      return USDC_BASE_GOERLI;
    case ChainId.BASE:
      return USDC_BASE;
    case ChainId.ZKSYNC:
      return USDCE_ZKSYNC;
    default:
      throw new Error(`Chain id: ${chainId} not supported`);
  }
};

export const WNATIVE_ON = (chainId: ChainId): Token => {
  return WRAPPED_NATIVE_CURRENCY[chainId];
};
