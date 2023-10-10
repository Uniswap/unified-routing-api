import { Currency, CurrencyAmount } from '@uniswap/sdk-core';
import { QuoteRequestInfo } from '../../entities';
import { GetPortionResponse, Portion } from '../../fetchers/PortionFetcher';

export * from './PortionProvider';

export interface IPortionProvider {
  /**
   * Get portion based on the resolved token in and out addresses
   *
   * @param sharedInfo shared quote request info across classic and dutch
   * @param wrappedTokenInAddress token in wrapped address
   * @param wrappedTokenOutAddress token out wrapped address
   */
  getPortion(
    sharedInfo: QuoteRequestInfo,
    wrappedTokenInAddress?: string,
    wrappedTokenOutAddress?: string
  ): Promise<GetPortionResponse>;

  /**
   * Get portion amount based on the token out amount
   *
   * @param tokenOutAmount token out amount, either quote for exact in or swapper's amount token
   * @param portion portion from the getPortionResponse
   * @param resolvedTokenOut resolved token out
   */
  getPortionAmount(
    tokenOutAmount: string,
    portion?: Portion,
    resolvedTokenOut?: Currency
  ): CurrencyAmount<Currency> | undefined;

  /**
   * Get portion quote amount based on the token in amount
   *
   * @param portionAmountToken portion amount token from token out
   * @param quoteCurrencyAmount quote currency amount from the token in
   * @param amount token out amount from the swapper
   */
  getPortionQuoteAmount(
    portionAmountToken: CurrencyAmount<Currency>,
    quoteCurrencyAmount: CurrencyAmount<Currency>,
    amount: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency>;

  /**
   *
   * @param sharedInfo shared quote request info across classic and dutch
   * @param quote quote from the classic
   * @param quoteGasAdjusted quote gas adjusted from the classic
   * @param portionAmount portion amount from the getPortionAmount
   * @param resolvedTokenIn resolved token in
   * @param resolvedTokenOut resolved token out
   */
  getPortionAdjustedQuote(
    sharedInfo: QuoteRequestInfo,
    quote: string,
    quoteGasAdjusted: string,
    portionAmount?: CurrencyAmount<Currency>,
    resolvedTokenIn?: Currency,
    resolvedTokenOut?: Currency
  ): CurrencyAmount<Currency> | undefined;
}
