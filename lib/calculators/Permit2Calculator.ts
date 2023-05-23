import {
  AllowanceTransfer,
  MaxAllowanceTransferAmount,
  PERMIT2_ADDRESS,
  PermitSingleData,
} from '@uniswap/permit2-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import ms from 'ms';

const PERMIT_EXPIRATION = ms('30d');
const PERMIT_SIG_EXPIRATION = ms('30m');

export class TokenPermitCalculator {
  private static toDeadline(expiration: number): number {
    return Math.floor((Date.now() + expiration) / 1000);
  }

  public static createPermitData(
    tokenAddress: string,
    chainId: number,
    nonce: string,
  ): PermitSingleData {

    const permit = {
      details: {
        token: tokenAddress,
        amount: MaxAllowanceTransferAmount.toString(),
        expiration: this.toDeadline(PERMIT_EXPIRATION),
        nonce: nonce,
      },
      spender: UNIVERSAL_ROUTER_ADDRESS(1),
      sigDeadline: this.toDeadline(PERMIT_SIG_EXPIRATION),
    };

    return AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, chainId) as PermitSingleData;
  }
}
