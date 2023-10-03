import { Currency, CurrencyAmount, Fraction, TradeType } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import { QuoteRequestInfo } from '../../entities';
import { GetPortionResponse, GET_NO_PORTION_RESPONSE, Portion, PortionFetcher } from '../../fetchers/PortionFetcher';
import { UnknownTradeTypeError } from '../../util/errors';

export interface PortionProvider {
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

export class DefaultPortionProvider implements PortionProvider {
  constructor(private portionFetcher: PortionFetcher) {}

  async getPortion(
    sharedInfo: QuoteRequestInfo,
    wrappedTokenInAddress?: string,
    wrappedTokenOutAddress?: string
  ): Promise<GetPortionResponse> {
    if (!wrappedTokenInAddress || !wrappedTokenOutAddress) {
      return GET_NO_PORTION_RESPONSE;
    }

    // portion service has no concept of native currency, need to pass in wrapped
    return await this.portionFetcher.getPortion(
      sharedInfo.tokenInChainId,
      wrappedTokenInAddress,
      sharedInfo.tokenOutChainId,
      wrappedTokenOutAddress
    );
  }

  getPortionAmount(
    tokenOutAmount: string,
    portion?: Portion,
    resolvedTokenOut?: Currency
  ): CurrencyAmount<Currency> | undefined {
    if (!portion || !resolvedTokenOut) {
      return undefined;
    }

    const tokenOutCurrencyAmount = CurrencyAmount.fromRawAmount(resolvedTokenOut, tokenOutAmount);
    return tokenOutCurrencyAmount.multiply(new Fraction(portion.bips, 10000));
  }

  // @dev despite the convoluted math, this API is not important since it's not affecting the actual swap,
  // nor does clients use any data from this method.
  getPortionAdjustedQuote(
    sharedInfo: QuoteRequestInfo,
    quote: string,
    quoteGasAdjusted: string,
    portionAmount?: CurrencyAmount<Currency>,
    resolvedTokenIn?: Currency,
    resolvedTokenOut?: Currency
  ): CurrencyAmount<Currency> | undefined {
    if (!resolvedTokenIn || !resolvedTokenOut || !portionAmount) {
      return undefined;
    }

    const quoteCurrency = sharedInfo.type === TradeType.EXACT_INPUT ? resolvedTokenOut : resolvedTokenIn;
    const quoteCurrencyAmount = CurrencyAmount.fromRawAmount(quoteCurrency, quote);
    const quoteGasAdjustedCurrencyAmount = CurrencyAmount.fromRawAmount(quoteCurrency, quoteGasAdjusted);

    const amount = CurrencyAmount.fromRawAmount(
      sharedInfo.type === TradeType.EXACT_INPUT ? resolvedTokenIn : resolvedTokenOut,
      sharedInfo.amount.toString()
    );

    return this.getQuoteGasAndPortionAdjusted(
      sharedInfo.type,
      portionAmount,
      quoteCurrencyAmount,
      quoteGasAdjustedCurrencyAmount,
      amount
    );
  }

  private getQuoteGasAndPortionAdjusted(
    tradeType: TradeType,
    portionAmount: CurrencyAmount<Currency>,
    quoteCurrencyAmount: CurrencyAmount<Currency>,
    quoteGasAdjustedCurrencyAmount: CurrencyAmount<Currency>,
    amount: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> | undefined {
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        return quoteGasAdjustedCurrencyAmount.subtract(portionAmount);
      case TradeType.EXACT_OUTPUT:
        return this.getQuoteGasAndPortionAdjustedForExactOut(
          portionAmount,
          quoteCurrencyAmount,
          quoteGasAdjustedCurrencyAmount,
          amount
        );
      default:
        // unknown trade type.
        // instead of throw, just return original quoteGasAdjustedCurrencyAmount
        throw new UnknownTradeTypeError(`Unknown trade type ${tradeType}`);
    }
  }

  private getQuoteGasAndPortionAdjustedForExactOut(
    portionAmount: CurrencyAmount<Currency>,
    quoteCurrencyAmount: CurrencyAmount<Currency>,
    quoteGasAdjustedCurrencyAmount: CurrencyAmount<Currency>,
    amount: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> | undefined {
    const portionAdjustedRequestedAmount = amount.add(portionAmount);
    const portionToPortionAdjustedRequestAmountRatio = portionAmount.divide(portionAdjustedRequestedAmount);
    const unitlessRatio: JSBI | undefined = portionToPortionAdjustedRequestAmountRatio.quotient;
    const linearAlgebraPortionAmountForQuoteCurrency = CurrencyAmount.fromRawAmount(
      quoteCurrencyAmount.currency,
      JSBI.multiply(unitlessRatio, quoteCurrencyAmount.quotient)
    );
    return quoteGasAdjustedCurrencyAmount.add(linearAlgebraPortionAmountForQuoteCurrency);
  }
}
