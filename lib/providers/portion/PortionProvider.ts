import { Currency, CurrencyAmount, Fraction, TradeType } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import { QuoteRequestInfo } from '../../entities';
import { GET_NO_PORTION_RESPONSE, GetPortionResponse, PortionFetcher } from '../../fetchers/PortionFetcher';
import { TokenFetcher } from '../../fetchers/TokenFetcher';
import { log } from '../../util/log';
import { metrics } from '../../util/metrics';

export interface FullPortionPayload {
  portionResponse?: GetPortionResponse; // first class citizen, must be accurate from portion service if possible
  portionAmount?: CurrencyAmount<Currency>; // first class citizen, clients will use this for exact out swap
  portionAdjustedTokenOutAmount?: CurrencyAmount<Currency>; // first class citizen, routing-api needs accurate adjusted exact out amount along with portion amount for exact out quote
  quoteGasAndPortionAdjusted?: CurrencyAmount<Currency>; // second class citizen, best-effort calculation but neither exact in nor exact out will be accurate. This field actually not being used by clients.
}

export interface PortionProvider {

  getPortion(sharedInfo: QuoteRequestInfo): Promise<GetPortionResponse>;

  getPortionForTokenOut(sharedInfo: QuoteRequestInfo, tokenOutAmount: string): Promise<FullPortionPayload>;

  /**
   * get the full portion payload, included the calculated portion amount and portion adjusted token out amount
   *
   * @param sharedInfo shared quote request info across classic and dutch
   * @param tokenOutAmount
   *
   * @return FullPortionPayload.portionAmount
   * for exact in, this will be the QUOTE (not quote with gas adjusted) amount from router (tokenOut amount) multiply by the portion Bps divided by 10k basis point (10000).
   * for exact out, this will be the user typed in amount (tokenOut amount) multiply by the portion Bps divided by 10k basis point (10000).
   *
   * portion amount will be unit-less, meaning amount scaled out by tokenOut's decimals
   *
   * @return FullPortionPayload.portionAdjustedTokenOutAmount
   * for exact in, this will be the quote WITH GAS ADJUSTED (not quote) amount from router (tokenOut amount) minus the portion amount.
   * for exact out, this will be the user typed in amount (tokenOut amount) plus the portion amount.
   *
   * portion adjusted token out amount will be unit-less, meaning amount scaled out by tokenOut's decimals
   *
   */
  getPortionAdjustedQuote(
    sharedInfo: QuoteRequestInfo,
    quote: string,
    quoteGasAdjusted: string,
    tokenOutAmount: string
  ): Promise<FullPortionPayload>;
}

export class DefaultPortionProvider implements PortionProvider {
  constructor(private portionFetcher: PortionFetcher, private tokenFetcher: TokenFetcher) {}

  async getPortion(sharedInfo: QuoteRequestInfo): Promise<GetPortionResponse> {
    // we will need to call token fetcher to resolve the tokenIn and tokenOut
    // there's no guarantee that the tokenIn and tokenOut are in the token address
    // also the tokenIn and tokenOut can be native token
    // portion service only accepts wrapped token address
    const [resolvedTokenIn, resolvedTokenOut] = await this.resolveTokenInAndTokenOut(sharedInfo);

    // portion service has no concept of native currency, need to pass in wrapped
    const getPortionResponse =
      resolvedTokenIn && resolvedTokenOut
        ? await this.portionFetcher.getPortion(
          sharedInfo.tokenInChainId,
          resolvedTokenIn.wrapped.address,
          sharedInfo.tokenOutChainId,
          resolvedTokenOut.wrapped.address
        )
        : undefined;

    return getPortionResponse ?? GET_NO_PORTION_RESPONSE;
  }

