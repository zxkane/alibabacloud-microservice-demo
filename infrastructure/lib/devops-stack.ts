import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import s3 = require("@aws-cdk/aws-s3");
import ecr = require("@aws-cdk/aws-ecr");
import iam = require("@aws-cdk/aws-iam")

export class DevopsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    // s3 bucket
    const devopsBucket = new s3.Bucket(this, 'eCommenceDevopsBucket', {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        versioned: true
    });

    const token = this.node.tryGetContext('github-token-key') || 'github-token';

    const stack = cdk.Stack.of(this);
    const services = [ {
            name: 'cartservice',
            artifact: 'cartservice-provider/target/cartservice-provider-1.0.0-SNAPSHOT.jar'
        }, 
        {
            name: 'frontendservice',
            artifact: 'frontend/target/frontend-1.0.0-SNAPSHOT.jar'
        }, 
        {
            name: 'productservice',
            artifact: 'productservice-provider/target/productservice-provider-1.0.0-SNAPSHOT.jar'
        }];
    for (const service of services) {
        const sourceArtifaceName = `source-${service.name}`;
        const pathPrefix = 'eCommenceSource';
        const sourceTriggerProject = new codebuild.Project(this, `eCommenceProject-SourceTrigger-${service.name}`, {
            artifacts: codebuild.Artifacts.s3({
                bucket: devopsBucket,
                name: sourceArtifaceName,
                includeBuildId: false,
                packageZip: true,
                path: pathPrefix
            }),
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                },
                artifacts: {
                    files: [
                        '**/*',
                    ],
                    'discard-paths': 'no',
                },
            }), 
            description: `Package the source of project ${service.name}`,
            projectName: `eCommenceProject-SourceTrigger-${service.name}`,
            source: codebuild.Source.gitHub({
                owner: 'zxkane',
                repo: 'alibabacloud-microservice-demo',
                cloneDepth: 1,
                webhook: true,
                webhookFilters: [
                    codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
                        .andBranchIs('migration').andFilePathIs(`src\/${service.name}\/.*`)
                ]
            })
        });

        const sourceOutput = new codepipeline.Artifact();
        const s3SourceAction = new codepipeline_actions.S3SourceAction({
            actionName: 'Source',
            bucket: devopsBucket,
            bucketKey: `${pathPrefix}/${sourceArtifaceName}`,
            output: sourceOutput,
            trigger: codepipeline_actions.S3Trigger.POLL
        });
        
        const buildProject = new codebuild.PipelineProject(this, `eCommenceProject-${service.name}`, {
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
            cache: codebuild.Cache.bucket(devopsBucket, {
                prefix: 'build-cache'
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_OPEN_JDK_8,
            }
        });
        const buildOutput = new codepipeline.Artifact();
        const repoName = `ecommence/${service.name}`;
        new ecr.Repository(this, repoName, {
            repositoryName: repoName,
            removalPolicy: cdk.RemovalPolicy.DESTROY 
        });
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
        const ecrRole = new iam.Role(this, `ECRRole-eCommence-${service.name}`, {
            assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
            inlinePolicies: {
                ecr: new iam.PolicyDocument({
                    statements: [ecrPolicy1, ecrPolicy2]
                }),
            }
        });
        const deployProject = new codebuild.PipelineProject(this, `eCommenceProject-Image-${service.name}`, {
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
                            'docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .',
                            'export IAMGE_TAG="$IAMGE_TAG"_"$(date \'+%Y%m%d%H%M%S\')"',
                            'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
                            'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:latest'
                        ]
                    },
                    post_build: {
                        commands: [
                            'echo Build completed on `date`',
                            'echo Pushing the Docker image...',
                            'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
                            'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:latest'
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
                IMAGE_TAG: {
                    value: '1.0.0.SNAPSHOT'
                },
                IMAGE_REPO_NAME: {
                    value: repoName 
                }
            },
            role: ecrRole,
        }); 
        const pipeline = new codepipeline.Pipeline(this, `eCommencePipeline-${service.name}`, {
            pipelineName: `eCommencePipeline-${service.name}`,
            artifactBucket: devopsBucket,
            stages: [
                {
                    stageName: 'source',
                    actions: [s3SourceAction]
                },
                {
                    stageName: 'build',
                    actions: [new codepipeline_actions.CodeBuildAction({
                        actionName: 'buildSource',
                        input: sourceOutput,
                        project: buildProject,
                        outputs: [buildOutput]
                    })]
                },
                {
                    stageName: 'image_build_deploy',
                    actions: [new codepipeline_actions.CodeBuildAction({
                        actionName: 'publishImage',
                        input: buildOutput,
                        project: deployProject,
                    })]
                },
            ]
        });
    }
  }
}
