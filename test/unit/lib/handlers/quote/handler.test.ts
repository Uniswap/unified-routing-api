import { ChainId, TradeType } from '@uniswap/sdk-core';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { default as Logger } from 'bunyan';
import {
  BASE_REQUEST_INFO_EXACT_OUT,
  CLASSIC_QUOTE_EXACT_IN_BETTER,
  CLASSIC_QUOTE_EXACT_IN_WORSE,
  CLASSIC_QUOTE_EXACT_OUT_BETTER,
  CLASSIC_QUOTE_EXACT_OUT_WORSE,
  CLASSIC_REQUEST_BODY,
  createClassicQuote,
  DL_QUOTE_EXACT_IN_BETTER,
  DL_QUOTE_EXACT_IN_WORSE,
  DL_QUOTE_EXACT_OUT_BETTER,
  DL_QUOTE_EXACT_OUT_WORSE,
  DL_REQUEST_BODY,
  QUOTE_REQUEST_BODY_MULTI,
  QUOTE_REQUEST_BODY_MULTI_SYNTHETIC,
  QUOTE_REQUEST_CLASSIC,
  QUOTE_REQUEST_DL,
  QUOTE_REQUEST_MULTI,
} from '../../../../utils/fixtures';

import { PermitDetails } from '@uniswap/permit2-sdk';
import { DutchOrderInfoJSON } from '@uniswap/uniswapx-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { MetricsLogger } from 'aws-embedded-metrics';
import { RoutingType } from '../../../../../lib/constants';
import { ClassicQuote, ClassicQuoteDataJSON, DutchQuote, Quote } from '../../../../../lib/entities';
import { QuoteRequestBodyJSON } from '../../../../../lib/entities/request/index';
import { Permit2Fetcher } from '../../../../../lib/fetchers/Permit2Fetcher';
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
import { Quoter } from '../../../../../lib/providers/quoters';
import { Erc20__factory } from '../../../../../lib/types/ext/factories/Erc20__factory';
import { setGlobalLogger } from '../../../../../lib/util/log';
import { PERMIT2_USED, PERMIT_DETAILS, SWAPPER, TOKEN_IN, TOKEN_OUT } from '../../../../constants';

