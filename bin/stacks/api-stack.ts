import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway';
import { MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import * as aws_asg from 'aws-cdk-lib/aws-applicationautoscaling';
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as aws_iam from 'aws-cdk-lib/aws-iam';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as aws_logs from 'aws-cdk-lib/aws-logs';
import * as aws_waf from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import * as path from 'path';

import { ChainId } from '@uniswap/sdk-core';
import _ from 'lodash';
import { SUPPORTED_CHAINS } from '../../lib/config/chains';
import { STAGE } from '../../lib/util/stage';
import { SERVICE_NAME } from '../constants';
import { AnalyticsStack } from './analytics-stack';
import { DashboardStack } from './dashboard-stack';
import { XPairDashboardStack } from './pair-dashboard-stack';

const ALL_SUPPORTED_CHAINS = _.uniq([...SUPPORTED_CHAINS.CLASSIC, ...SUPPORTED_CHAINS.DUTCH_LIMIT]);

export const CHAINS_NOT_ALARMED = new Set<ChainId>([
  ChainId.ARBITRUM_GOERLI,
  ChainId.CELO_ALFAJORES,
  ChainId.OPTIMISM_GOERLI,
  ChainId.GOERLI,
  ChainId.POLYGON_MUMBAI,
  ChainId.SEPOLIA,
  ChainId.BASE_GOERLI,
]);

const ALL_ALARMED_CHAINS = _.filter(ALL_SUPPORTED_CHAINS, (c) => !CHAINS_NOT_ALARMED.has(c));

export class APIStack extends cdk.Stack {
  public readonly url: CfnOutput;

  constructor(
    parent: Construct,
    name: string,
    props: cdk.StackProps & {
      provisionedConcurrency: number;
      internalApiKey?: string;
      throttlingOverride?: string;
      chatbotSNSArn?: string;
      stage: STAGE;
      envVars: Record<string, string>;
    }
  ) {
    super(parent, name, props);
    const { provisionedConcurrency, stage, chatbotSNSArn } = props;

    /*
     *  API Gateway Initialization
     */
    const accessLogGroup = new aws_logs.LogGroup(this, `${SERVICE_NAME}APIGAccessLogs`);

    const api = new aws_apigateway.RestApi(this, `${SERVICE_NAME}`, {
      restApiName: `${SERVICE_NAME}`,
      deployOptions: {
        tracingEnabled: true,
        loggingLevel: MethodLoggingLevel.ERROR,
        accessLogDestination: new aws_apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: aws_apigateway.AccessLogFormat.jsonWithStandardFields({
          ip: false,
          caller: false,
          user: false,
          requestTime: true,
          httpMethod: true,
          resourcePath: true,
          status: true,
          protocol: true,
          responseLength: true,
        }),
      },
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    });

    const ipThrottlingACL = new aws_waf.CfnWebACL(this, `${SERVICE_NAME}IPThrottlingACL`, {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${SERVICE_NAME}IPBasedThrottling`,
      },
      customResponseBodies: {
        [`${SERVICE_NAME}ThrottledResponseBody`]: {
          contentType: 'APPLICATION_JSON',
          content: '{"errorCode": "TOO_MANY_REQUESTS"}',
        },
      },
      name: `${SERVICE_NAME}IPThrottling`,
      rules: [],
    });

    const region = cdk.Stack.of(this).region;
    const apiArn = `arn:aws:apigateway:${region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`;

    new aws_waf.CfnWebACLAssociation(this, `${SERVICE_NAME}IPThrottlingAssociation`, {
      resourceArn: apiArn,
      webAclArn: ipThrottlingACL.getAtt('Arn').toString(),
    });

    /*
     * Lambda Initialization
     */
    const lambdaRole = new aws_iam.Role(this, `$LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLambdaInsightsExecutionRolePolicy'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
      ],
    });
    const quoteLambda = new aws_lambda_nodejs.NodejsFunction(this, 'Quote', {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'quoteHandler',
      memorySize: 1024,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        VERSION: '10',
        NODE_OPTIONS: '--enable-source-maps',
        stage: props.stage,
        ...props.envVars,
      },
      timeout: cdk.Duration.seconds(30),
      logRetention: aws_logs.RetentionDays.ONE_MONTH,
    });

    const quoteLambdaAlias = new aws_lambda.Alias(this, `GetOrdersLiveAlias`, {
      aliasName: 'live',
      version: quoteLambda.currentVersion,
      provisionedConcurrentExecutions: provisionedConcurrency > 0 ? provisionedConcurrency : undefined,
    });

    if (provisionedConcurrency > 0) {
      const quoteTarget = new aws_asg.ScalableTarget(this, 'QuoteProvConcASG', {
        serviceNamespace: aws_asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 10,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${quoteLambdaAlias.lambda.functionName}:${quoteLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      });

      quoteTarget.node.addDependency(quoteLambdaAlias);

      quoteTarget.scaleToTrackMetric('QuoteProvConcTracking', {
        targetValue: 0.7,
        predefinedMetric: aws_asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      });
    }

    /* Analytics */
    new AnalyticsStack(this, 'AnalyticsStack', {
      quoteLambda,
      envVars: props.envVars,
    });

    /* Dashboard */
    new DashboardStack(this, 'DashboardStack', {
      apiName: api.restApiName,
      quoteLambdaName: quoteLambda.functionName,
    });

    /* Pair tracking dashboard for X */
    new XPairDashboardStack(this, 'XPairDashboardStack', {});

    /* Quote Endpoint */
    const quoteLambdaIntegration = new aws_apigateway.LambdaIntegration(quoteLambdaAlias, {});
    const quote = api.root.addResource('quote', {
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    });
    quote.addMethod('POST', quoteLambdaIntegration);

    /* Alarms */
    const apiAlarm5xxSev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-5XXAlarm', {
      alarmName: 'UnifiedRoutingAPI-SEV2-5XX',
      metric: api.metricServerError({
        period: Duration.minutes(5),
        // For this metric 'avg' represents error rate.
        statistic: 'avg',
      }),
      threshold: 0.05,
      // Beta has much less traffic so is more susceptible to transient errors.
      evaluationPeriods: stage == STAGE.BETA ? 5 : 3,
    });

    const apiAlarm5xxSev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-5XXAlarm', {
      alarmName: 'UnifiedRoutingAPI-SEV3-5XX',
      metric: api.metricServerError({
        period: Duration.minutes(5),
        // For this metric 'avg' represents error rate.
        statistic: 'avg',
      }),
      threshold: 0.03,
      // Beta has much less traffic so is more susceptible to transient errors.
      evaluationPeriods: stage == STAGE.BETA ? 5 : 3,
    });

    const apiAlarm4xxSev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-4XXAlarm', {
      alarmName: 'UnifiedRoutingAPI-SEV2-4XX',
      metric: api.metricClientError({
        period: Duration.minutes(5),
        statistic: 'avg',
      }),
      threshold: 0.95,
      evaluationPeriods: 3,
    });

    const apiAlarm4xxSev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-4XXAlarm', {
      alarmName: 'UnifiedRoutingAPI-SEV3-4XX',
      metric: api.metricClientError({
        period: Duration.minutes(5),
        statistic: 'avg',
      }),
      threshold: 0.8,
      evaluationPeriods: 3,
    });

    const apiAlarmLatencySev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-Latency', {
      alarmName: 'UnifiedRoutingAPI-SEV2-Latency',
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p90',
      }),
      threshold: 8500,
      evaluationPeriods: 3,
    });

    const apiAlarmLatencySev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-Latency', {
      alarmName: 'UnifiedRoutingAPI-SEV3-Latency',
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p90',
      }),
      threshold: 5500,
      evaluationPeriods: 3,
    });

    const apiAlarmLatencyP99Sev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-LatencyP99', {
      alarmName: 'UnifiedRoutingAPI-SEV2-LatencyP99',
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p99',
      }),
      threshold: 10000,
      evaluationPeriods: 3,
    });

    const apiAlarmLatencyP99Sev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-LatencyP99', {
      alarmName: 'UnifiedRoutingAPI-SEV3-LatencyP99',
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p99',
      }),
      threshold: 7000,
      evaluationPeriods: 3,
    });

    // Alarms for 200 rate being too low for each chain
    const percent5XXByChainAlarm: cdk.aws_cloudwatch.Alarm[] = _.flatMap(ALL_ALARMED_CHAINS, (chainId) => {
      const alarmNameSev3 = `UnifiedRoutingAPI-SEV3-5XXAlarm-ChainId-${chainId.toString()}`;
      const alarmNameSev2 = `UnifiedRoutingAPI-SEV2-5XXAlarm-ChainId-${chainId.toString()}`;

      const metric = new aws_cloudwatch.MathExpression({
        expression: '100*(response5XX/invocations)',
        period: Duration.minutes(5),
        usingMetrics: {
          invocations: new aws_cloudwatch.Metric({
            namespace: 'Uniswap',
            metricName: `QuoteRequestedChainId${chainId}`,
            dimensionsMap: { Service: SERVICE_NAME },
            unit: aws_cloudwatch.Unit.COUNT,
            statistic: 'sum',
          }),
          response5XX: new aws_cloudwatch.Metric({
            namespace: 'Uniswap',
            metricName: `QuoteResponseChainId${chainId}Status5XX`,
            dimensionsMap: { Service: SERVICE_NAME },
            unit: aws_cloudwatch.Unit.COUNT,
            statistic: 'sum',
          }),
        },
      });

      return [
        new aws_cloudwatch.Alarm(this, alarmNameSev2, {
          alarmName: alarmNameSev2,
          metric,
          threshold: 10,
          evaluationPeriods: 3,
        }),
        new aws_cloudwatch.Alarm(this, alarmNameSev3, {
          alarmName: alarmNameSev3,
          metric,
          threshold: 5,
          evaluationPeriods: 3,
        }),
      ];
    });

    // Alarms for 4XX rate being too high for each chain
    const percent4XXByChainAlarm: cdk.aws_cloudwatch.Alarm[] = _.flatMap(ALL_ALARMED_CHAINS, (chainId) => {
      const alarmNameSev3 = `UnifiedRoutingAPI-SEV3-4XXAlarm-ChainId-${chainId.toString()}`;
      const alarmNameSev2 = `UnifiedRoutingAPI-SEV2-4XXAlarm-ChainId-${chainId.toString()}`;

      const metric = new aws_cloudwatch.MathExpression({
        expression: '100*(response4XX/invocations)',
        period: Duration.minutes(5),
        usingMetrics: {
          invocations: new aws_cloudwatch.Metric({
            namespace: 'Uniswap',
            metricName: `QuoteRequestedChainId${chainId}`,
            dimensionsMap: { Service: SERVICE_NAME },
            unit: aws_cloudwatch.Unit.COUNT,
            statistic: 'sum',
          }),
          response4XX: new aws_cloudwatch.Metric({
            namespace: 'Uniswap',
            metricName: `QuoteResponseChainId${chainId}Status4XX`,
            dimensionsMap: { Service: SERVICE_NAME },
            unit: aws_cloudwatch.Unit.COUNT,
            statistic: 'sum',
          }),
        },
      });

      return [
        new aws_cloudwatch.Alarm(this, alarmNameSev2, {
          alarmName: alarmNameSev2,
          metric,
          threshold: 80,
          evaluationPeriods: 3,
        }),
        new aws_cloudwatch.Alarm(this, alarmNameSev3, {
          alarmName: alarmNameSev3,
          metric,
          threshold: 50,
          evaluationPeriods: 3,
        }),
      ];
    });

    // Alarm on calls from URA to the routing API
    const routingAPIErrorMetric = new aws_cloudwatch.MathExpression({
      expression: '100*(error/invocations)',
      period: Duration.minutes(5),
      usingMetrics: {
        invocations: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RoutingApiQuoterRequest`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
        error: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RoutingApiQuoterErr`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
      },
    });

    const routingAPIErrorRateAlarmSev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-RoutingAPI-ErrorRate', {
      alarmName: 'UnifiedRoutingAPI-SEV2-RoutingAPI-ErrorRate',
      metric: routingAPIErrorMetric,
      threshold: 10,
      evaluationPeriods: 3,
    });

    const routingAPIErrorRateAlarmSev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-RoutingAPI-ErrorRate', {
      alarmName: 'UnifiedRoutingAPI-SEV3-RoutingAPI-ErrorRate',
      metric: routingAPIErrorMetric,
      threshold: 5,
      evaluationPeriods: 3,
    });

    // Alarm on calls from URA to the rfq service
    const rfqAPIErrorMetric = new aws_cloudwatch.MathExpression({
      expression: '100*(error/invocations)',
      period: Duration.minutes(5),
      usingMetrics: {
        invocations: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RfqQuoterRequest`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
        error: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RfqQuoterRfqErr`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
      },
    });

    const rfqAPIErrorRateAlarmSev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-RFQAPI-ErrorRate', {
      alarmName: 'UnifiedRoutingAPI-SEV2-RFQAPI-ErrorRate',
      metric: rfqAPIErrorMetric,
      threshold: 10,
      evaluationPeriods: 3,
    });

    const rfqAPIErrorRateAlarmSev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-RFQAPI-ErrorRate', {
      alarmName: 'UnifiedRoutingAPI-SEV3-RFQAPI-ErrorRate',
      metric: rfqAPIErrorMetric,
      threshold: 5,
      evaluationPeriods: 3,
    });

    // Alarm on high rate of dropping rfq quotes due to pricing being too good comparing to SOR
    const rfqQuoteDropMetric = new aws_cloudwatch.MathExpression({
      expression: '100*(rfqDropped/denominator)',
      period: Duration.minutes(5),
      usingMetrics: {
        rfqDropped: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RfqQuoteDropped-PriceTooGood`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
        denominator: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `HasBothRfqAndClassicQuote`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
      },
    });

    const rfqQuoteDropRateAlarmSev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-RfqQuote-DropRate', {
      alarmName: 'UnifiedRoutingAPI-SEV2-RfqQuote-DropRate',
      metric: rfqQuoteDropMetric,
      threshold: 15,
      evaluationPeriods: 3,
    });

    const rfqQuoteDropRateAlarmSev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-RfqQuote-DropRate', {
      alarmName: 'UnifiedRoutingAPI-SEV3-RfqQuote-DropRate',
      metric: rfqQuoteDropMetric,
      threshold: 5,
      evaluationPeriods: 3,
    });

    // Alarm on calls from URA to the nonce service (uniswapx service)
    const nonceAPIErrorMetric = new aws_cloudwatch.MathExpression({
      expression: '100*(error/invocations)',
      period: Duration.minutes(5),
      usingMetrics: {
        invocations: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RfqQuoterRequest`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
        error: new aws_cloudwatch.Metric({
          namespace: 'Uniswap',
          metricName: `RfqQuoterNonceErr`,
          dimensionsMap: { Service: SERVICE_NAME },
          unit: aws_cloudwatch.Unit.COUNT,
          statistic: 'sum',
        }),
      },
    });

    const nonceAPIErrorRateAlarmSev2 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV2-NonceAPI-ErrorRate', {
      alarmName: 'UnifiedRoutingAPI-SEV2-NonceAPI-ErrorRate',
      metric: nonceAPIErrorMetric,
      threshold: 10,
      evaluationPeriods: 3,
    });

    const nonceAPIErrorRateAlarmSev3 = new aws_cloudwatch.Alarm(this, 'UnifiedRoutingAPI-SEV3-NonceAPI-ErrorRate', {
      alarmName: 'UnifiedRoutingAPI-SEV3-NonceAPI-ErrorRate',
      metric: nonceAPIErrorMetric,
      threshold: 5,
      evaluationPeriods: 3,
    });

    if (chatbotSNSArn) {
      const chatBotTopic = cdk.aws_sns.Topic.fromTopicArn(this, 'ChatbotTopic', chatbotSNSArn);
      apiAlarm5xxSev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarm4xxSev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarm5xxSev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarm4xxSev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarmLatencySev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarmLatencySev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarmLatencyP99Sev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      apiAlarmLatencyP99Sev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));

      percent5XXByChainAlarm.forEach((alarm) => {
        alarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      });
      percent4XXByChainAlarm.forEach((alarm) => {
        alarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      });

      routingAPIErrorRateAlarmSev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      routingAPIErrorRateAlarmSev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      rfqAPIErrorRateAlarmSev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      rfqAPIErrorRateAlarmSev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      rfqQuoteDropRateAlarmSev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      rfqQuoteDropRateAlarmSev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      nonceAPIErrorRateAlarmSev2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
      nonceAPIErrorRateAlarmSev3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic));
    }

    this.url = new CfnOutput(this, 'Url', {
      value: api.url,
    });
  }
}
