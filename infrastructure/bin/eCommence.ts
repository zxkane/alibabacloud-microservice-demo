#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { DevopsStack } from '../lib/devops-stack';
import { ClusterStack } from '../lib/cluster-stack';
import { DeploymentStack } from '../lib/deployment-stack';
import { ProductCanaryDeploymentStack } from '../lib/product-canary-deployment-stack';

const APP_NAME = 'eCommence';
const app = new cdk.App();
const env = { 
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};
const infra = new InfrastructureStack(app, `${APP_NAME}InfraStack`, {
    env,
});
const devopsStack = new DevopsStack(app, `${APP_NAME}DevopsStack`);
new ClusterStack(app, `${APP_NAME}ClusterStack`, {
    env,
    vpc: infra.vpc
});
new DeploymentStack(app, `${APP_NAME}DeploymentStack`, {
    bucket: devopsStack.devopsBucket,
    repositories: devopsStack.repositories,
    env,
});
new ProductCanaryDeploymentStack(app, `${APP_NAME}ProductCanaryDeploymentStack`, {
    bucket: devopsStack.devopsBucket,
    env,
});

cdk.Tag.add(app, 'app', 'eCommence');
