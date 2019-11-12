# Infrastructure on AWS 

## Devops pipeline
This stack would create the devops CI/CD pipelines for microservices,

- Code pipelines automatically trigger building, deploying of microservices when code change is submitted to Github repo
- ECR repositories will be created per microservices

### How to deploy
```shell
cdk deploy eCommenceDevopsStack
```

## App cluster
This stack would create an ECS cluster for eCommence application powered by serverless container **fargate**.

- Microservice management / orchestration -- ECS
- Service Registration / Service Discovery -- Cloud Map
- Application container metrics -- Cloudwatch container insights
- Application logs -- Cloudwatch logs insights
- CI/CD/Devops -- CodeBuild, CodePipeline, AWS CDK, CloudFormation

### How to deploy
```shell
cdk deploy eCommenceClusterStack
```