describe('QuoteHandler', () => {
  const OLD_ENV = process.env;

  beforeAll(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = {
      ...OLD_ENV,
      SYNTHETIC_ELIGIBLE_TOKENS: `{"1":["${TOKEN_IN.toLowerCase()}", "${TOKEN_OUT.toLowerCase()}"]}`,
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
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      child: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      }),
    };

    const metrics = {
      putMetric: jest.fn(),
    };
    const requestInjectedMock: Promise<ApiRInj> = new Promise((resolve) => {
      setGlobalLogger(logger as any);
      resolve({
        log: logger as unknown as Logger,
        requestId: 'test',
        metrics: metrics as unknown as MetricsLogger,
      }) as unknown as ApiRInj;
    });

    const injectorPromiseMock = (
      quoters: QuoterByRoutingType,
      tokenFetcher: TokenFetcher,
      permit2Fetcher: Permit2Fetcher
    ): Promise<ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>> =>
      new Promise((resolve) =>
        resolve({
          getContainerInjected: (): ContainerInjected => {
            const rpcUrlMap = new Map<ChainId, string>();
            for (const chain of Object.values(ChainId)) {
              rpcUrlMap.set(chain as ChainId, 'url');
            }
            return {
              quoters: quoters,
              tokenFetcher: tokenFetcher,
              permit2Fetcher: permit2Fetcher,
              rpcUrlMap,
            };
          },
          getRequestInjected: () => requestInjectedMock,
        } as unknown as ApiInjector<ContainerInjected, ApiRInj, QuoteRequestBodyJSON, void>)
      );

    const getQuoteHandler = (
      quoters: QuoterByRoutingType,
      tokenFetcher: TokenFetcher,
      permit2Fetcher: Permit2Fetcher
    ) => new QuoteHandler('quote', injectorPromiseMock(quoters, tokenFetcher, permit2Fetcher));

    const RfqQuoterMock = (dlQuote: DutchQuote): Quoter => {
      return {
        quote: jest.fn().mockResolvedValue(dlQuote),
      };
    };

    const ClassicQuoterMock = (classicQuote: ClassicQuote): Quoter => {
      return {
        quote: jest.fn().mockResolvedValue(classicQuote),
      };
    };
    const TokenFetcherMock = (addresses: string[], isError = false): TokenFetcher => {
      const fetcher = {
        resolveTokenAddress: jest.fn(),
      };

      if (isError) {
        fetcher.resolveTokenAddress.mockRejectedValue(new Error('error'));
        return fetcher as unknown as TokenFetcher;
      }

      for (const address of addresses) {
        fetcher.resolveTokenAddress.mockResolvedValueOnce(address);
      }
      return fetcher as unknown as TokenFetcher;
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
    const getEvent = (request: QuoteRequestBodyJSON): APIGatewayProxyEvent =>
      ({
        body: JSON.stringify(request),
      } as APIGatewayProxyEvent);

    describe('handler test', () => {
      it('handles exactIn classic quotes', async () => {
        const quoters = { [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(CLASSIC_REQUEST_BODY),
          {} as unknown as Context
        );
        const quoteJSON = JSON.parse(res.body).quote as ClassicQuoteDataJSON;
        expect(quoteJSON.quoteGasAdjusted).toBe(CLASSIC_QUOTE_EXACT_IN_WORSE.amountOutGasAdjusted.toString());
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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(request),
          {} as unknown as Context
        );
        const quoteJSON = JSON.parse(res.body).quote as ClassicQuoteDataJSON;
        expect(quoteJSON.quoteGasAdjusted).toBe(CLASSIC_QUOTE_EXACT_OUT_WORSE.amountInGasAdjusted.toString());
      });

      it('handles exactIn DL quotes', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(DL_REQUEST_BODY),
          {} as unknown as Context
        );
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as DutchOrderInfoJSON;
        expect(quoteJSON.outputs[0].startAmount).toBe(DL_QUOTE_EXACT_IN_BETTER.amountOut.toString());
      });

      it('handles exactOut DL quotes', async () => {
        const request = {
          ...BASE_REQUEST_INFO_EXACT_OUT,
          configs: [
            {
              routingType: RoutingType.DUTCH_LIMIT,
              swapper: '0x0000000000000000000000000000000000000000',
              exclusivityOverrideBps: 12,
              auctionPeriodSecs: 60,
              deadlineBufferSecs: 12,
            },
          ],
        };
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_OUT_BETTER) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(request),
          {} as unknown as Context
        );
        const quoteJSON = JSON.parse(res.body).quote.orderInfo as DutchOrderInfoJSON;
        expect(quoteJSON.input.startAmount).toBe(DL_QUOTE_EXACT_OUT_BETTER.amountIn.toString());
      });

      it('sets the DL quote endAmount using classic quote', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );
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

      it('returns allQuotes', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );

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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );

        const requestId = JSON.parse(res.body).requestId;
        expect(requestId).toBeDefined();
      });

      it('returns null in allQuotes on quote failure', async () => {
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );

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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const response = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );

        const responseBody = JSON.parse(response.body);
        const permitData = responseBody.quote.permitData;
        const quote = responseBody.quote.orderInfo as DutchOrderInfoJSON;
        expect(permitData.values.permitted.token).toBe(quote.input.token);
        expect(permitData.values.witness.inputToken).toBe(quote.input.token);
        expect(permitData.values.witness.outputs[0].token).toBe(quote.outputs[0].token);
        expect(permit2Fetcher.fetchAllowance).not.toHaveBeenCalled();
      });

      it('returns permit for Classic with swapper and current permit invalid', async () => {
        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock({
          ...PERMIT_DETAILS,
          amount: '0',
        });

        jest.useFakeTimers({
          now: 0,
        });
        const response = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        jest.useFakeTimers({
          now: 0,
        });
        const response = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(CLASSIC_REQUEST_BODY),
          {} as unknown as Context
        );
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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        jest.useFakeTimers({
          now: 0,
        });
        const response = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );

        const responseBody = JSON.parse(res.body);
        expect(res.statusCode).toBe(500);
        expect(responseBody.errorCode).toBe('INTERNAL_ERROR');
      });

      it('always returns encodedOrder in quote for DL', async () => {
        const quoters = {
          [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const response = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );

        const responseBody = JSON.parse(response.body);
        const quote = responseBody.quote;
        expect(quote.encodedOrder).not.toBe(null);
      });

      describe('Synthetic quote eligible token filtering', () => {
        it('should not filter out synthetic quote when tokens are eligible', async () => {
          const quoters = {
            [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
          };
          const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
          const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

          const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
            getEvent(QUOTE_REQUEST_BODY_MULTI_SYNTHETIC),
            {} as unknown as Context
          );

          const bodyJSON = JSON.parse(res.body);
          expect(bodyJSON.routing).toEqual(RoutingType.DUTCH_LIMIT);
        });
      });

      it('should filter out synthetic quote when the TOKEN_IN is not in the eligible token list', async () => {
        // remove TOKEN_IN from eligible tokens
        const OLD_ENV = process.env;
        process.env = {
          ...OLD_ENV,
          SYNTHETIC_ELIGIBLE_TOKENS: `{"1":["${TOKEN_OUT.toLowerCase()}"]}`,
        };

        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI_SYNTHETIC),
          {} as unknown as Context
        );

        const bodyJSON = JSON.parse(res.body);

        // restore env
        process.env = OLD_ENV;

        expect(bodyJSON.routing).toEqual(RoutingType.CLASSIC);
      });

      it('should filter out synthetic quote when the TOKEN_OUT is not in the eligible token list', async () => {
        // remove TOKEN_IN from eligible tokens
        const OLD_ENV = process.env;
        process.env = {
          ...OLD_ENV,
          SYNTHETIC_ELIGIBLE_TOKENS: `{"1":["${TOKEN_IN.toLowerCase()}"]}`,
        };

        const quoters = {
          [RoutingType.CLASSIC]: ClassicQuoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
        };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI_SYNTHETIC),
          {} as unknown as Context
        );

        const bodyJSON = JSON.parse(res.body);

        // restore env
        process.env = OLD_ENV;

        expect(bodyJSON.routing).toEqual(RoutingType.CLASSIC);
      });
    });

    describe('logging test', () => {
      it('logs the requests and response in correct format', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).handler(
          getEvent(QUOTE_REQUEST_BODY_MULTI),
          {} as unknown as Context
        );
        expect(logger.info).toHaveBeenCalledWith(
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
            }),
          })
        );

        expect(logger.info).toHaveBeenCalledWith(
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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).parseAndValidateRequest(
          event,
          logger as unknown as Logger
        );
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
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).parseAndValidateRequest(
          event,
          logger as unknown as Logger
        );
        expect(res.state).toBe('invalid');
      });

      it('Succeeds - UniswapX Quote', async () => {
        const quoters = { [RoutingType.DUTCH_LIMIT]: RfqQuoterMock(DL_QUOTE_EXACT_IN_BETTER) };
        const event = {
          body: JSON.stringify(DL_REQUEST_BODY),
        } as APIGatewayProxyEvent;
        const tokenFetcher = TokenFetcherMock([TOKEN_IN, TOKEN_OUT]);
        const permit2Fetcher = Permit2FetcherMock(PERMIT_DETAILS);

        const res = await getQuoteHandler(quoters, tokenFetcher, permit2Fetcher).parseAndValidateRequest(
          event,
          logger as unknown as Logger
        );
        expect(res.state).toBe('valid');
      });
    });
  });

  describe('compareQuotes', () => {
    it('returns true if lhs is a better dutch limit quote than rhs', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, DL_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(true);
    });

    it('returns false if lhs is a worse dutch limit quote than rhs', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_WORSE, DL_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(false);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_WORSE, DL_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(false);
    });

    it('returns true if lhs is a better classic quote', () => {
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(
        true
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
    });

    it('returns false if lhs is a worse classic quote', () => {
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_WORSE, CLASSIC_QUOTE_EXACT_IN_BETTER, TradeType.EXACT_INPUT)).toBe(
        false
      );
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_OUT_WORSE, CLASSIC_QUOTE_EXACT_OUT_BETTER, TradeType.EXACT_OUTPUT)).toBe(
        false
      );
    });

    it('returns true if lhs is a better mixed type', () => {
      expect(compareQuotes(DL_QUOTE_EXACT_IN_BETTER, CLASSIC_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(CLASSIC_QUOTE_EXACT_IN_BETTER, DL_QUOTE_EXACT_IN_WORSE, TradeType.EXACT_INPUT)).toBe(true);
      expect(compareQuotes(DL_QUOTE_EXACT_OUT_BETTER, CLASSIC_QUOTE_EXACT_OUT_WORSE, TradeType.EXACT_OUTPUT)).toBe(
        true
      );
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

    it('returns the dutch limit quote if no classic specified', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_WORSE),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_BETTER),
      };
      const quotes = await getQuotes(quoters, [QUOTE_REQUEST_DL]);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_WORSE);
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

    it('returns the DL quote among one DL quote and one classic quote', async () => {
      const quoters: QuoterByRoutingType = {
        DUTCH_LIMIT: quoterMock(DL_QUOTE_EXACT_IN_BETTER),
        CLASSIC: quoterMock(CLASSIC_QUOTE_EXACT_IN_WORSE),
      };
      const quotes = await getQuotes(quoters, QUOTE_REQUEST_MULTI);
      const bestQuote = await getBestQuote(quotes);
      expect(bestQuote).toEqual(DL_QUOTE_EXACT_IN_BETTER);
    });
  });

  describe('removeDutchRequests', () => {
    it('removes all dutch limit requests', () => {
      const requests = removeDutchRequests([QUOTE_REQUEST_DL, QUOTE_REQUEST_CLASSIC]);
      expect(requests).toEqual([QUOTE_REQUEST_CLASSIC]);
    });
  });
});
