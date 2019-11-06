#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { DevopsStack } from '../lib/devops-stack';

const APP_NAME = 'eCommence';
const app = new cdk.App();
new InfrastructureStack(app, `${APP_NAME}InfraStack`);
new DevopsStack(app, `${APP_NAME}DevopsStack`);

cdk.Tag.add(app, 'app', 'eCommence');
