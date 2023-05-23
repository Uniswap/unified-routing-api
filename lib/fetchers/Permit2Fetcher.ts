import { ethers } from 'ethers'
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import PERMIT2_CONTRACT from '../abis/Permit2.json'

export class Permit2Fetcher {
    private rpcProvider: ethers.providers.Provider
    // static PERMIT2_INTERFACE = new ethers.utils.Interface(JSON.stringify(PERMIT2_ABI))
    
    constructor(rpcProvider: ethers.providers.Provider) {
        this.rpcProvider = rpcProvider
    }

    public async fetchAllowance(
        ownerAddress: string,
        tokenAddress: string,
        spenderAddress: string,
    ): Promise<ethers.BigNumber> {
        const allowance = await new ethers.Contract(
        PERMIT2_ADDRESS,
        PERMIT2_CONTRACT.abi,
        this.rpcProvider,
        ).allowance(ownerAddress, tokenAddress, spenderAddress)
    
        return allowance
    }
}