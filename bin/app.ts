import * as cdk from 'aws-cdk-lib';
import { CfnOutput, SecretValue, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib';
import * as chatbot from 'aws-cdk-lib/aws-chatbot';
import { BuildEnvironmentVariableType, BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import dotenv from 'dotenv';

import { ChainId } from '@uniswap/sdk-core';
import { PipelineNotificationEvents } from 'aws-cdk-lib/aws-codepipeline';
import { SUPPORTED_CHAINS } from '../lib/config/chains';
import { RoutingType } from '../lib/constants';
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
      internalApiKey?: string;
      chatbotSNSArn?: string;
      stage: STAGE;
      envVars: Record<string, string>;
    }
  ) {
    super(scope, id, props);
    const { provisionedConcurrency, internalApiKey, chatbotSNSArn, stage, env, envVars } = props;

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
      env,
      provisionedConcurrency,
      internalApiKey,
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
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_7_0,
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          GH_TOKEN: {
            value: 'github-token-2',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          VERSION: {
            value: '1',
            type: BuildEnvironmentVariableType.PLAINTEXT,
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
              nodejs: '18',
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

    const internalKeySecret = sm.Secret.fromSecretAttributes(this, 'internalApiKey', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:URA-internal-api-key-Ke663y',
    });

    const urlSecrets = sm.Secret.fromSecretAttributes(this, 'urlSecrets', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-service-api-xCINOs',
    });

    const arnSecrects = sm.Secret.fromSecretAttributes(this, 'arnSecrets', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-resource-arns-wF51FW',
    });

    const jsonRpcProvidersSecret = sm.Secret.fromSecretAttributes(this, 'RPCProviderUrls', {
      // Infura RPC urls
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:prod/URA/rpc-urls/v1-sRkBDE',
    });

    const jsonRpcProviders = {} as { [chainKey: string]: string };
    SUPPORTED_CHAINS[RoutingType.CLASSIC].forEach((chainId: ChainId) => {
      const mapKey = `RPC_${chainId}`;
      jsonRpcProviders[mapKey] = jsonRpcProvidersSecret.secretValueFromJson(mapKey).toString();
    });

    const routingApiKeySecret = sm.Secret.fromSecretAttributes(this, 'routing-api-key', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:routing-api-internal-api-key-Z68NmB',
    });

    const parameterizationApiKeySecret = sm.Secret.fromSecretAttributes(this, 'parameterization-api-api-key', {
      secretCompleteArn:
        'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-parameterization-api-internal-api-key-uw4sIa',
    });

    const syntheticSwitchApiKeySecret = sm.Secret.fromSecretAttributes(this, 'synthetic-switch-api-key', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:UniswapX/ParamApi/ApiKeys-hYyUt1',
    });

    const portionFlagSecret = sm.Secret.fromSecretAttributes(this, 'portion-flag', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:portion-flag-yR0VGr',
    });

    // Beta us-east-2
    const betaUsEast2Stage = new APIStage(this, 'beta-us-east-2', {
      env: { account: '665191769009', region: 'us-east-2' },
      provisionedConcurrency: 1,
      stage: STAGE.BETA,
      internalApiKey: internalKeySecret.secretValue.toString(),
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      envVars: {
        ...envVars,
        ...jsonRpcProviders,
        RELOAD: '1',
        ROUTING_API_KEY: routingApiKeySecret.secretValue.toString(),
        PARAMETERIZATION_API_KEY: parameterizationApiKeySecret.secretValue.toString(),
        PARAMETERIZATION_API_URL: urlSecrets.secretValueFromJson('PARAMETERIZATION_API_BETA').toString(),
        SYNTH_SWITCH_API_KEY: syntheticSwitchApiKeySecret.secretValueFromJson('AUTH_BETA').toString(),
        ROUTING_API_URL: urlSecrets.secretValueFromJson('ROUTING_API_BETA').toString(),
        SERVICE_URL: urlSecrets.secretValueFromJson('GOUDA_SERVICE_BETA').toString(),
        PORTION_API_URL: urlSecrets.secretValueFromJson('PORTION_API_BETA').toString(),
        ENABLE_PORTION: portionFlagSecret.secretValueFromJson('ENABLE_PORTION_BETA').toString(),
        REQUEST_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_REQUEST_DESTINATION_BETA').toString(),
        RESPONSE_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_RESPONSE_DESTINATION_BETA').toString(),
        FORCE_PORTION_STRING: portionFlagSecret.secretValueFromJson('FORCE_PORTION_STRING').toString(),
      },
    });

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage);
    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage, STAGE.BETA);

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '652077092967', region: 'us-east-2' },
      provisionedConcurrency: 50,
      internalApiKey: internalKeySecret.secretValue.toString(),
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
      envVars: {
        ...envVars,
        ...jsonRpcProviders,
        ROUTING_API_KEY: routingApiKeySecret.secretValue.toString(),
        PARAMETERIZATION_API_KEY: parameterizationApiKeySecret.secretValue.toString(),
        PARAMETERIZATION_API_URL: urlSecrets.secretValueFromJson('PARAMETERIZATION_API_PROD').toString(),
        SYNTH_SWITCH_API_KEY: syntheticSwitchApiKeySecret.secretValueFromJson('AUTH_PROD').toString(),
        ROUTING_API_URL: urlSecrets.secretValueFromJson('ROUTING_API_PROD').toString(),
        SERVICE_URL: urlSecrets.secretValueFromJson('GOUDA_SERVICE_PROD').toString(),
        PORTION_API_URL: urlSecrets.secretValueFromJson('PORTION_API_PROD').toString(),
        ENABLE_PORTION: portionFlagSecret.secretValueFromJson('ENABLE_PORTION_PROD').toString(),
        REQUEST_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_REQUEST_DESTINATION_PROD').toString(),
        RESPONSE_DESTINATION_ARN: arnSecrects.secretValueFromJson('URA_RESPONSE_DESTINATION_PROD').toString(),
        FORCE_PORTION_STRING: portionFlagSecret.secretValueFromJson('FORCE_PORTION_STRING').toString(),
      },
    });

    const prodUsEast2AppStage = pipeline.addStage(prodUsEast2Stage);

    this.addIntegTests(code, prodUsEast2Stage, prodUsEast2AppStage, STAGE.PROD);

    const slackChannel = chatbot.SlackChannelConfiguration.fromSlackChannelConfigurationArn(
      this,
      'SlackChannel',
      'arn:aws:chatbot::644039819003:chat-configuration/slack-channel/eng-ops-protocols-slack-chatbot'
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
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_7_0,
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
          URA_INTERNAL_API_KEY: {
            value: 'ura-internal-api-key',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          PORTION_API_URL: {
            value: `${stage}/portion-api/url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          FORCE_PORTION_SECRET: {
            value: 'force-portion-secret',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          PARAM_API_URL: {
            value: `${stage}/param-api/url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc',
        'echo "UNISWAP_API=${UNISWAP_API}" >> .env',
        'echo "ROUTING_API_URL=${ROUTING_API}" >> .env',
        'echo "PORTION_API_URL=${PORTION_API_URL}" >> .env',
        'echo "ARCHIVE_NODE_RPC=${ARCHIVE_NODE_RPC}" >> .env',
        'echo "URA_INTERNAL_API_KEY=${URA_INTERNAL_API_KEY}" >> .env',
        'echo "FORCE_PORTION_SECRET=${FORCE_PORTION_SECRET}" >> .env',
        'yarn install --frozen-lockfile --network-concurrency 1',
        'yarn build',
        'yarn test:integ',
      ],
      partialBuildSpec: BuildSpec.fromObject({
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '18',
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
envVars['PARAMETERIZATION_API_KEY'] = process.env['PARAMETERIZATION_API_KEY'] || '';
envVars['SYNTH_SWITCH_API_KEY'] = process.env['SYNTH_SWITCH_API_KEY'] || '';
envVars['ROUTING_API_URL'] = process.env['ROUTING_API_URL'] || '';
envVars['SERVICE_URL'] = process.env['SERVICE_URL'] || '';
envVars['PORTION_API_URL'] = process.env['PORTION_API_URL'] || '';
envVars['ENABLE_PORTION'] = process.env['ENABLE_PORTION'] || '';
envVars['REQUEST_DESTINATION_ARN'] = process.env['REQUEST_DESTINATION_ARN'] || '';
envVars['RESPONSE_DESTINATION_ARN'] = process.env['RESPONSE_DESTINATION_ARN'] || '';
envVars['ROUTING_API_KEY'] = process.env['ROUTING_API_KEY'] || 'test-api-key';
envVars['PARAMETERIZATION_API_KEY'] = process.env['PARAMETERIZATION_API_KEY'] || 'test-api-key';
envVars['FORCE_PORTION_SECRET'] = process.env['FORCE_PORTION_SECRET'] || '';

const jsonRpcProviders = {} as { [chainKey: string]: string };
SUPPORTED_CHAINS[RoutingType.CLASSIC].forEach((chainId: ChainId) => {
  const mapKey = `RPC_${chainId}`;
  jsonRpcProviders[mapKey] = process.env[mapKey] || '';
});

new APIStack(app, `${SERVICE_NAME}Stack`, {
  provisionedConcurrency: process.env.PROVISION_CONCURRENCY ? parseInt(process.env.PROVISION_CONCURRENCY) : 0,
  throttlingOverride: process.env.THROTTLE_PER_FIVE_MINS,
  internalApiKey: 'test-api-key',
  chatbotSNSArn: process.env.CHATBOT_SNS_ARN,
  stage: STAGE.LOCAL,
  envVars: {
    ...envVars,
    ...jsonRpcProviders,
  },
});

new APIPipeline(app, `${SERVICE_NAME}PipelineStack`, {
  env: { account: '644039819003', region: 'us-east-2' },
});
