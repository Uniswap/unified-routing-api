import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk';
import { ChainId } from '@uniswap/smart-order-router';
import PERMIT2_CONTRACT from '../../../../lib/abis/Permit2.json';
import { Permit2Fetcher } from '../../../../lib/fetchers/Permit2Fetcher';

describe('Permit2Fetcher Unit Tests', () => {
  describe('constructor', () => {
    it('gets initialized with correct contract address and ABI', async () => {
      const rpcUrlMap = new Map();
      rpcUrlMap.set(ChainId.MAINNET, 'mainnet rpc url');
      const fetcher = new Permit2Fetcher(rpcUrlMap);
      expect(fetcher.permitAddress).toBe(PERMIT2_ADDRESS);
      expect(fetcher.permitAbi).toBe(PERMIT2_CONTRACT.abi);
    });

    it('returns undefined if an error occurs', async () => {
      const rpcUrlMap = new Map();
      const fetcher = new Permit2Fetcher(rpcUrlMap);
      const result = await fetcher.fetchAllowance(ChainId.MAINNET, 'owner', 'token', 'spender');
      expect(result).toBe(undefined);
    });
  });
});
