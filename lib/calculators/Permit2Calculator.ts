import {
  AllowanceTransfer,
  MaxAllowanceTransferAmount,
  PERMIT2_ADDRESS,
  PermitDetails,
  PermitSingleData,
} from '@uniswap/permit2-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber } from 'ethers';
import ms from 'ms';

const PERMIT_EXPIRATION = ms('30d');
const PERMIT_SIG_EXPIRATION = ms('30m');

export class TokenPermitCalculator {
  private static toDeadline(expiration: number): number {
    return Math.floor((Date.now() + expiration) / 1000);
  }

  public static createPermitData(
    permitDetails: Omit<PermitDetails, 'token'> | null,
    tokenAddress: string,
    amount: string,
    chainId = 1
  ): PermitSingleData | null {
    // early return if permit not needed
    if (
      permitDetails &&
      BigNumber.from(permitDetails.amount).gte(amount) &&
      BigNumber.from(permitDetails.expiration).gt(Math.floor(new Date().getTime() / 1000))
    )
      return null;

    const permit = {
      details: {
        token: tokenAddress,
        amount: MaxAllowanceTransferAmount.toString(),
        expiration: this.toDeadline(PERMIT_EXPIRATION),
        nonce: permitDetails?.nonce ?? 0,
      },
      spender: UNIVERSAL_ROUTER_ADDRESS(1),
      sigDeadline: this.toDeadline(PERMIT_SIG_EXPIRATION),
    };

    return AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, chainId) as PermitSingleData;
  }
}
