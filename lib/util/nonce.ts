import { ethers } from 'ethers';

export function generateRandomNonce(): string {
  return ethers.BigNumber.from(ethers.utils.randomBytes(31)).shl(8).toString();
}
