import * as _ from 'lodash'
import { Permit2Fetcher } from '../../../../lib/fetchers/Permit2Fetcher';
import { ethers } from 'ethers';
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk';
import PERMIT2_CONTRACT from '../../../../lib/abis/Permit2.json';

describe('Permit2Fetcher Unit Tests', () => {
    describe('constructor', () => {
        it('gets initialized with correct contract address and ABI', async () => {
            const fetcher = new Permit2Fetcher(ethers.getDefaultProvider())
            expect(fetcher.permitAddress).toBe(PERMIT2_ADDRESS)
            expect(fetcher.permitAbi).toBe(PERMIT2_CONTRACT.abi)
    })
})
})
