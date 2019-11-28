import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import ecr = require("@aws-cdk/aws-ecr");
import iam = require("@aws-cdk/aws-iam");
import s3 = require('@aws-cdk/aws-s3');

interface DeploymentProps extends cdk.StackProps {
  readonly bucket: s3.IBucket;
}
export class ProductCanaryDeploymentStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props: DeploymentProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const token = this.node.tryGetContext('github-token-key') || 'github-token';

    const stack = cdk.Stack.of(this);
    const codeArtifcat = new codepipeline.Artifact();

    const service = {
      name: 'productservice',
      artifact: 'productservice-provider/target/productservice-provider-1.0.0-SNAPSHOT.jar'
    };
    const buildProject = new codebuild.PipelineProject(this, `eCommenceBuildProject`, {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Build artifacts cleaning...',
              `cd src/${service.name}`,
              'mvn clean'
            ]
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'mvn install'
            ]
          },
        },
        artifacts: {
          files: [
            'Dockerfile',
            service.artifact
          ],
          'discard-paths': 'no',
          'base-directory': `src/${service.name}`
        },
        cache: {
          paths: ['/$HOME/.m2/**/*']
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_OPEN_JDK_8,
      }
    });
    const buildOutput = new codepipeline.Artifact();
    const repoName = `ecommence/${service.name}`;
    const ecrPolicy1 = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });
    ecrPolicy1.addActions("ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:GetAuthorizationToken",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    );
    ecrPolicy1.addResources(`arn:${stack.partition}:ecr:${stack.region}:${stack.account}:repository/${repoName}`);
    const ecrPolicy2 = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });
    ecrPolicy2.addActions(
      "ecr:GetAuthorizationToken",
    );
    ecrPolicy2.addAllResources();
    const ssmPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });
    ssmPolicy.addActions(
      "ssm:PutParameter",
    );
    const versionParaPath = `/prod/eCommence/${service.name}/version/canary`;
    ssmPolicy.addResources(`arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${versionParaPath}`);
    const publishRole = new iam.Role(this, `ECRRole-eCommence-${service.name}`, {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      inlinePolicies: {
        ecr: new iam.PolicyDocument({
          statements: [ecrPolicy1, ecrPolicy2]
        }),
        ssm: new iam.PolicyDocument({
          statements: [ssmPolicy]
        })
      }
    });
    const publishProject = new codebuild.PipelineProject(this, `eCommenceProject-Image-${service.name}`, {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              docker: '18'
            }
          },
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              '$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)'
            ]
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'export TAG="$IMAGE_BASETAG"_canary_"$(date \'+%Y%m%d%H%M%S\')"',
              'docker build -t $IMAGE_REPO_NAME:$TAG .',
              'docker tag $IMAGE_REPO_NAME:$TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$TAG',
            ]
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$TAG',
              `aws ssm put-parameter --name "${versionParaPath}" --value "$TAG" --type String --overwrite`
            ]
          }
        }
      }),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER, codebuild.LocalCacheMode.CUSTOM),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        privileged: true,
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: {
          value: stack.region
        },
        AWS_ACCOUNT_ID: {
          value: stack.account
        },
        IMAGE_BASETAG: {
          value: '1.0.0.SNAPSHOT'
        },
        IMAGE_REPO_NAME: {
          value: repoName
        }
      },
      role: publishRole,
    });

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
              `npm i -g aws-cdk@1.18.0`,
              `cd infrastructure && npm i`
            ]
          },
          build: {
            commands: [
              'echo Deploy started on `date`',
              'cdk deploy eCommenceClusterStack -c canary=true --require-approval=never'
            ]
          },
        },
      }),
      role: deployRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_14_1,
      }
    });

    const deploymentBucket = new s3.Bucket(this, 'DeploymentBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: true,
    });

    const pipeline = new codepipeline.Pipeline(this, `eCommenceProductCanaryDeploymentPipeline`, {
      pipelineName: `eCommenceProductCanaryDeploymentPipeline`,
      artifactBucket: deploymentBucket,
      stages: [
        {
          stageName: 'source-changed',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'productservice-bugfix',
              oauthToken: cdk.SecretValue.secretsManager(token),
              output: codeArtifcat,
              owner: 'zxkane',
              repo: 'alibabacloud-microservice-demo',
              branch: 'bugfix',
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
              runOrder: 10
            })
          ]
        },
        {
          stageName: 'build',
          actions: [new codepipeline_actions.CodeBuildAction({
            actionName: 'buildSource',
            input: codeArtifcat,
            project: buildProject,
            outputs: [buildOutput]
          })]
        },
        {
          stageName: 'image_build_deploy',
          actions: [new codepipeline_actions.CodeBuildAction({
            actionName: 'publishImage',
            input: buildOutput,
            project: publishProject,
          })]
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
