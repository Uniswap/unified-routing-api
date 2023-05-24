import { PERMIT2_ADDRESS, PermitDetails } from '@uniswap/permit2-sdk';
import { ethers } from 'ethers';
import PERMIT2_CONTRACT from '../abis/Permit2.json';

export class Permit2Fetcher {
  private rpcProvider: ethers.providers.Provider;
  public readonly permitAddress: string;
  public readonly permitAbi: ethers.ContractInterface;

  constructor(rpcProvider: ethers.providers.Provider) {
    this.rpcProvider = rpcProvider;
    this.permitAddress = PERMIT2_ADDRESS;
    this.permitAbi = PERMIT2_CONTRACT.abi;    
  }

  public async fetchAllowance(
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string
  ): Promise<Omit<PermitDetails, 'token'>> {
    const allowance = await new ethers.Contract(this.permitAddress, this.permitAbi, this.rpcProvider).allowance(
      ownerAddress,
      tokenAddress,
      spenderAddress
    );

    return allowance;
  }
}
