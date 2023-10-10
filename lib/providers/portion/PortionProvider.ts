import { Currency, CurrencyAmount, Fraction, TradeType } from '@uniswap/sdk-core';
import { QuoteRequestInfo } from '../../entities';
import { GetPortionResponse, GET_NO_PORTION_RESPONSE, Portion, PortionFetcher } from '../../fetchers/PortionFetcher';
import { ValidationError } from '../../util/errors';
import { IPortionProvider } from './index';

export class PortionProvider implements IPortionProvider {
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

  getPortionQuoteAmount(
    portionAmount: CurrencyAmount<Currency>,
    quoteAmount: CurrencyAmount<Currency>,
    amount: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> {
    // 1. we know the portion amount for exact out with 100% correctness,
    //    so we can add the portion amount into the exact out amount swapper requested.
    //    i.e. portionAdjustedAmount = amount + portionAmountToken
    const portionAdjustedAmount = amount.add(portionAmount);
    // 2. then we know portion amount and portion adjusted exact out amount,
    //    we can get a ratio
    //    i.e. portionToPortionAdjustedAmountSpotPrice = portionAmountToken / portionAdjustedAmount
    const portionToPortionAdjustedAmountSpotPrice = new Fraction(
      portionAmount.quotient,
      portionAdjustedAmount.quotient
    );
    // 3. we have the portionAmountToken / portionAdjustedAmount ratio
    //    then we can estimate the portion amount for quote, i.e. what is the estimated token in amount deducted for the portion
    //    this amount will be portionQuoteAmountToken = portionAmountToken / portionAdjustedAmount * quoteCurrencyAmount
    //    CAVEAT: we prefer to use the quote currency amount OVER quote gas adjusted currency amount for the formula
    //    because the portion amount calculated from the exact out has no way to account for the gas units.
    return CurrencyAmount.fromRawAmount(
      quoteAmount.currency,
      portionToPortionAdjustedAmountSpotPrice.multiply(quoteAmount).quotient
    );
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

    return this.getQuoteGasAndPortionAdjusted(sharedInfo.type, portionAmount, quoteCurrencyAmount, quoteGasAdjustedCurrencyAmount, amount);
  }

  private getQuoteGasAndPortionAdjusted(
    tradeType: TradeType,
    portionAmount: CurrencyAmount<Currency>,
    quoteAmount: CurrencyAmount<Currency>,
    quoteGasAdjustedAmount: CurrencyAmount<Currency>,
    swapperRequestedExactOutAmount: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> | undefined {
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        return quoteGasAdjustedAmount.subtract(portionAmount);
      case TradeType.EXACT_OUTPUT:
        return this.getQuoteGasAndPortionAdjustedForExactOut(portionAmount, quoteAmount, quoteGasAdjustedAmount, swapperRequestedExactOutAmount);
      default:
        throw new ValidationError(`Unknown trade type ${tradeType}`);
    }
  }

  /**
   * For exact out, there is no way we know the accurate quote gas and portion adjusted amount,
   * because we are exact out quoting using the user requested amount.
   *
   * This method is a simple approximation that assumes the portion amount is a portion of the user requested amount.
   * Then the portion amount can be adjusted to the quote gas adjusted amount, so that we can get a quote gas and portion adjusted.
   *
   * @param portionAmount this is the token out portion amount in decimal-less/unit-less token quantities
   * @param quoteAmount this is the token in quote amount in decimal-less/unit-less token quantities
   * @param quoteGasAdjustedAmount this is the token in quote adjusted gas amount in decimal-less/unit-less token quantities
   * @param amount this is the token out amount requested by the swapper for exact out swap
   * @private
   */
  private getQuoteGasAndPortionAdjustedForExactOut(
    portionAmount: CurrencyAmount<Currency>,
    quoteAmount: CurrencyAmount<Currency>,
    quoteGasAdjustedAmount: CurrencyAmount<Currency>,
    amount: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> {
    // we have a simple heuristic to estimate the quote gas and portion adjusted for exact out
    const portionQuoteAmount = this.getPortionQuoteAmount(portionAmount, quoteAmount, amount);

    // 4. finally we have the estimated portion quote amount, we can add it to the quote gas adjusted amount,
    //    i.e. quoteGasAdjustedCurrencyAmount = quoteGasAdjustedCurrencyAmount + portionQuoteAmount
    return quoteGasAdjustedAmount.add(portionQuoteAmount);
  }
}
