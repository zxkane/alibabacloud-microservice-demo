import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import ecr = require("@aws-cdk/aws-ecr");
import iam = require("@aws-cdk/aws-iam");
import s3 = require('@aws-cdk/aws-s3');

interface DeploymentProps extends cdk.StackProps {
  readonly bucket: s3.IBucket;
  readonly repositories: Map<string, ecr.IRepository>;
}
export class DeploymentStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props: DeploymentProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const token = this.node.tryGetContext('github-token-key') || 'github-token';

    const codeArtifcat = new codepipeline.Artifact();

    const services = ['cartservice', 'frontendservice', 'productservice'];
    const sourceActions = new Array<codepipeline_actions.Action>();
    for(const service of services) {
      sourceActions.push(new codepipeline_actions.EcrSourceAction({
        actionName: `EcrTrigger-${service}`,
        output: new codepipeline.Artifact(),
        // repository: props.repositories.get(service)!,
        repository: ecr.Repository.fromRepositoryAttributes(this, `Repo-${service}`, { 
          repositoryArn: props.repositories.get(service)!.repositoryArn,
          repositoryName: props.repositories.get(service)!.repositoryName,
        }),
        runOrder: 5
      }));
    }
    sourceActions.push(new codepipeline_actions.GitHubSourceAction({
      actionName: 'DevopsCode',
      oauthToken: cdk.SecretValue.secretsManager(token),
      output: codeArtifcat,
      owner: 'zxkane',
      repo: 'alibabacloud-microservice-demo',
      branch: 'migration',
      trigger: codepipeline_actions.GitHubTrigger.NONE,
      runOrder: 10
    }));

    const deployRole = new iam.Role(this, `DeploymentRole`, {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ]
    });
    const deploymentProject = new codebuild.PipelineProject(this, `CDKDeploy`, {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Installing aws-cdk and the dependencies of project...',
              `npm i -g aws-cdk@1.16.3`,
              `cd infrastructure && npm i`
            ]
          },
          build: {
            commands: [
              'echo Deploy started on `date`',
              'cdk deploy eCommenceClusterStack --require-approval=never'
            ]
          },
        },
      }),
      role: deployRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_14_1,
      }
    });
    const cfArtifacts = new codepipeline.Artifact();

    const deploymentBucket = new s3.Bucket(this, 'DeploymentBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: true,
    });

    const changesetArtifacts = new codepipeline.Artifact();

    const pipeline = new codepipeline.Pipeline(this, `eCommenceDeploymentPipeline`, {
      pipelineName: `eCommenceDeploymentPipeline`,
      artifactBucket: deploymentBucket,
      stages: [
        {
          stageName: 'image-changed',
          actions: sourceActions
        },
        {
          stageName: 'cdk-deploy',
          actions: [new codepipeline_actions.CodeBuildAction({
            actionName: 'deploy',
            input: codeArtifcat,
            project: deploymentProject,
          })]
        }
      ]
    });
  }
}
