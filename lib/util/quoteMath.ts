import { BigNumber } from "ethers";
import { BigNumber as BN } from "bignumber.js";
import { ClassicQuoteDataJSON, Quote } from "../entities";

// quoteSizeUSD = (multiple of gas-cost-equivalent quote token) * (gas cost in USD)
export function getQuoteSizeEstimateUSD(classicQuote: Quote) {
    const classicQuoteData = classicQuote.toJSON() as ClassicQuoteDataJSON;
  return new BN(
    BigNumber.from(classicQuoteData.quoteGasAdjusted)
      .div(BigNumber.from(classicQuoteData.gasUseEstimateQuote)).toString())
    .times(new BN(classicQuoteData.gasUseEstimateUSD));
}
