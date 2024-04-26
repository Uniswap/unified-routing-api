import { PERMIT2_ADDRESS, PermitDetails } from '@uniswap/permit2-sdk';
import { ChainId } from '@uniswap/sdk-core';
import { ethers, providers } from 'ethers';
import PERMIT2_CONTRACT from '../abis/Permit2.json';
import { log } from '../util/log';
import { metrics } from '../util/metrics';
import { Unit } from 'aws-embedded-metrics';

export class Permit2Fetcher {
  public readonly permit2Address: string;
  public readonly permit2Abi: ethers.ContractInterface;
  private readonly permit2: ethers.Contract;
  private readonly chainIdRpcMap: Map<ChainId, providers.StaticJsonRpcProvider>;

  constructor(chainIdRpcMap: Map<ChainId, providers.StaticJsonRpcProvider>) {
    this.chainIdRpcMap = chainIdRpcMap;
    this.permit2Address = PERMIT2_ADDRESS;
    this.permit2Abi = PERMIT2_CONTRACT.abi;
    this.permit2 = new ethers.Contract(this.permit2Address, this.permit2Abi);
  }

  public async fetchAllowance(
    chainId: ChainId,
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string
  ): Promise<PermitDetails | undefined> {
    let allowance = undefined;
    metrics.putMetric(`Permit2FetcherRequest`, 1);
    try {
      const beforePermitCheck = Date.now();
      const rpcProvider = this.chainIdRpcMap.get(chainId);
      if (!rpcProvider) throw new Error(`No rpc provider found for chain: ${chainId}`);
      allowance = await this.permit2.connect(rpcProvider).allowance(ownerAddress, tokenAddress, spenderAddress);
      metrics.putMetric(`Permit2FetcherSuccess`, 1);    metrics.putMetric(
        `Latency-Permit2Fetcher-ChainId${chainId}`,
        Date.now() - beforePermitCheck,
        Unit.Milliseconds
      );
  
    } catch (e) {
      log.error(e, 'Permit2FetcherErr');
      metrics.putMetric(`Permit2FetcherErr`, 1);
    }

    return allowance;
  }
}
