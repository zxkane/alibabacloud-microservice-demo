# Infrastructure on AWS 

## Devops pipeline
This stack would create the devops CI/CD pipelines for microservices,

- Code pipelines automatically trigger building, deploying of microservices when code change is submitted to Github repo
- ECR repositories will be created per microservices

### How to deploy
```shell
cdk deploy eCommenceDevopsStack
```