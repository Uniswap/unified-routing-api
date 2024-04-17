import { ChainId, TradeType } from '@uniswap/sdk-core';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as Logger } from 'bunyan';
import {
  BASE_REQUEST_INFO_EXACT_IN,
  BASE_REQUEST_INFO_EXACT_OUT,
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_BETTER_GAS_TOKEN,
  CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_IN_WORSE_GAS_TOKEN,
  CLASSIC_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_WORSE_GAS_TOKEN,
  CLASSIC_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
  CLASSIC_REQUEST_BODY,
  createClassicQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
  DL_QUOTE_EXACT_IN_WORSE,
  DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
  DL_QUOTE_EXACT_OUT_BETTER,
  DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
  DL_QUOTE_EXACT_OUT_WORSE,
  DL_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
  DL_REQUEST_BODY,
  QUOTE_REQUEST_BODY_MULTI,
  QUOTE_REQUEST_BODY_MULTI_SYNTHETIC,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_DUTCH_V2,
  QUOTE_REQUEST_MULTI,
  RELAY_QUOTE_EXACT_IN_BETTER,
  RELAY_QUOTE_EXACT_IN_WORSE,
  RELAY_QUOTE_EXACT_OUT_BETTER,
  RELAY_QUOTE_EXACT_OUT_WORSE,
  RELAY_QUOTE_NATIVE_EXACT_IN_BETTER,
  RELAY_REQUEST_BODY,
  RELAY_REQUEST_BODY_EXACT_OUT,
  RELAY_REQUEST_WITH_CLASSIC_BODY,
  V2_QUOTE_EXACT_IN_BETTER,
  V2_QUOTE_EXACT_IN_WORSE,
} from '../../../../utils/fixtures';