  async getPortionForTokenOut(sharedInfo: QuoteRequestInfo, tokenOutAmount: string): Promise<FullPortionPayload> {
    // we will need to call token fetcher to resolve the tokenIn and tokenOut
    // there's no guarantee that the tokenIn and tokenOut are in the token address
    // also the tokenIn and tokenOut can be native token
    // portion service only accepts wrapped token address
    const [_, resolvedTokenOut] = await this.resolveTokenInAndTokenOut(sharedInfo);

    const getPortionResponse = await this.getPortion(sharedInfo);

    const tokenOutCurrencyAmount = resolvedTokenOut
      ? CurrencyAmount.fromRawAmount(resolvedTokenOut, tokenOutAmount)
      : undefined;
    const portionAmount = this.getPortionAmount(tokenOutCurrencyAmount, getPortionResponse, resolvedTokenOut);
    const portionAdjustedTokenOutAmount = this.getPortionAdjustedTokenOutAmount(
      sharedInfo.type,
      tokenOutCurrencyAmount,
      portionAmount
    );
    return {
      portionResponse: getPortionResponse,
      portionAmount: portionAmount,
      portionAdjustedTokenOutAmount: portionAdjustedTokenOutAmount,
    } as FullPortionPayload;
  }

  async getPortionAdjustedQuote(
    sharedInfo: QuoteRequestInfo,
    quote: string,
    quoteGasAdjusted: string,
    tokenOutAmount: string
  ): Promise<FullPortionPayload> {
    // we will need to call token fetcher to resolve the tokenIn and tokenOut
    // there's no guarantee that the tokenIn and tokenOut are in the token address
    // also the tokenIn and tokenOut can be native token
    // portion service only accepts wrapped token address
    const [resolvedTokenIn, resolvedTokenOut] = await this.resolveTokenInAndTokenOut(sharedInfo);

    // portion service has no concept of native currency, need to pass in wrapped
    const getPortionResponse =
      resolvedTokenIn && resolvedTokenOut
        ? await this.portionFetcher.getPortion(
            sharedInfo.tokenInChainId,
            resolvedTokenIn.wrapped.address,
            sharedInfo.tokenOutChainId,
            resolvedTokenOut.wrapped.address
          )
        : undefined;

    const quoteCurrency = sharedInfo.type === TradeType.EXACT_INPUT ? resolvedTokenOut : resolvedTokenIn;
    const quoteCurrencyAmount = quoteCurrency ? CurrencyAmount.fromRawAmount(quoteCurrency, quote) : undefined;
    const quoteGasAdjustedCurrencyAmount = quoteCurrency
      ? CurrencyAmount.fromRawAmount(quoteCurrency, quoteGasAdjusted)
      : undefined;

    const requestCurrency = sharedInfo.type === TradeType.EXACT_INPUT ? resolvedTokenIn : resolvedTokenOut;
    const requestCurrencyAmount = requestCurrency
      ? CurrencyAmount.fromRawAmount(requestCurrency, sharedInfo.amount.toString())
      : undefined;

    const portion = await this.getPortionForTokenOut(sharedInfo, tokenOutAmount);
    const portionAmount = portion.portionAmount;

    const quoteGasAndPortionAdjusted = this.getQuoteGasAndPortionAdjusted(
      sharedInfo.type,
      portionAmount,
      quoteCurrencyAmount,
      quoteGasAdjustedCurrencyAmount,
      requestCurrencyAmount
    );
    return {
      portionResponse: getPortionResponse,
      portionAmount: portionAmount,
      quoteGasAndPortionAdjusted: quoteGasAndPortionAdjusted,
      portionAdjustedTokenOutAmount: portion.portionAdjustedTokenOutAmount,
    } as FullPortionPayload;
  }

  private async resolveTokenInAndTokenOut(
    sharedInfo: QuoteRequestInfo
  ): Promise<[Currency | undefined, Currency | undefined]> {
    try {
      // we will need to call token fetcher to resolve the tokenIn and tokenOut
      // there's no guarantee that the tokenIn and tokenOut are in the token address
      // also the tokenIn and tokenOut can be native token
      // portion service only accepts wrapped token address
      return await Promise.all([
        this.tokenFetcher.resolveTokenBySymbolOrAddress(sharedInfo.tokenInChainId, sharedInfo.tokenIn),
        this.tokenFetcher.resolveTokenBySymbolOrAddress(sharedInfo.tokenOutChainId, sharedInfo.tokenOut),
      ]);
    } catch (e) {
      log.error({ e }, 'Failed to resolve tokenIn & tokenOut');
      metrics.putMetric(`PortionProvider.resolveTokenErr`, 1);

      return [undefined, undefined];
    }
  }

