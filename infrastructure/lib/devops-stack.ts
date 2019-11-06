import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import s3 = require("@aws-cdk/aws-s3");

export class DevopsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    // s3 bucket
    const devopsBucket = new s3.Bucket(this, 'eCommenceDevopsBucket', {
        removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const token = this.node.tryGetContext('github-token-key') || 'github-token';

    const services = ['cartservice', 'frontend', 'productservice'];
    for (const service of services) {
        const sourceOutput = new codepipeline.Artifact();
        // TODO use custom web hook for path filtering
        const sourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: 'GitHub_Source',
            owner: 'zxkane',
            repo: 'alibabacloud-microservice-demo',
            oauthToken: cdk.SecretValue.secretsManager(token),
            output: sourceOutput,
            branch: 'migration', // default: 'master'
            trigger: codepipeline_actions.GitHubTrigger.NONE // default: 'WEBHOOK', 'NONE' is also possible for no Source trigger
        });
        
        const buildProject = new codebuild.PipelineProject(this, `eCommenceProject-${service}`, {
            buildSpec: codebuild.BuildSpec.fromSourceFilename(`src/${service}/buildspec.yml`),
            cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER, codebuild.LocalCacheMode.CUSTOM)
        });
        const pipeline = new codepipeline.Pipeline(this, `eCommencePipeline-${service}`, {
            pipelineName: `eCommencePipeline-${service}`,
            artifactBucket: devopsBucket,
            stages: [
                {
                    stageName: 'source',
                    actions: [sourceAction]
                },
                {
                    stageName: 'build',
                    actions: [new codepipeline_actions.CodeBuildAction({
                        actionName: 'buildSource',
                        input: sourceOutput,
                        project: buildProject
                    })]
                }
            ]
        });
    }
  }
}