import { PermitDetails } from '@uniswap/permit2-sdk';
import { DutchOrderInfoJSON, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { MetricsLogger } from 'aws-embedded-metrics';
import { APIGatewayProxyEventHeaders } from 'aws-lambda/trigger/api-gateway-proxy';
import { AxiosError } from 'axios';
import { BigNumber, providers } from 'ethers';
import NodeCache from 'node-cache';
import { RoutingType } from '../../../../../lib/constants';
import {
  ClassicQuote,
  ClassicQuoteDataJSON,
  DutchQuote,
  Quote,
  RelayQuote,
  RequestSource,
} from '../../../../../lib/entities';
import { DutchConfigJSON, QuoteRequestBodyJSON } from '../../../../../lib/entities/request/index';
import { Permit2Fetcher } from '../../../../../lib/fetchers/Permit2Fetcher';
import {
  GetPortionResponse,
  GET_NO_PORTION_RESPONSE,
  PortionFetcher,
} from '../../../../../lib/fetchers/PortionFetcher';
import { TokenFetcher } from '../../../../../lib/fetchers/TokenFetcher';
import { ApiInjector, ApiRInj } from '../../../../../lib/handlers/base';
import {
  compareQuotes,
  getBestQuote,
  getQuotes,
  QuoteHandler,
  removeDutchRequests,
} from '../../../../../lib/handlers/quote/handler';
import { ContainerInjected, QuoterByRoutingType } from '../../../../../lib/handlers/quote/injector';
import { Quoter, SyntheticStatusProvider } from '../../../../../lib/providers';
import { Erc20__factory } from '../../../../../lib/types/ext/factories/Erc20__factory';
import { ErrorCode } from '../../../../../lib/util/errors';
import { setGlobalLogger } from '../../../../../lib/util/log';
import { INELIGIBLE_TOKEN, PERMIT2_USED, PERMIT_DETAILS, SWAPPER, TOKEN_IN, TOKEN_OUT } from '../../../../constants';

const LOGGER_MOCK = {
  info: jest.fn(),
  error: jest.fn(),
  child: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
};

const METRICS_MOCK = {
  putMetric: jest.fn(),
};

const requestInjectedMock: Promise<ApiRInj> = new Promise((resolve) => {
  setGlobalLogger(LOGGER_MOCK as any);
  resolve({
    log: LOGGER_MOCK as unknown as Logger,
    requestId: 'test',
    metrics: METRICS_MOCK as unknown as MetricsLogger,
  }) as unknown as ApiRInj;
});

const injectorPromiseMock = (
  quoters: QuoterByRoutingType,
  tokenFetcher: TokenFetcher,
  portionFetcher: PortionFetcher,
  permit2Fetcher: Permit2Fetcher,
  syntheticStatusProvider: SyntheticStatusProvider
): Promise<ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>> =>
  new Promise((resolve) =>
    resolve({
      getContainerInjected: (): ContainerInjected => {
        const chainIdRpcMap = new Map<ChainId, providers.StaticJsonRpcProvider>();
        for (const chain of Object.values(ChainId)) {
          chainIdRpcMap.set(chain as ChainId, new providers.StaticJsonRpcProvider());
        }
        return {
          quoters: quoters,
          tokenFetcher: tokenFetcher,
          portionFetcher: portionFetcher,
          permit2Fetcher: permit2Fetcher,
          syntheticStatusProvider,
          chainIdRpcMap,
        };
      },
      getRequestInjected: () => requestInjectedMock,
    } as unknown as ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>)
  );

const getQuoteHandler = (
  quoters: QuoterByRoutingType,
  tokenFetcher: TokenFetcher,
  portionFetcher: PortionFetcher,
  permit2Fetcher: Permit2Fetcher,
  syntheticStatusProvider: SyntheticStatusProvider
) =>
  new QuoteHandler(
    'quote',
    injectorPromiseMock(quoters, tokenFetcher, portionFetcher, permit2Fetcher, syntheticStatusProvider)
  );

const RfqQuoterMock = (dlQuote: DutchQuote): Quoter => {
  return {
    quote: jest.fn().mockResolvedValue(dlQuote),
  };
};

const RfqQuoterErrorMock = (axiosError: AxiosError): Quoter => {
  return {
    quote: jest.fn().mockReturnValue(Promise.reject(axiosError)),
  };
};

const RelayQuoterMock = (relayQuote: RelayQuote): Quoter => {
  return {
    quote: jest.fn().mockResolvedValue(relayQuote),
  };
};

const ClassicQuoterMock = (classicQuote: ClassicQuote): Quoter => {
  return {
    quote: jest.fn().mockResolvedValue(classicQuote),
  };
};
const TokenFetcherMock = (addresses: string[], isError = false): TokenFetcher => {
  const fetcher = {
    resolveTokenBySymbolOrAddress: jest.fn(),
    getTokenBySymbolOrAddress: (_chainId: number, address: string) => [TOKEN_IN, TOKEN_OUT].includes(address),
  };

  if (isError) {
    fetcher.resolveTokenBySymbolOrAddress.mockRejectedValue(new Error('error'));
    return fetcher as unknown as TokenFetcher;
  }

  for (const address of addresses) {
    fetcher.resolveTokenBySymbolOrAddress.mockResolvedValueOnce(address);
  }
  return fetcher as unknown as TokenFetcher;
};
const PortionFetcherMock = (portionResponse: GetPortionResponse): PortionFetcher => {
  const portionCache = new NodeCache({ stdTTL: 600 });
  const portionFetcher = new PortionFetcher('https://portion.uniswap.org/', portionCache);
  jest.spyOn(portionFetcher, 'getPortion').mockResolvedValue(portionResponse);
  return portionFetcher;
};
const Permit2FetcherMock = (permitDetails: PermitDetails, isError = false): Permit2Fetcher => {
  const fetcher = {
    fetchAllowance: jest.fn(),
  };

  if (isError) {
    fetcher.fetchAllowance.mockRejectedValue(new Error('error'));
    return fetcher as unknown as Permit2Fetcher;
  }

  fetcher.fetchAllowance.mockResolvedValueOnce(permitDetails);
  return fetcher as unknown as Permit2Fetcher;
};

const SyntheticStatusProviderMock = (syntheticEnabled: boolean): SyntheticStatusProvider => {
  const provider = {
    getStatus: jest.fn(),
  };

  provider.getStatus.mockResolvedValueOnce({ syntheticEnabled });
  return provider as unknown as SyntheticStatusProvider;
};

const getEvent = (request: QuoteRequestBodyJSON, headers?: APIGatewayProxyEventHeaders): APIGatewayProxyEvent =>
  ({
    body: JSON.stringify(request),
    ...(headers !== undefined && { headers: headers }),
  } as APIGatewayProxyEvent);

describe('QuoteHandler', () => {
  const OLD_ENV = process.env;

  beforeAll(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = {
      ...OLD_ENV,
    }; // Make a copy
    jest.mock('../../../../../lib/types/ext/factories/Erc20__factory');
    Erc20__factory.connect = jest.fn().mockImplementation(() => {
      return {
        allowance: () => ({ gte: () => true }),
      };
    });
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('handler', () => {
    describe('handler test', () => {
      it('handles exactIn classic quotes', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(CLASSIC_REQUEST_BODY), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote as ClassicQuoteDataJSON;
        expect(quoteJSON.quoteGasAdjusted).toBe(CLASSIC_QUOTE_EXACT_IN_WORSE.amountOutGasAdjusted.toString());
      });

      it('check request source', async () => {
        const quoteMock = jest.fn().mockResolvedValue(CLASSIC_QUOTE_EXACT_IN_WORSE);
        const quoterMock: Quoter = { quote: quoteMock };

        const quoters = { [RoutingType.CLASSIC]: quoterMock };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const quoteHandler = getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        );

        const headers: APIGatewayProxyEventHeaders = {
          'x-request-source': 'uniswap-web',
        };
        await quoteHandler.handler(getEvent(CLASSIC_REQUEST_BODY, headers), {} as unknown as Context);
        const quoteCallParams = quoteMock.mock.lastCall[0];
        expect(quoteCallParams.info.source).toBe(RequestSource.UNISWAP_WEB);
      });

      describe('handler getQuoteRequestSource', () => {
        it('test getQuoteRequestSource', async () => {
          const quoteMock = jest.fn().mockResolvedValue(CLASSIC_QUOTE_EXACT_IN_WORSE);
          const quoterMock: Quoter = { quote: quoteMock };

          const quoters = { [RoutingType.CLASSIC]: quoterMock };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
          const syntheticStatusProvider = SyntheticStatusProviderMock(false);

          const quoteHandler = getQuoteHandler(
            quoters,
            tokenFetcher,
            portionFetcher,
            permit2Fetcher,
            syntheticStatusProvider
          );

          let headers: APIGatewayProxyEventHeaders = { 'x-request-source': 'uniswap-ios' };
          let requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNISWAP_IOS);

          headers = { 'x-request-source': 'uniswap-android' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNISWAP_ANDROID);

          headers = { 'x-request-source': 'uniswap-web' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNISWAP_WEB);

          headers = { 'x-request-source': 'external-api' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.EXTERNAL_API);

          headers = { 'x-request-source': 'external-api:mobile' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.EXTERNAL_API_MOBILE);

          headers = { 'x-request-source': 'lonely-planet' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNKNOWN);

          headers = { 'x-request-source': '' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNKNOWN);

          headers = {};
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNKNOWN);
        });

        it('test getQuoteRequestSource input case insensitiveness', async () => {
          const quoteMock = jest.fn().mockResolvedValue(CLASSIC_QUOTE_EXACT_IN_WORSE);
          const quoterMock: Quoter = { quote: quoteMock };

          const quoters = { [RoutingType.CLASSIC]: quoterMock };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
          const syntheticStatusProvider = SyntheticStatusProviderMock(false);

          const quoteHandler = getQuoteHandler(
            quoters,
            tokenFetcher,
            portionFetcher,
            permit2Fetcher,
            syntheticStatusProvider
          );

          let headers: APIGatewayProxyEventHeaders = { 'x-request-source': 'Uniswap-iOS' };
          let requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNISWAP_IOS);

          headers = { 'x-request-source': 'UNISWAP-ANDROID' };
          requestSource = quoteHandler.getQuoteRequestSource(headers);
          expect(requestSource).toBe(RequestSource.UNISWAP_ANDROID);
        });
      });

      it('handles exactOut classic quotes', async () => {
        const request: QuoteRequestBodyJSON = {
          ...BASE_REQUEST_INFO_EXACT_OUT,
          configs: [
            {
              routingType: RoutingType.CLASSIC,
              protocols: ['V3', 'V2', 'MIXED'],
            },
          ],
        };

        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_OUT_WORSE) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(request), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote as ClassicQuoteDataJSON;
        expect(quoteJSON.quoteGasAdjusted).toBe(CLASSIC_QUOTE_EXACT_OUT_WORSE.amountInGasAdjusted.toString());
      });

      it('handles exactIn DL quotes', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(DL_REQUEST_BODY), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as DutchOrderInfoJSON;
        expect(quoteJSON.outputs[0].startAmount).toBe(DL_QUOTE_EXACT_IN_BETTER.amountOut.toString());
      });

      it('handles exactOut DL quotes', async () => {
        const request: QuoteRequestBodyJSON & {
          configs: DutchConfigJSON[];
        } = {
          ...BASE_REQUEST_INFO_EXACT_OUT,
          configs: [
            {
              routingType: RoutingType.DUTCH_LIMIT,
              swapper: '0x0000000000000000000000000000000000000000',
              exclusivityOverrideBps: 12,
              startTimeBufferSecs: 30,
              auctionPeriodSecs: 60,
              deadlineBufferSecs: 12,
            },
          ],
        };
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_OUT_BETTER) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(request), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as DutchOrderInfoJSON;
        expect(quoteJSON.input.startAmount).toBe(DL_QUOTE_EXACT_OUT_BETTER.amountIn.toString());
      });

      it('sets the DL quote endAmount using classic quote', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);
        const { amountOut: amountOutClassic } = DutchQuote.applyGasAdjustment(
          {
            amountIn: CLASSIC_QUOTE_EXACT_IN_WORSE.amountInGasAdjusted,
            amountOut: CLASSIC_QUOTE_EXACT_IN_WORSE.amountOutGasAdjusted,
          },
          CLASSIC_QUOTE_EXACT_IN_WORSE
        );
        const slippageAdjustedAmountOut = amountOutClassic.mul(995).div(1000);
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as DutchOrderInfoJSON;
        expect(quoteJSON.outputs.length).toBe(1);
        expect(quoteJSON.outputs[0].endAmount).toBe(slippageAdjustedAmountOut.toString());
      });

      it('handles exactIn relay quotes', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE_GAS_TOKEN),
          [RoutingType.RELAY]: RelayQuoterMock(RELAY_QUOTE_NATIVE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(RELAY_REQUEST_BODY), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as RelayOrderInfoJSON;
        expect(quoteJSON.input.amount).toBe(RELAY_QUOTE_EXACT_IN_BETTER.amountIn.toString());
      });

      it('returns relay quote if both relay and classic are requested', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER_GAS_TOKEN),
          [RoutingType.RELAY]: RelayQuoterMock(RELAY_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(RELAY_REQUEST_WITH_CLASSIC_BODY), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as RelayOrderInfoJSON;
        // Expect relay to always be preferred over classic if requested together
        expect(JSON.parse(res.body).routing).toEqual(RoutingType.RELAY);
        expect(quoteJSON.input.amount).toBe(RELAY_QUOTE_EXACT_IN_BETTER.amountIn.toString());

        const allQuotes = JSON.parse(res.body).allQuotes;
        expect(allQuotes.length).toEqual(2);
        expect(allQuotes[0].routing).toEqual(RoutingType.RELAY);
        expect(allQuotes[1].routing).toEqual(RoutingType.CLASSIC);
      });

      it('handles exactOut relay quotes', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_OUT_WORSE_GAS_TOKEN),
          [RoutingType.RELAY]: RelayQuoterMock(RELAY_QUOTE_EXACT_OUT_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(RELAY_REQUEST_BODY_EXACT_OUT), {} as unknown as Context);
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as RelayOrderInfoJSON;
        expect(quoteJSON.input.amount).toBe(RELAY_QUOTE_EXACT_OUT_BETTER.amountIn.toString());
      });

      it('returns allQuotes', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

        const allQuotes = JSON.parse(res.body).allQuotes;
        expect(allQuotes.length).toEqual(2);
        expect(allQuotes[0].routing).toEqual('DUTCH_LIMIT');
        expect(allQuotes[1].routing).toEqual('CLASSIC');
      });

      it('returns requestId', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

        const requestId = JSON.parse(res.body).requestId;
        expect(requestId).toBeDefined();
      });

      it('returns null in allQuotes on quote failure', async () => {
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

        const allQuotes = JSON.parse(res.body).allQuotes;
        expect(allQuotes.length).toEqual(2);
        expect(allQuotes[0].routing).toEqual('DUTCH_LIMIT');
        expect(allQuotes[1]).toEqual(null);
      });

      it('always returns correct permit for DL', async () => {
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

        const responseBody = JSON.parse(response.body);
        const permitData = responseBody.quote.permitData;
        const quote = responseBody.quote.orderInfo as DutchOrderInfoJSON;
        expect(permitData.values.permitted.token).toBe(quote.input.token);
        expect(permitData.values.witness.inputToken).toBe(quote.input.token);
        expect(permitData.values.witness.outputs[0].token).toBe(quote.outputs[0].token);
        expect(permit2Fetcher.fetchAllowance).not.toHaveBeenCalled();
      });

      it('always returns correct permit for relay', async () => {
        const quoters = {
          [RoutingType.RELAY]: RelayQuoterMock(RELAY_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(RELAY_REQUEST_WITH_CLASSIC_BODY), {} as unknown as Context);

        const responseBody = JSON.parse(response.body);
        const permitData = responseBody.quote.permitData;
        const quote = responseBody.quote.orderInfo as RelayOrderInfoJSON;
        expect(permitData.values.permitted[0].token).toBe(quote.input.token);
        expect(BigNumber.from(permitData.values.permitted[0].amount).eq(quote.input.amount)).toBe(true);
        expect(permitData.values.permitted[1].token).toBe(quote.fee.token);
        expect(BigNumber.from(permitData.values.permitted[1].amount).eq(quote.fee.endAmount)).toBe(true);
        expect(BigNumber.from(permitData.values.witness.fee.startAmount).eq(quote.fee.startAmount)).toBe(true);
        expect(BigNumber.from(permitData.values.witness.fee.endAmount).eq(quote.fee.endAmount)).toBe(true);
        expect(permit2Fetcher.fetchAllowance).not.toHaveBeenCalled();
      });

      it('returns permit for Classic with swapper and current permit invalid', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock({
          ...PERMIT_DETAILS,
          amount: '0',
        });
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        jest.useFakeTimers({
          now: 0,
        });
        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent({
            ...CLASSIC_REQUEST_BODY,
            swapper: SWAPPER,
          }),
          {} as unknown as Context
        );
        const responseBody = JSON.parse(response.body);

        expect(responseBody.quote.permitData).toMatchObject(PERMIT2_USED);
        expect(permit2Fetcher.fetchAllowance).toHaveBeenCalledWith(
          CLASSIC_REQUEST_BODY.tokenInChainId,
          SWAPPER,
          CLASSIC_REQUEST_BODY.tokenIn,
          UNIVERSAL_ROUTER_ADDRESS(1)
        );
        jest.clearAllTimers();
      });

      it('does not return permit for Classic with swapper and current permit valid', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        jest.useFakeTimers({
          now: 0,
        });
        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(CLASSIC_REQUEST_BODY), {} as unknown as Context);
        const responseBody = JSON.parse(response.body);

        expect(responseBody.quote.permitData).toBeUndefined();
        expect(permit2Fetcher.fetchAllowance).toHaveBeenCalledWith(
          CLASSIC_REQUEST_BODY.tokenInChainId,
          SWAPPER,
          CLASSIC_REQUEST_BODY.tokenIn,
          UNIVERSAL_ROUTER_ADDRESS(1)
        );
        jest.clearAllTimers();
      });

      it('does not return permit for Classic with no swapper', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(
            createClassicQuote({ quote: '1', quoteGasAdjusted: '1' }, { type: 'EXACT_INPUT', swapper: undefined })
          ),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        jest.useFakeTimers({
          now: 0,
        });
        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent({
            ...CLASSIC_REQUEST_BODY,
            swapper: undefined,
          }),
          {} as unknown as Context
        );
        const responseBody = JSON.parse(response.body);

        expect(responseBody.quote.permitData).toBeUndefined();
        expect(permit2Fetcher.fetchAllowance).not.toHaveBeenCalled();
        jest.clearAllTimers();
      });

      it('fails if symbol does not exist', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT], true);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

        const responseBody = JSON.parse(res.body);
        expect(res.statusCode).toBe(500);
        expect(responseBody.errorCode).toBe('INTERNAL_ERROR');
      });

      it('always returns encodedOrder in quote for DL', async () => {
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

        const responseBody = JSON.parse(response.body);
        const quote = responseBody.quote;
        expect(quote.encodedOrder).not.toBe(null);
      });

      it('always returns encodedOrder in quote for relay', async () => {
        const quoters = {
          [RoutingType.RELAY]: RelayQuoterMock(RELAY_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const response = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(RELAY_REQUEST_WITH_CLASSIC_BODY), {} as unknown as Context);

        const responseBody = JSON.parse(response.body);
        const quote = responseBody.quote;
        expect(quote.encodedOrder).not.toBe(null);
      });

      it('returns 500 when quoters 429 and there are no valid DL quotes', async () => {
        const message = 'Request failed with status code 429';
        const axiosResponse = {
          status: 429,
          message,
        } as any;
        const axiosError = new AxiosError(message, '429', {} as any, {}, axiosResponse);
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterErrorMock(axiosError),
          [RoutingType.CLASSIC]: RfqQuoterErrorMock(axiosError),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(DL_REQUEST_BODY), {} as unknown as Context);
        expect(res.statusCode).toBe(500);
        const errorResponseJson = JSON.parse(res.body);
        expect(errorResponseJson.errorCode).toBe(ErrorCode.QuoteError);
        expect(errorResponseJson.detail).toBe(message + ', ' + message);
      });

      it('returns 500 when quoters 500 and there are no valid DL quotes', async () => {
        const message = 'Request failed with status code 500';
        const axiosResponse = {
          status: 500,
          message,
        } as any;
        const axiosError = new AxiosError(message, '500', {} as any, {}, axiosResponse);
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterErrorMock(axiosError),
          [RoutingType.CLASSIC]: RfqQuoterErrorMock(axiosError),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(DL_REQUEST_BODY), {} as unknown as Context);
        expect(res.statusCode).toBe(500);
        const errorResponseJson = JSON.parse(res.body);
        expect(errorResponseJson.errorCode).toBe(ErrorCode.QuoteError);
        expect(errorResponseJson.detail).toBe(message + ', ' + message);
      });

      it('returns 500 when quoters 5xx and there are no valid DL quotes', async () => {
        const message = 'Request failed with status code 502';
        const axiosResponse = {
          status: 502,
          message,
        } as any;
        const axiosError = new AxiosError(message, '502', {} as any, {}, axiosResponse);
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterErrorMock(axiosError),
          [RoutingType.CLASSIC]: RfqQuoterErrorMock(axiosError),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(DL_REQUEST_BODY), {} as unknown as Context);
        expect(res.statusCode).toBe(500);
        const errorResponseJson = JSON.parse(res.body);
        expect(errorResponseJson.errorCode).toBe(ErrorCode.QuoteError);
        expect(errorResponseJson.detail).toBe(message + ', ' + message);
      });

      describe('Synthetic quote eligible token filtering', () => {
        it('should filter out synthetic quote when tokens are eligible but switch returns false', async () => {
          const quoters = {
            [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
          const syntheticStatusProvider = SyntheticStatusProviderMock(false);

          const res = await getQuoteHandler(
            quoters,
            tokenFetcher,
            portionFetcher,
            permit2Fetcher,
            syntheticStatusProvider
          ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI), {} as unknown as Context);

          const bodyJSON = JSON.parse(res.body);
          expect(bodyJSON.routing).toEqual(RoutingType.CLASSIC);
        });

        it('should not filter out synthetic quote when tokens are eligible', async () => {
          const quoters = {
            [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
          const syntheticStatusProvider = SyntheticStatusProviderMock(true);

          const res = await getQuoteHandler(
            quoters,
            tokenFetcher,
            portionFetcher,
            permit2Fetcher,
            syntheticStatusProvider
          ).handler(getEvent(QUOTE_REQUEST_BODY_MULTI_SYNTHETIC), {} as unknown as Context);

          const bodyJSON = JSON.parse(res.body);
          expect(bodyJSON.routing).toEqual(RoutingType.DUTCH_LIMIT);
        });
      });

      describe('removes ineligible dutch requests', () => {
        it('removes dutch request if token in is not eligible', async () => {
          const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
          const syntheticStatusProvider = SyntheticStatusProviderMock(false);

          const res = await getQuoteHandler(
            quoters,
            tokenFetcher,
            portionFetcher,
            permit2Fetcher,
            syntheticStatusProvider
          ).handler(getEvent({ ...DL_REQUEST_BODY, tokenIn: INELIGIBLE_TOKEN }), {} as unknown as Context);
          const quoteJSON = JSON.parse(res.body);
          expect(quoteJSON.errorCode).toEqual(ErrorCode.QuoteError);
        });

        it('removes dutch request if token out is not eligible', async () => {
          const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
          const syntheticStatusProvider = SyntheticStatusProviderMock(false);

          const res = await getQuoteHandler(
            quoters,
            tokenFetcher,
            portionFetcher,
            permit2Fetcher,
            syntheticStatusProvider
          ).handler(getEvent({ ...DL_REQUEST_BODY, tokenOut: INELIGIBLE_TOKEN }), {} as unknown as Context);
          const quoteJSON = JSON.parse(res.body);
          expect(quoteJSON.errorCode).toEqual(ErrorCode.QuoteError);
        });
      });
    });

    describe('logging test', () => {
      it('logs the requests and response in correct format', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        await getQuoteHandler(quoters, tokenFetcher, portionFetcher, permit2Fetcher, syntheticStatusProvider).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );
        expect(LOGGER_MOCK.info).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'UnifiedRoutingQuoteRequest',
            body: expect.objectContaining({
              tokenInChainId: QUOTE_REQUEST_BODY_MULTI.tokenInChainId,
              tokenOutChainId: QUOTE_REQUEST_BODY_MULTI.tokenOutChainId,
              tokenIn: QUOTE_REQUEST_BODY_MULTI.tokenIn,
              tokenOut: QUOTE_REQUEST_BODY_MULTI.tokenOut,
              amount: QUOTE_REQUEST_BODY_MULTI.amount,
              type: QUOTE_REQUEST_BODY_MULTI.type,
              swapper: SWAPPER,
              configs: 'DUTCH_LIMIT,CLASSIC',
              createdAt: expect.any(String),
              createdAtMs: expect.any(String),
            }),
          })
        );

        expect(LOGGER_MOCK.info).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'UnifiedRoutingQuoteResponse',
            body: expect.objectContaining({
              tokenInChainId: QUOTE_REQUEST_BODY_MULTI.tokenInChainId,
              tokenOutChainId: QUOTE_REQUEST_BODY_MULTI.tokenOutChainId,
              quoteId: 'quoteId',
              tokenIn: QUOTE_REQUEST_BODY_MULTI.tokenIn,
              tokenOut: QUOTE_REQUEST_BODY_MULTI.tokenOut,
              amountIn: DL_QUOTE_EXACT_IN_BETTER.amountIn.toString(),
              amountOut: DL_QUOTE_EXACT_IN_BETTER.amountOut.toString(),
              swapper: DL_QUOTE_EXACT_IN_BETTER.swapper,
              filler: DL_QUOTE_EXACT_IN_BETTER.filler,
              routing: DL_QUOTE_EXACT_IN_BETTER.routingType,
              createdAt: expect.any(String),
              createdAtMs: expect.any(String),
            }),
          })
        );
      });
    });

    describe('parseAndValidateRequest', () => {
      it('Succeeds - Classic Quote', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE) };
        const event = {
          body: JSON.stringify(CLASSIC_REQUEST_BODY),
        } as APIGatewayProxyEvent;
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).parseAndValidateRequest(event, LOGGER_MOCK as unknown as Logger);
        expect(res.state).toBe('valid');
      });

      it('Succeeds - Relay Quote', async () => {
        const quoters = { [RoutingType.RELAY]: RelayQuoterMock(RELAY_QUOTE_EXACT_IN_BETTER) };
        const event = {
          body: JSON.stringify(RELAY_REQUEST_BODY),
        } as APIGatewayProxyEvent;
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).parseAndValidateRequest(event, LOGGER_MOCK as unknown as Logger);
        expect(res.state).toBe('valid');
      });

      it('Succeeds - Bad swapper address', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE) };
        const event = {
          body: JSON.stringify({
            ...CLASSIC_REQUEST_BODY,
            swapper: 'bad address',
          }),
        } as APIGatewayProxyEvent;
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).parseAndValidateRequest(event, LOGGER_MOCK as unknown as Logger);
        expect(res.state).toBe('invalid');
      });

      it('Succeeds - UniswapX Quote', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        const event = {
          body: JSON.stringify(DL_REQUEST_BODY),
        } as APIGatewayProxyEvent;
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
        const syntheticStatusProvider = SyntheticStatusProviderMock(false);

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).parseAndValidateRequest(event, LOGGER_MOCK as unknown as Logger);
        expect(res.state).toBe('valid');
      });
    });
  });

  describe('compareQuotes', () => {
    it('returns true if lhs is a better dutch limit quote than rhs', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, DL_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(true);
    });

    it('returns true if lhs is a better dutch limit with portion quote than rhs', () => {
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(true);
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          DL_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(true);
    });

    it('returns false if lhs is a worse dutch limit quote than rhs', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_WORSE, DL_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(false);
    });

    it('returns false if lhs is a worse dutch limit with portion quote than rhs', () => {
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(false);
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(false);
    });

    it('returns true if lhs is a better classic quote', () => {
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(
        true
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
    });

    it('returns true if lhs is a better classic with portion quote', () => {
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(true);
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(true);
    });

    it('returns false if lhs is a worse classic quote', () => {
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_WORSE, CLASSIC_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(
        false
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_WORSE, CLASSIC_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
    });

    it('returns false if lhs is a worse classic with portion quote', () => {
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(false);
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(false);
    });

    it('returns true if lhs is a better relay quote than rhs', () => {
      expect(compareQuotes(RELAY_QUOTE_EXACT_IN_BETTER, RELAY_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(RELAY_QUOTE_EXACT_OUT_BETTER, RELAY_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
    });

    it('returns false if lhs is a worse relay quote than rhs', () => {
      expect(compareQuotes(RELAY_QUOTE_EXACT_IN_WORSE, RELAY_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(RELAY_QUOTE_EXACT_OUT_WORSE, RELAY_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
    });

    it('expect relay to always be preferred over classic', () => {
      expect(compareQuotes(RELAY_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(
        true
      );
      // expect to be the same
      expect(
        RELAY_QUOTE_EXACT_IN_BETTER.classicQuote.amountOutGasAndPortionAdjusted.eq(
          CLASSIC_QUOTE_EXACT_IN_BETTER.amountOutGasAndPortionAdjusted
        )
      ).toBe(true);

      expect(compareQuotes(RELAY_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
      // expect to be the same
      expect(
        RELAY_QUOTE_EXACT_OUT_BETTER.classicQuote.amountInGasAndPortionAdjusted.eq(
          CLASSIC_QUOTE_EXACT_OUT_BETTER.amountInGasAndPortionAdjusted
        )
      ).toBe(true);
    });

    it('returns true if lhs is a better dutch quote than rhs relay', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, RELAY_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, RELAY_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(true);
    });

    it('returns true if lhs is a better relay quote than rhs dutch', () => {
      expect(compareQuotes(RELAY_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(RELAY_QUOTE_EXACT_OUT_BETTER, DL_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(true);
    });

    it('returns true if lhs is a better mixed type', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
      expect(compareQuotes(RELAY_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(RELAY_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(
        true
      );
      expect(compareQuotes(RELAY_QUOTE_EXACT_OUT_BETTER, DL_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(true);
    });

    it('returns true if lhs is a better mixed type with portion', () => {
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(true);
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(true);
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(true);
    });

    it('returns false if lhs is a worse mixed type', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_WORSE, CLASSIC_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_WORSE, DL_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_WORSE, CLASSIC_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
    });

    it('returns false if lhs is a worse mixed type with portion', () => {
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(false);
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_IN_WORSE_WITH_PORTION,
          DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION,
          TradeType.EXACT_INPUT
        )
      ).toBe(false);
      expect(
        compareQuotes(
          DL_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          CLASSIC_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(false);
      expect(
        compareQuotes(
          CLASSIC_QUOTE_EXACT_OUT_WORSE_WITH_PORTION,
          DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION,
          TradeType.EXACT_OUTPUT
        )
      ).toBe(false);
    });
  });

  describe('getBestQuote', () => {
    const quoterMock = (quote: Quote): Quoter => {
      return {
        // eslint-disable-next-line no-unused-labels
        quote: () => Promise.resolve(quote),
      };
    };

    const nullQuoterMock = (): Quoter => {
      return {
        // eslint-disable-next-line no-unused-labels
        quote: () => Promise.resolve(null),
      };
    };

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('returns null if the only specified quoter in config returns null', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        DUTCH_LIMIT: nullQuoterMock(),
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toBeNull();
    });

    it('only considers quoters that did not throw', async () => {
      const quoters: QuoterByRoutingType = {
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
        DUTCH_LIMIT: nullQuoterMock(),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the best quote among two dutch limit quotes', async () => {
      let quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
      };
      let quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      quoters = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
      };
      quotes = quotes.concat(await getQuotes(quoters, [QUOTE_REQUEST_DL]));
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the best quote among two dutch v2 quotes', async () => {
      let quoters: QuoterByRoutingType = {
        DUTCH_V2: quoterMock(V2_QUOTE_EXACT_IN_BETTER),
      };
      let quotes = await getQuotes(quoters, [QUOTE_REQUEST_DUTCH_V2]);
      quoters = {
        DUTCH_V2: quoterMock(V2_QUOTE_EXACT_IN_WORSE),
      };
      quotes = quotes.concat(await getQuotes(quoters, [QUOTE_REQUEST_DUTCH_V2]));
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(V2_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the best quote among two dutch limit with portion quotes', async () => {
      let quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION),
      };
      let quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      quoters = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION),
      };
      quotes = quotes.concat(await getQuotes(quoters, [QUOTE_REQUEST_DL]));
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION);
    });

    it('returns the dutch limit quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE);
    });

    it('returns the dutch limit with portion quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION),
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION);
    });

    it('returns the classic quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the classic with portion quote among one DL with portion quote and one classic with portion quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE_WITH_PORTION),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(CLASSIC_QUOTE_EXACT_IN_BETTER_WITH_PORTION);
    });

    it('returns the DL quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });

    it('returns the DL with portion quote among one DL with portion quote and one classic with portion quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE_WITH_PORTION),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER_WITH_PORTION);
    });

    it('returns the DL with portion quote among one DL with portion quote and one classic with portion quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_OUT_WORSE_WITH_PORTION),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_OUT_BETTER_WITH_PORTION);
    });
  });

  describe('removeDutchRequests', () => {
    it('removes all dutch limit requests', () => {
      const requests = removeDutchRequests([QUOTE_REQUEST_DL, QUOTE_REQUEST_CLASSIC]);
      expect(requests).toEqual([QUOTE_REQUEST_CLASSIC]);
    });
  });

  describe('Failure Cases', () => {
    const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
    const portionFetcher = PortionFetcherMock(GET_NO_PORTION_RESPONSE);
    const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);
    const syntheticStatusProvider = SyntheticStatusProviderMock(false);

    function buildClassicRequestBody(requestInfo: Partial<QuoteRequestBodyJSON>): QuoteRequestBodyJSON {
      return {
        ...BASE_REQUEST_INFO_EXACT_IN,
        configs: [
          {
            routingType: RoutingType.CLASSIC,
            protocols: ['V3', 'V2', 'MIXED'],
          },
        ],
        ...requestInfo,
      };
    }

    describe('Validation', () => {
      it('chainId mismatch', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(buildClassicRequestBody({ tokenInChainId: 1, tokenOutChainId: 10 })),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toBe('Cannot request quotes for tokens on different chains');
      });

      it('Throws RPC error for unknown chain', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(buildClassicRequestBody({ tokenInChainId: 1234, tokenOutChainId: 1234 })),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"tokenInChainId" must be one of');
      });

      it('invalid tokenIn', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(buildClassicRequestBody({ tokenIn: '0x00000000000000000000000000000000000000000' })),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"tokenIn" length must be');
      });

      it('invalid tokenOut', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(buildClassicRequestBody({ tokenOut: '0x00000000000000000000000000000000000000000' })),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"tokenOut" length must be');
      });

      it('negative amount', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(buildClassicRequestBody({ amount: '-1234' })), {} as unknown as Context);

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('Invalid amount: negative number');
      });

      it('invalid tradeType', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(buildClassicRequestBody({ type: 'NOT_EXACT' })), {} as unknown as Context);

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"type" must be one of');
      });

      it('Unknown config type', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(
            buildClassicRequestBody({
              configs: [
                {
                  routingType: 'UNKNOWN',
                } as any,
              ],
            })
          ),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"configs[0]" does not match any of the allowed types');
      });

      it('no configs', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(getEvent(buildClassicRequestBody({ configs: [] })), {} as unknown as Context);

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"configs" must contain at least 1 items');
      });

      it('duplicate config', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(
            buildClassicRequestBody({
              configs: [
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['V3', 'V2', 'MIXED'],
                },
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['V3'],
                },
              ],
            })
          ),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('Duplicate routingType in configs');
      });

      it('required sub-fields are validated', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(
            buildClassicRequestBody({
              configs: [
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['UNKNOWN_VERSION'],
                },
              ],
            })
          ),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"configs[0]" does not match any of the allowed types');
      });

      it('optional sub-fields are validated', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(
            buildClassicRequestBody({
              configs: [
                {
                  routingType: RoutingType.CLASSIC,
                  protocols: ['V2'],
                  recipient: '0x0000',
                },
              ],
            })
          ),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"configs[0]" does not match any of the allowed types');
      });

      it('Invalid exclusivity override', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(
            buildClassicRequestBody({
              configs: [
                {
                  routingType: RoutingType.DUTCH_LIMIT,
                  swapper: SWAPPER,
                  useSyntheticQuotes: true,
                  exclusivityOverrideBps: -1,
                },
              ],
            })
          ),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"configs[0]" does not match any of the allowed types');
      });

      it('Invalid exclusivity override', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER) };

        const res = await getQuoteHandler(
          quoters,
          tokenFetcher,
          portionFetcher,
          permit2Fetcher,
          syntheticStatusProvider
        ).handler(
          getEvent(
            buildClassicRequestBody({
              configs: [
                {
                  routingType: RoutingType.DUTCH_LIMIT,
                  swapper: SWAPPER,
                  useSyntheticQuotes: true,
                  auctionPeriodSecs: -1,
                },
              ],
            })
          ),
          {} as unknown as Context
        );

        expect(res.statusCode).toBe(400);
        const { errorCode, detail } = JSON.parse(res.body);
        expect(errorCode).toBe('VALIDATION_ERROR');
        expect(detail).toContain('"configs[0]" does not match any of the allowed types');
      });
    });
  });
});