  private getPortionAmount(
    tokenOutCurrencyAmount?: CurrencyAmount<Currency>,
    portionResponse?: GetPortionResponse,
    resolvedTokenOut?: Currency
  ): CurrencyAmount<Currency> | undefined {
    return portionResponse?.hasPortion && portionResponse.portion && resolvedTokenOut && tokenOutCurrencyAmount
      ? tokenOutCurrencyAmount.multiply(new Fraction(portionResponse.portion.bips, 10000))
      : undefined;
  }

  private getPortionAdjustedTokenOutAmount(
    tradeType: TradeType,
    tokenOutCurrencyAmount?: CurrencyAmount<Currency>,
    portionAmount?: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> | undefined {
    if (tokenOutCurrencyAmount && portionAmount) {
      switch (tradeType) {
        case TradeType.EXACT_INPUT:
          return tokenOutCurrencyAmount.subtract(portionAmount);
        case TradeType.EXACT_OUTPUT:
          return tokenOutCurrencyAmount.add(portionAmount);
        default:
          // unknown trade type.
          // instead of throw, just return original tokenOutAmount
          return tokenOutCurrencyAmount;
      }
    }

    return tokenOutCurrencyAmount;
  }

  // despite the convoluted math, this private method is not important since it's not affecting the actual swap,
  // nor does clients use any data from this method.
  private getQuoteGasAndPortionAdjusted(
    tradeType: TradeType,
    portionAmount?: CurrencyAmount<Currency>,
    quoteCurrencyAmount?: CurrencyAmount<Currency>,
    quoteGasAdjustedCurrencyAmount?: CurrencyAmount<Currency>,
    requestCurrencyAmount?: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> | undefined {
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        return quoteGasAdjustedCurrencyAmount && portionAmount
          ? quoteGasAdjustedCurrencyAmount.subtract(portionAmount)
          : quoteGasAdjustedCurrencyAmount;
      case TradeType.EXACT_OUTPUT:
        return this.getQuoteGasAndPortionAdjustedForExactOut(
          portionAmount,
          quoteCurrencyAmount,
          quoteGasAdjustedCurrencyAmount,
          requestCurrencyAmount
        );
      default:
        // unknown trade type.
        // instead of throw, just return original quoteGasAdjustedCurrencyAmount
        return quoteGasAdjustedCurrencyAmount;
    }
  }

  private getQuoteGasAndPortionAdjustedForExactOut(
    portionAmount?: CurrencyAmount<Currency>,
    quoteCurrencyAmount?: CurrencyAmount<Currency>,
    quoteGasAdjustedCurrencyAmount?: CurrencyAmount<Currency>,
    requestCurrencyAmount?: CurrencyAmount<Currency>
  ): CurrencyAmount<Currency> | undefined {
    const portionAdjustedRequestedAmount =
      requestCurrencyAmount && portionAmount ? requestCurrencyAmount.add(portionAmount) : undefined;
    const portionToPortionAdjustedRequestAmountRatio =
      portionAmount && portionAdjustedRequestedAmount
        ? portionAmount.divide(portionAdjustedRequestedAmount)
        : undefined;
    const unitlessRatio: JSBI | undefined = portionToPortionAdjustedRequestAmountRatio
      ? portionToPortionAdjustedRequestAmountRatio.quotient
      : undefined;
    const linearAlgebraPortionAmountForQuoteCurrency =
      unitlessRatio && quoteCurrencyAmount
        ? CurrencyAmount.fromRawAmount(
            quoteCurrencyAmount.currency,
            JSBI.multiply(unitlessRatio, quoteCurrencyAmount.quotient)
          )
        : undefined;
    return quoteGasAdjustedCurrencyAmount && linearAlgebraPortionAmountForQuoteCurrency
      ? quoteGasAdjustedCurrencyAmount.add(linearAlgebraPortionAmountForQuoteCurrency)
      : quoteGasAdjustedCurrencyAmount;
  }
}
