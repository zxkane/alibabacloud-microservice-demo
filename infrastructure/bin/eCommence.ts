#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { DevopsStack } from '../lib/devops-stack';
import { ClusterStack } from '../lib/cluster-stack';

const APP_NAME = 'eCommence';
const app = new cdk.App();
const infra = new InfrastructureStack(app, `${APP_NAME}InfraStack`);
new DevopsStack(app, `${APP_NAME}DevopsStack`);
new ClusterStack(app, `${APP_NAME}ClusterStack`, {
    vpc: infra.vpc
});

cdk.Tag.add(app, 'app', 'eCommence');
