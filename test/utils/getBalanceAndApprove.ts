import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { MaxAllowanceExpiration, MaxAllowanceTransferAmount } from '@uniswap/permit2-sdk';
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { PERMIT2_ADDRESS } from '@uniswap/universal-router-sdk';
import { constants } from 'ethers';
import { Erc20, Permit2__factory } from '../../lib/types/ext';
import { Erc20__factory } from '../../lib/types/ext/factories/Erc20__factory';

export const getBalance = async (alice: SignerWithAddress, currency: Currency): Promise<CurrencyAmount<Currency>> => {
  if (!currency.isToken) {
    return CurrencyAmount.fromRawAmount(currency, (await alice.getBalance()).toString());
  }

  const aliceTokenIn: Erc20 = Erc20__factory.connect(currency.address, alice);

  return CurrencyAmount.fromRawAmount(currency, (await aliceTokenIn.balanceOf(alice.address)).toString());
};

export const getBalanceOfAddress = async (
  alice: SignerWithAddress,
  address: string,
  currency: Token
): Promise<CurrencyAmount<Token>> => {
  // tokens / WETH only.
  const token: Erc20 = Erc20__factory.connect(currency.address, alice);

  return CurrencyAmount.fromRawAmount(currency, (await token.balanceOf(address)).toString());
};

export const getBalanceAndApprove = async (
  alice: SignerWithAddress,
  approveTarget: string,
  currency: Currency
): Promise<CurrencyAmount<Currency>> => {
  if (currency.isToken) {
    const aliceTokenIn: Erc20 = Erc20__factory.connect(currency.address, alice);

    if (currency.symbol == 'USDT') {
      await (await aliceTokenIn.approve(approveTarget, 0)).wait();
    }
    await (await aliceTokenIn.approve(approveTarget, constants.MaxUint256)).wait();
  }

  return getBalance(alice, currency);
};

export const getBalanceAndApprovePermit2 = async (
  alice: SignerWithAddress,
  approveTarget: string,
  currency: Currency
): Promise<CurrencyAmount<Currency>> => {
  const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, alice);
  if (currency.isToken) {
    await (
      await permit2.approve(currency.address, approveTarget, MaxAllowanceTransferAmount, MaxAllowanceExpiration)
    ).wait();
  }

  return getBalance(alice, currency);
};
