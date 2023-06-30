import { AllowanceTransfer, MaxAllowanceTransferAmount, PERMIT2_ADDRESS, PermitSingleData } from '@uniswap/permit2-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import ms from 'ms';

const PERMIT_EXPIRATION = ms('30d');
const PERMIT_SIG_EXPIRATION = ms('30m');
const PERMIT_AMOUNT = MaxAllowanceTransferAmount.toString();

function toDeadline(expiration: number): number {
  return Math.floor((Date.now() + expiration) / 1000);
}

export function createPermitData(tokenAddress: string, chainId: number, nonce: string): PermitSingleData {
  const permit = {
    details: {
      token: tokenAddress,
      amount: PERMIT_AMOUNT.toString(),
      expiration: toDeadline(PERMIT_EXPIRATION).toString(),
      nonce: nonce,
    },
    spender: UNIVERSAL_ROUTER_ADDRESS(chainId),
    sigDeadline: toDeadline(PERMIT_SIG_EXPIRATION).toString() ,
  };

  return AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, chainId) as PermitSingleData;
}
