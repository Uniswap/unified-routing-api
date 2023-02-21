import * as cdk from 'aws-cdk-lib';
import { aws_lambda_nodejs, aws_logs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AnalyticsStackProps extends cdk.NestedStackProps {
  quoteLambda: aws_lambda_nodejs.NodejsFunction;
  envVars: Record<string, string>;
}

/*
 * Send quote request and response logs to x-account firehose streams
 */
export class AnalyticsStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
    super(scope, id, props);
    const { envVars, quoteLambda } = props;

    if (envVars.REQUEST_DESTINATION_ARN) {
      new aws_logs.CfnSubscriptionFilter(this, 'RequestSub', {
        destinationArn: envVars.REQUEST_DESTINATION_ARN,
        filterPattern: '{ $.eventType = "UnifiedRoutingQuoteRequest" }',
        logGroupName: quoteLambda.logGroup.logGroupName,
      });
    }

    if (envVars.RESPONSE_DESTINATION_ARN) {
      new aws_logs.CfnSubscriptionFilter(this, 'ResponseSub', {
        destinationArn: envVars.RESPONSE_DESTINATION_ARN,
        filterPattern: '{ $.eventType = "UnifiedRoutingQuoteResponse" }',
        logGroupName: quoteLambda.logGroup.logGroupName,
      });
    }
  }
}
