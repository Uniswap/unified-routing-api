import * as cdk from 'aws-cdk-lib';
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import _ from 'lodash';
import { MetricPair, trackedPairs } from '../../lib/util/metrics-pair';
import { METRIC_NAMESPACE, METRIC_SERVICE_NAME } from './dashboard-stack';


export interface DashboardProps extends cdk.NestedStackProps {}

export class XPairDashboardStack extends cdk.NestedStack {
  constructor(scope: Construct, name: string, props: DashboardProps) {
    super(scope, name, props);

    const region = cdk.Stack.of(this).region;

    let x = 0;
    let y = 0;
    new aws_cloudwatch.CfnDashboard(this, 'UnifiedRoutingAPIXPairsDashboard', {
      dashboardName: `UnifiedRoutingUniswapXPairsDashboard`,
      dashboardBody: JSON.stringify({
        periodOverride: 'inherit',
        widgets: _.flatMap(trackedPairs, (trackedPair: MetricPair) => {
          const bucketKeys = trackedPair.metricKeys();

          let widgets: any[] = [];

          for (const bucketKey of bucketKeys) {
            const title = bucketKey[0].substring(0, bucketKey[0].lastIndexOf('-'));
            const period = 900;
            const stat = 'Sum';

            const line = {
              height: 5,
              width: 4,
              y,
              x,
              type: 'metric',
              properties: {
                metrics: _.map(bucketKey, (key) => [
                  METRIC_NAMESPACE,
                  key,
                  'Service',
                  METRIC_SERVICE_NAME,
                  { region, label: key.substring(key.lastIndexOf('-') + 1) },
                ]),
                view: 'timeSeries',
                stacked: true,
                region,
                period,
                stat,
                title,
              },
            };

            x = x + 4;
            y = x > 19 ? y + 1 : y;
            x = x > 19 ? 0 : x;

            const pie = {
              type: 'metric',
              x,
              y,
              width: 3,
              height: 5,
              properties: {
                metrics: _.map(bucketKey, (key) => [
                  METRIC_NAMESPACE,
                  key,
                  'Service',
                  METRIC_SERVICE_NAME,
                  { region, label: key.substring(key.lastIndexOf('-') + 1) },
                ]),
                view: 'pie',
                region,
                period,
                stat,
                title,
              },
            };
            x = x + 3;
            y = x > 19 ? y + 1 : y;
            x = x > 19 ? 0 : x;

            widgets = [...widgets, line, pie];
          }

          return widgets;
        }),
      }),
    });
  }
}
