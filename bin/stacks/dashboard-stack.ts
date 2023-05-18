import { ChainId } from '@uniswap/smart-order-router';
import * as cdk from 'aws-cdk-lib';
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import _ from 'lodash';
import { SUPPORTED_CHAINS } from '../../lib/config/chains';

export const METRIC_NAMESPACE = 'Uniswap';

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

const SERVICE_NAME = 'UnifiedRoutingAPI';

export class DashboardStack extends cdk.NestedStack {
  constructor(scope: Construct, name: string, props: DashboardProps) {
    super(scope, name, props);

    const { apiName, quoteLambdaName } = props;
    const region = cdk.Stack.of(this).region;

    // No CDK resource exists for contributor insights at the moment so use raw CloudFormation.
    const REQUESTED_QUOTES_RULE_NAME = 'URARequestedQuotes';
    const REQUESTED_QUOTES_BY_CHAIN_RULE_NAME = 'URARequestedQuotesByChain';
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
            height: 6,
            width: 24,
            y: 6,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [['AWS/ApiGateway', 'Latency', 'ApiName', apiName]],
              view: 'timeSeries',
              stacked: false,
              region,
              period: 300,
              stat: 'p90',
              title: 'Latency p90 | 5min',
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
            y: 19,
            width: 24,
            height: 6,
            properties: {
              metrics: _.flatMap(
                _.uniq([...SUPPORTED_CHAINS.CLASSIC, ...SUPPORTED_CHAINS.DUTCH_LIMIT]),
                (chainId: ChainId) => [
                  ['Uniswap', `QuoteRequestedChainId${chainId}`, 'Service', SERVICE_NAME],
                  ['Uniswap', `QuoteResponseChainId${chainId}Status4XX`, 'Service', SERVICE_NAME],
                  ['Uniswap', `QuoteResponseChainId${chainId}Status5XX`, 'Service', SERVICE_NAME],
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
            y: 25,
            width: 24,
            height: 6,
            properties: {
              metrics: _.flatMap(
                _.uniq([...SUPPORTED_CHAINS.CLASSIC, ...SUPPORTED_CHAINS.DUTCH_LIMIT]),
                (chainId: ChainId) => [
                  [
                    {
                      expression: `(c${chainId}r5xx/c${chainId}r) * 100`,
                      label: `5XXErrorRateChainId${chainId}`,
                      id: `r5${chainId}`,
                    },
                  ],
                  [
                    {
                      expression: `(c${chainId}r4xx/c${chainId}r) * 100`,
                      label: `4XXErrorRateChainId${chainId}`,
                      id: `r4${chainId}`,
                    },
                  ],
                  [
                    'Uniswap',
                    `QuoteRequestedChainId${chainId}`,
                    'Service',
                    SERVICE_NAME,
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
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 37,
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
                [{ expression: '(m3/m1)*100', label: 'RoutingAPIRequestErrorRate', id: 'e1' }],
                [{ expression: '(m4/m5)*100', label: 'RFQAPIRequestErrorRate', id: 'e2' }],
                ['Uniswap', 'RoutingApiQuoterRequest', 'Service', SERVICE_NAME, { id: 'm1', visible: false }],
                ['.', 'RoutingApiQuoterSuccess', '.', '.', { id: 'm2', visible: false }],
                ['.', 'RoutingApiQuoterErr', '.', '.', { id: 'm3', visible: false }],
                ['.', 'RfqQuoterErrRfq', '.', '.', { id: 'm4', visible: false }],
                ['.', 'RfqQuoterRequest', '.', '.', { id: 'm5', visible: false }],
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
                [{ expression: '(m3/m1)*100', label: 'RoutingAPIRequestErrorRate', id: 'e1' }],
                [{ expression: '(m4/m5)*100', label: 'RFQAPIRequestErrorRate', id: 'e2' }],
                ['Uniswap', 'RoutingApiQuoterRequest', 'Service', SERVICE_NAME, { id: 'm1', visible: false }],
                ['.', 'RoutingApiQuoterSuccess', '.', '.', { id: 'm2', visible: false }],
                ['.', 'RoutingApiQuoterErr', '.', '.', { id: 'm3', visible: false }],
                ['.', 'RfqQuoterErrRfq', '.', '.', { id: 'm4', visible: false }],
                ['.', 'RfqQuoterRequest', '.', '.', { id: 'm5', visible: false }],
              ],
              view: 'timeSeries',
              stacked: false,
              stat: 'Sum',
              region,
              period: 300,
              title: 'Dependency Services Requests/Responses',
            },
          },
        ],
      }),
    });
  }
}
