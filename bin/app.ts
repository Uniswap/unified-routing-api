import * as cdk from 'aws-cdk-lib';
import { CfnOutput, SecretValue, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib';
import * as chatbot from 'aws-cdk-lib/aws-chatbot';
import { BuildEnvironmentVariableType, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import dotenv from 'dotenv';

import { PipelineNotificationEvents } from 'aws-cdk-lib/aws-codepipeline';
import { STAGE } from '../lib/util/stage';
import { SERVICE_NAME } from './constants';
import { APIStack } from './stacks/api-stack';

dotenv.config();

export class APIStage extends Stage {
  public readonly url: CfnOutput;

  constructor(
    scope: Construct,
    id: string,
    props: StageProps & {
      provisionedConcurrency: number;
      chatbotSNSArn?: string;
      stage: string;
      envVars: Record<string, string>;
    }
  ) {
    super(scope, id, props);
    const { provisionedConcurrency, chatbotSNSArn, stage, env, envVars } = props;

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
      env,
      provisionedConcurrency,
      chatbotSNSArn,
      stage,
      envVars,
    });
    this.url = url;
  }
}

export class APIPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const code = CodePipelineSource.gitHub('Uniswap/unified-routing-api', 'main', {
      authentication: SecretValue.secretsManager('github-token-2'),
    });

    const synthStep = new CodeBuildStep('Synth', {
      input: code,
      buildEnvironment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_6_0,
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          GH_TOKEN: {
            value: 'github-token-2',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc && yarn install --frozen-lockfile --network-concurrency 1',
        'yarn build',
        'npx cdk synth --verbose',
      ],
      partialBuildSpec: BuildSpec.fromObject({
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '16',
            },
          },
        },
      }),
    });

    const pipeline = new CodePipeline(this, `${SERVICE_NAME}Pipeline`, {
      // The pipeline name
      pipelineName: `${SERVICE_NAME}`,
      crossAccountKeys: true,
      synth: synthStep,
    });

    const urlSecrets = sm.Secret.fromSecretAttributes(this, 'urlSecrets', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-service-api-xCINOs',
    });

    const arnSecrects = sm.Secret.fromSecretAttributes(this, 'arnSecrets', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-resource-arns-wF51FW',
    });

    // Beta us-east-2
    const betaUsEast2Stage = new APIStage(this, 'beta-us-east-2', {
      env: { account: '665191769009', region: 'us-east-2' },
      provisionedConcurrency: 2,
      stage: STAGE.BETA,
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      envVars: {
        ...envVars,
        PARAMETERIZATION_API_URL: urlSecrets.secretValueFromJson('PARAMETERIZATION_API_BETA').toString(),
        ROUTING_API_URL: urlSecrets.secretValueFromJson('ROUTING_API_BETA').toString(),
        SERVICE_URL: urlSecrets.secretValueFromJson('GOUDA_SERVICE_BETA').toString(),
        REQUEST_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_REQUEST_DESTINATION_BETA').toString(),
        RESPONSE_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_RESPONSE_DESTINATION_BETA').toString(),
      },
    });

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage);

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage, STAGE.BETA);

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '652077092967', region: 'us-east-2' },
      provisionedConcurrency: 5,
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
      envVars: {
        ...envVars,
        PARAMETERIZATION_API_URL: urlSecrets.secretValueFromJson('PARAMETERIZATION_API_PROD').toString(),
        ROUTING_API_URL: urlSecrets.secretValueFromJson('ROUTING_API_PROD').toString(),
        SERVICE_URL: urlSecrets.secretValueFromJson('GOUDA_SERVICE_PROD').toString(),
        REQUEST_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_REQUEST_DESTINATION_PROD').toString(),
        RESPONSE_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_RESPONSE_DESTINATION_PROD').toString(),
      },
    });

    const prodUsEast2AppStage = pipeline.addStage(prodUsEast2Stage);

    this.addIntegTests(code, prodUsEast2Stage, prodUsEast2AppStage, STAGE.PROD);

    const slackChannel = chatbot.SlackChannelConfiguration.fromSlackChannelConfigurationArn(
      this,
      'SlackChannel',
      'arn:aws:chatbot::644039819003:chat-configuration/slack-channel/eng-ops-slack-chatbot'
    );

    pipeline.buildPipeline();
    pipeline.pipeline.notifyOn('NotifySlack', slackChannel, {
      events: [PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
    });
  }

  private addIntegTests(
    sourceArtifact: cdk.pipelines.CodePipelineSource,
    apiStage: APIStage,
    applicationStage: cdk.pipelines.StageDeployment,
    stage: STAGE
  ) {
    const testAction = new CodeBuildStep(`${SERVICE_NAME}-IntegTests-${apiStage.stageName}`, {
      projectName: `${SERVICE_NAME}-IntegTests-${apiStage.stageName}`,
      input: sourceArtifact,
      envFromCfnOutputs: {
        UNISWAP_API: apiStage.url,
      },
      buildEnvironment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_6_0,
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          GH_TOKEN: {
            value: 'github-token-2',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          ARCHIVE_NODE_RPC: {
            value: 'archive-node-rpc-url-default-kms',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          ROUTING_API: {
            value: `${stage}/routing-api/url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc',
        'echo "UNISWAP_API=${UNISWAP_API}" > .env',
        'echo "ROUTING_API_URL=${ROUTING_API}" > .env',
        'echo "ARCHIVE_NODE_RPC=${ARCHIVE_NODE_RPC}" > .env',
        'cat .env',
        'yarn install --frozen-lockfile --network-concurrency 1',
        'yarn build',
        'yarn test:integ',
      ],
      partialBuildSpec: BuildSpec.fromObject({
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '16',
            },
          },
        },
      }),
    });

    applicationStage.addPost(testAction);
  }
}

// Local Dev Stack
const app = new cdk.App();

const envVars: { [key: string]: string } = {};
envVars['PARAMETERIZATION_API_URL'] = process.env['PARAMETERIZATION_API_URL'] || '';
envVars['ROUTING_API_URL'] = process.env['ROUTING_API_URL'] || '';
envVars['SERVICE_URL'] = process.env['SERVICE_URL'] || '';
envVars['REQUEST_DESTINATION_ARN'] = process.env['REQUEST_DESTINATION_ARN'] || '';
envVars['RESPONSE_DESTINATION_ARN'] = process.env['RESPONSE_DESTINATION_ARN'] || '';

new APIStack(app, `${SERVICE_NAME}Stack`, {
  provisionedConcurrency: process.env.PROVISION_CONCURRENCY ? parseInt(process.env.PROVISION_CONCURRENCY) : 0,
  throttlingOverride: process.env.THROTTLE_PER_FIVE_MINS,
  chatbotSNSArn: process.env.CHATBOT_SNS_ARN,
  stage: STAGE.LOCAL,
  envVars: envVars,
});

new APIPipeline(app, `${SERVICE_NAME}PipelineStack`, {
  env: { account: '644039819003', region: 'us-east-2' },
});
