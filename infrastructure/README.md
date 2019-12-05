# Microservice solution on AWS 

## Prerequisties
- Install AWS CDK
- Install dependencies
```shell
npm i
```
- Store the [Github token][github-token] as secure string in the SSM parameter store with path **github-token**

## Devops pipeline
This stack would create the devops CI/CD pipelines for microservices,

- Code pipelines(including CodeBuild projects) automatically trigger building, and publishing microservice projects when code change is submitted to Github repo
- ECR repositories will be created per microservices

### How to deploy
```shell
cdk deploy eCommenceDevopsStack
```

## App cluster
This stack would create an ECS cluster for eCommence application powered by serverless container **fargate**, which depends on the docker image created by `Devops pipeline`.

- Microservice management / orchestration -- ECS
- Service Registration / Service Discovery -- Cloud Map
- Microservice observability
  - Metrics -- Cloudwatch container insights
  - Logs -- Cloudwatch logs and logs insights
  - Tracing -- X-Ray
- Canary Deployment / Service Mesh -- App Mesh
- CI/CD/Devops -- CodeBuild, CodePipeline, AWS CDK, CloudFormation

### How to deploy
```shell
cdk deploy eCommenceClusterStack
```
Or deploy the cluster with custom domain if the parent domain is a public hosted zone in Route 53,
```shell
cdk deploy eCommenceClusterStack -c DomainName=<your domain>
```

## Deployment pipeline
This stack would monitor the ECR repositories of microservices, then deploy the latest version of microservices to ECS cluster.

### How to deploy
```shell
cdk deploy eCommenceDeploymentStack
```

## Canaray deployment pipeline
This stack would monitor the code commit of source branch `bugfix`, then trigger code deployment pipeline as canary deployment(only works for **product** service).

### How to deploy
```shell
cdk deploy eCommenceProductCanaryDeploymentStack
```

[github-token]: https://docs.aws.amazon.com/codebuild/latest/userguide/sample-access-tokens.html