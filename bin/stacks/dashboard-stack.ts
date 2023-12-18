import { ChainId } from '@uniswap/sdk-core';
import { ID_TO_NETWORK_NAME } from '@uniswap/smart-order-router';
import * as cdk from 'aws-cdk-lib';
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import _ from 'lodash';
import { SUPPORTED_CHAINS } from '../../lib/config/chains';

export const METRIC_NAMESPACE = 'Uniswap';
export const METRIC_SERVICE_NAME = 'UnifiedRoutingAPI';

export type LambdaWidget = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: { view: string; stacked: boolean; metrics: string[][]; region: string; title: string; stat: string };
};

export interface DashboardProps extends cdk.NestedStackProps {
  apiName: string;
  quoteLambdaName: string;
}

export class DashboardStack extends cdk.NestedStack {
  constructor(scope: Construct, name: string, props: DashboardProps) {
    super(scope, name, props);

    const { apiName, quoteLambdaName } = props;
    const region = cdk.Stack.of(this).region;

    // No CDK resource exists for contributor insights at the moment so use raw CloudFormation.
    const REQUESTED_QUOTES_RULE_NAME = 'URARequestedQuotes';
    const REQUESTED_QUOTES_BY_CHAIN_RULE_NAME = 'URARequestedQuotesByChain';
    const RESPONSE_QUOTE_RULE_NAME = 'URAResponseQuotes';
    const RESPONSE_QUOTE_BY_CHAIN_RULE_NAME = 'URAResponseQuotesByChain';
    new cdk.CfnResource(this, 'URAQuoteContributorInsights', {
      type: 'AWS::CloudWatch::InsightRule',
      properties: {
        RuleBody: JSON.stringify({
          Schema: {
            Name: 'CloudWatchLogRule',
            Version: 1,
          },
          AggregateOn: 'Count',
          Contribution: {
            Filters: [
              {
                Match: '$.tokenPairSymbol',
                IsPresent: true,
              },
              {
                Match: '$.msg',
                StartsWith: ['tokens and chains request'],
              },
            ],
            Keys: ['$.tokenPairSymbol'],
          },
          LogFormat: 'JSON',
          LogGroupNames: [`/aws/lambda/${quoteLambdaName}`],
        }),
        RuleName: REQUESTED_QUOTES_RULE_NAME,
        RuleState: 'ENABLED',
      },
    });

    new cdk.CfnResource(this, 'URAQuoteByChainContributorInsights', {
      type: 'AWS::CloudWatch::InsightRule',
      properties: {
        RuleBody: JSON.stringify({
          Schema: {
            Name: 'CloudWatchLogRule',
            Version: 1,
          },
          AggregateOn: 'Count',
          Contribution: {
            Filters: [
              {
                Match: '$.tokenPairSymbolChain',
                IsPresent: true,
              },
              {
                Match: '$.msg',
                StartsWith: ['tokens and chains request'],
              },
            ],
            Keys: ['$.tokenPairSymbolChain'],
          },
          LogFormat: 'JSON',
          LogGroupNames: [`/aws/lambda/${quoteLambdaName}`],
        }),
        RuleName: REQUESTED_QUOTES_BY_CHAIN_RULE_NAME,
        RuleState: 'ENABLED',
      },
    });

    new cdk.CfnResource(this, 'URAResponseContributorInsights', {
      type: 'AWS::CloudWatch::InsightRule',
      properties: {
        RuleBody: JSON.stringify({
          Schema: {
            Name: 'CloudWatchLogRule',
            Version: 1,
          },
          AggregateOn: 'Count',
          Contribution: {
            Filters: [
              {
                Match: '$.tokenPairSymbol',
                IsPresent: true,
              },
              {
                Match: '$.msg',
                StartsWith: ['tokens and chains response'],
              },
            ],
            Keys: ['$.tokenPairSymbolBestQuote'],
          },
          LogFormat: 'JSON',
          LogGroupNames: [`/aws/lambda/${quoteLambdaName}`],
        }),
        RuleName: RESPONSE_QUOTE_RULE_NAME,
        RuleState: 'ENABLED',
      },
    });

    new cdk.CfnResource(this, 'URAResponseByChainContributorInsights', {
      type: 'AWS::CloudWatch::InsightRule',
      properties: {
        RuleBody: JSON.stringify({
          Schema: {
            Name: 'CloudWatchLogRule',
            Version: 1,
          },
          AggregateOn: 'Count',
          Contribution: {
            Filters: [
              {
                Match: '$.tokenPairSymbolChain',
                IsPresent: true,
              },
              {
                Match: '$.msg',
                StartsWith: ['tokens and chains response'],
              },
            ],
            Keys: ['$.tokenPairSymbolChainBestQuote'],
          },
          LogFormat: 'JSON',
          LogGroupNames: [`/aws/lambda/${quoteLambdaName}`],
        }),
        RuleName: RESPONSE_QUOTE_BY_CHAIN_RULE_NAME,
        RuleState: 'ENABLED',
      },
    });

    new aws_cloudwatch.CfnDashboard(this, 'UnifiedRoutingAPIDashboard', {
      dashboardName: `UnifiedRoutingDashboard`,
      dashboardBody: JSON.stringify({
        periodOverride: 'inherit',
        widgets: [
          {
            height: 6,
            width: 12,
            y: 0,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [
                ['AWS/ApiGateway', 'Count', 'ApiName', apiName, { label: 'Requests' }],
                ['.', '5XXError', '.', '.', { label: '5XXError Responses', color: '#ff7f0e' }],
                ['.', '4XXError', '.', '.', { label: '4XXError Responses', color: '#2ca02c' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Total Requests/Responses | 5min',
            },
          },
          {
            height: 6,
            width: 12,
            y: 0,
            x: 12,
            type: 'metric',
            properties: {
              metrics: [
                [
                  {
                    expression: 'm1 * 100',
                    label: '5XX Error Rate',
                    id: 'e1',
                    color: '#ff7f0e',
                  },
                ],
                [
                  {
                    expression: 'm2 * 100',
                    label: '4XX Error Rate',
                    id: 'e2',
                    color: '#2ca02c',
                  },
                ],
                ['AWS/ApiGateway', '5XXError', 'ApiName', apiName, { id: 'm1', label: '5XXError', visible: false }],
                ['.', '4XXError', '.', '.', { id: 'm2', visible: false }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Average',
              period: 300,
              title: '5XX/4XX Error Rates | 5min',
              setPeriodToTimeRange: true,
              yAxis: {
                left: {
                  showUnits: false,
                  label: '%',
                },
              },
            },
          },
          {
            type: 'metric',
            height: 6,
            width: 12,
            y: 6,
            x: 12,
            properties: {
              metrics: _.flatMap(
                _.uniq([...SUPPORTED_CHAINS.CLASSIC, ...SUPPORTED_CHAINS.DUTCH_LIMIT]),
                (chainId: ChainId) => [
                  [
                    {
                      expression: `(c${chainId}r2xx/c${chainId}r) * 100`,
                      label: `${ID_TO_NETWORK_NAME(chainId)} - Success Rate`,
                      id: `r2${chainId}`,
                    },
                  ],
                  [
                    'Uniswap',
                    `QuoteRequestedChainId${chainId}`,
                    'Service',
                    METRIC_SERVICE_NAME,
                    { id: `c${chainId}r`, visible: false },
                  ],
                  ['.', `QuoteResponseChainId${chainId}Status2XX`, '.', '.', { id: `c${chainId}r2xx`, visible: false }],
                ]
              ),
              view: 'timeSeries',
              stacked: false,
              stat: 'Sum',
              period: 300,
              region,
              title: 'Success Rates by Chain',
              yAxis: {
                left: {
                  showUnits: false,
                  label: '%',
                },
              },
            },
          },
          {
            height: 6,
            width: 12,
            y: 6,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [
                ['AWS/ApiGateway', 'Latency', 'ApiName', apiName, { stat: 'p90', label: 'p90' }],
                ['AWS/ApiGateway', 'Latency', 'ApiName', apiName, { stat: 'p99', label: 'p99' }],
                ['AWS/ApiGateway', 'Latency', 'ApiName', apiName, { stat: 'p50', label: 'p50' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              period: 300,
              title: 'Latency | 5min',
            },
          },
          {
            type: 'metric',
            height: 6,
            width: 24,
            y: 12,
            x: 0,
            properties: {
              metrics: _.flatMap(
                _.uniq([...SUPPORTED_CHAINS.CLASSIC, ...SUPPORTED_CHAINS.DUTCH_LIMIT]),
                (chainId: ChainId) => [
                  [
                    {
                      expression: `(c${chainId}r5xx/c${chainId}r) * 100`,
                      label: `${ID_TO_NETWORK_NAME(chainId)} - 5XX Error Rate`,
                      id: `r5${chainId}`,
                    },
                  ],
                  [
                    {
                      expression: `(c${chainId}r4xx/c${chainId}r) * 100`,
                      label: `${ID_TO_NETWORK_NAME(chainId)} - 4XX Error Rate`,
                      id: `r4${chainId}`,
                    },
                  ],
                  [
                    'Uniswap',
                    `QuoteRequestedChainId${chainId}`,
                    'Service',
                    METRIC_SERVICE_NAME,
                    { id: `c${chainId}r`, visible: false },
                  ],
                  ['.', `QuoteResponseChainId${chainId}Status4XX`, '.', '.', { id: `c${chainId}r4xx`, visible: false }],
                  ['.', `QuoteResponseChainId${chainId}Status5XX`, '.', '.', { id: `c${chainId}r5xx`, visible: false }],
                ]
              ),
              view: 'timeSeries',
              stacked: false,
              stat: 'Sum',
              period: 300,
              region,
              title: '5XX/4XX Error Rates by Chain',
              yAxis: {
                left: {
                  showUnits: false,
                  label: '%',
                },
              },
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 6,
            width: 7,
            height: 6,
            properties: {
              metrics: [
                ['Uniswap', 'QuoteResponseQuoteType-SYNTHETIC', 'Service', METRIC_SERVICE_NAME],
                ['.', 'QuoteResponseQuoteType-CLASSIC', '.', '.'],
                ['.', 'QuoteResponseQuoteType-RFQ', '.', '.'],
              ],
              view: 'pie',
              region,
              period: 900,
              stat: 'Sum',
              title: 'Quote Response Types',
            },
          },
          {
            type: 'metric',
            x: 7,
            y: 6,
            width: 17,
            height: 6,
            properties: {
              metrics: [
                ['Uniswap', 'QuoteResponseQuoteType-SYNTHETIC', 'Service', METRIC_SERVICE_NAME],
                ['.', 'QuoteResponseQuoteType-CLASSIC', '.', '.'],
                ['.', 'QuoteResponseQuoteType-RFQ', '.', '.'],
              ],
              view: 'timeSeries',
              region,
              period: 900,
              stat: 'Sum',
              stacked: true,
              setPeriodToTimeRange: true,
              yAxis: {
                left: {
                  showUnits: true,
                },
              },
              title: 'Quote Response Types over Time',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 6,
            width: 7,
            height: 6,
            properties: {
              metrics: [
                ['Uniswap', 'UniswapXQuoteResponseQuoteType-SYNTHETIC', 'Service', METRIC_SERVICE_NAME],
                ['.', 'UniswapXQuoteResponseQuoteType-CLASSIC', '.', '.'],
                ['.', 'UniswapXQuoteResponseQuoteType-RFQ', '.', '.'],
              ],
              view: 'pie',
              region,
              period: 900,
              stat: 'Sum',
              title: 'UniswapX Requested: Quote Response Types',
            },
          },
          {
            type: 'metric',
            x: 7,
            y: 6,
            width: 17,
            height: 6,
            properties: {
              metrics: [
                ['Uniswap', 'UniswapXQuoteResponseQuoteType-SYNTHETIC', 'Service', METRIC_SERVICE_NAME],
                ['.', 'UniswapXQuoteResponseQuoteType-CLASSIC', '.', '.'],
                ['.', 'UniswapXQuoteResponseQuoteType-RFQ', '.', '.'],
              ],
              view: 'timeSeries',
              region,
              period: 900,
              stat: 'Sum',
              stacked: true,
              setPeriodToTimeRange: true,
              yAxis: {
                left: {
                  showUnits: true,
                },
              },
              title: 'UniswapX Requested: Quote Response Types over Time',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 12,
            width: 12,
            height: 7,
            properties: {
              view: 'timeSeries',
              stacked: false,
              insightRule: {
                maxContributorCount: 25,
                orderBy: 'Sum',
                ruleName: REQUESTED_QUOTES_RULE_NAME,
              },
              legend: {
                position: 'bottom',
              },
              region,
              title: 'Requested Quotes',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            type: 'metric',
            x: 12,
            y: 12,
            width: 12,
            height: 7,
            properties: {
              view: 'timeSeries',
              stacked: false,
              insightRule: {
                maxContributorCount: 25,
                orderBy: 'Sum',
                ruleName: REQUESTED_QUOTES_BY_CHAIN_RULE_NAME,
              },
              legend: {
                position: 'bottom',
              },
              region,
              title: 'Requested Quotes By Chain',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 12,
            width: 12,
            height: 7,
            properties: {
              view: 'timeSeries',
              stacked: false,
              insightRule: {
                maxContributorCount: 25,
                orderBy: 'Sum',
                ruleName: RESPONSE_QUOTE_RULE_NAME,
              },
              legend: {
                position: 'bottom',
              },
              region,
              title: 'Response Quote with Type',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            type: 'metric',
            x: 12,
            y: 12,
            width: 12,
            height: 7,
            properties: {
              view: 'timeSeries',
              stacked: false,
              insightRule: {
                maxContributorCount: 25,
                orderBy: 'Sum',
                ruleName: RESPONSE_QUOTE_BY_CHAIN_RULE_NAME,
              },
              legend: {
                position: 'bottom',
              },
              region,
              title: 'Response Quote with Type By Chain',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 19,
            width: 24,
            height: 6,
            properties: {
              metrics: _.flatMap(
                _.uniq([...SUPPORTED_CHAINS.CLASSIC, ...SUPPORTED_CHAINS.DUTCH_LIMIT]),
                (chainId: ChainId) => [
                  ['Uniswap', `QuoteRequestedChainId${chainId}`, 'Service', METRIC_SERVICE_NAME],
                  ['Uniswap', `QuoteResponseChainId${chainId}Status4XX`, 'Service', METRIC_SERVICE_NAME],
                  ['Uniswap', `QuoteResponseChainId${chainId}Status5XX`, 'Service', METRIC_SERVICE_NAME],
                ]
              ),
              view: 'timeSeries',
              stacked: false,
              stat: 'Sum',
              period: 300,
              region,
              title: 'Quote Requests/Responses by Chain',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 55,
            width: 24,
            height: 5,
            properties: {
              view: 'timeSeries',
              stacked: false,
              metrics: [
                ['AWS/Lambda', 'ProvisionedConcurrentExecutions', 'FunctionName', quoteLambdaName],
                ['.', 'ConcurrentExecutions', '.', '.'],
                ['.', 'ProvisionedConcurrencySpilloverInvocations', '.', '.'],
              ],
              region: region,
              title: 'Quote Lambda Provisioned Concurrency | 5min',
              stat: 'Average',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 31,
            width: 12,
            height: 6,
            properties: {
              metrics: [
                [{ expression: '(m3/m1)*100', label: 'RoutingAPIRequest4xxErrorRate', id: 'e1' }],
                [{ expression: '(m4/m5)*100', label: 'RFQAPIRequestErrorRate', id: 'e2' }],
                [{ expression: '(m6/m1)*100', label: 'RoutingAPIRequest5xxErrorRate', id: 'e3' }],
                ['Uniswap', 'RoutingApiQuoterRequest', 'Service', METRIC_SERVICE_NAME, { id: 'm1', visible: false }],
                ['.', 'RoutingApiQuoterSuccess', '.', '.', { id: 'm2', visible: false }],
                ['.', 'RoutingApiQuoter4xxErr', '.', '.', { id: 'm3', visible: false }],
                ['.', 'RfqQuoterErrRfq', '.', '.', { id: 'm4', visible: false }],
                ['.', 'RfqQuoterRequest', '.', '.', { id: 'm5', visible: false }],
                ['.', 'RoutingApiQuoter5xxErr', '.', '.', { id: 'm6', visible: false }],
              ],
              view: 'timeSeries',
              stacked: false,
              stat: 'Sum',
              period: 300,
              region,
              title: 'Dependency Services Error Rates',
            },
          },
          {
            type: 'metric',
            x: 12,
            y: 31,
            width: 12,
            height: 6,
            properties: {
              metrics: [
                ['Uniswap', 'RoutingApiQuoterRequest', 'Service', METRIC_SERVICE_NAME, { id: 'm1' }],
                ['.', 'RoutingApiQuoterSuccess', '.', '.', { id: 'm2' }],
                ['.', 'RoutingApiQuoterErr', '.', '.', { id: 'm3' }],
                ['.', 'RfqQuoterErrRfq', '.', '.', { id: 'm4' }],
                ['.', 'RfqQuoterRequest', '.', '.', { id: 'm5' }],
              ],
              view: 'timeSeries',
              stacked: false,
              stat: 'Sum',
              region,
              period: 300,
              title: 'Dependency Services Requests/Responses',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 50,
            width: 24,
            height: 5,
            properties: {
              metrics: [
                ['Uniswap', 'RfqQuoterLatency', 'Service', METRIC_SERVICE_NAME],
                ['.', 'RoutingApiQuoterLatency', '.', '.'],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'p99',
              period: 300,
              title: 'Dependency Services Latency p99',
            },
          },
        ],
      }),
    });
  }
}
