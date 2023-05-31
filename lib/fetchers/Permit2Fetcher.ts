import { PERMIT2_ADDRESS, PermitDetails } from '@uniswap/permit2-sdk';
import { ChainId } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import PERMIT2_CONTRACT from '../abis/Permit2.json';

export class Permit2Fetcher {
  public readonly permitAddress: string;
  public readonly permitAbi: ethers.ContractInterface;
  private readonly rpcUrlMap: Map<ChainId, string>;
  private readonly contract: ethers.Contract;

  constructor(rpcUrlMap: Map<ChainId, string>) {
    this.rpcUrlMap = rpcUrlMap;
    this.permitAddress = PERMIT2_ADDRESS;
    this.permitAbi = PERMIT2_CONTRACT.abi;
    this.contract = new ethers.Contract(this.permitAddress, this.permitAbi);
  }

  public async fetchAllowance(
    chainId: ChainId,
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string
  ): Promise<PermitDetails> {
    const rpcUrl = this.rpcUrlMap.get(chainId);
    const rpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const allowance = await this.contract.connect(rpcProvider).allowance(ownerAddress, tokenAddress, spenderAddress);

    return allowance;
  }
}
