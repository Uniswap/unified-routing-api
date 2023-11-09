import { BigNumber } from "ethers";
import { ClassicQuoteDataJSON, Quote } from "../entities";

// quoteSizeUSD = (multiple of gas-cost-equivalent quote token) * (gas cost in USD)
export function getQuoteSizeEstimateUSD(classicQuote: Quote) {
    const classicQuoteData = classicQuote.toJSON() as ClassicQuoteDataJSON;
  return parseFloat(
    BigNumber.from(classicQuoteData.quoteGasAdjusted)
      .div(BigNumber.from(classicQuoteData.gasUseEstimateQuote)).toString())
      * parseFloat(classicQuoteData.gasUseEstimateUSD);
}
