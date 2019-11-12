import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import servicediscovery = require('@aws-cdk/aws-servicediscovery');

interface ClusterProps extends cdk.StackProps {
    readonly vpc: ec2.IVpc;
}
export class ClusterStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ClusterProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const cluster = new ecs.Cluster(this, `eCommenceCluster`, {
        defaultCloudMapNamespace: {
          name: 'eCommenceCloudMapNamesapce',
          type: servicediscovery.NamespaceType.DNS_PRIVATE,
          vpc: props.vpc
        },
        vpc: props.vpc
    });

    const nacosTaskDefinition = new ecs.FargateTaskDefinition(this, `NacosTask`, {
        // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
        memoryLimitMiB: 2048, 
        cpu: 512
      });
      const nacosContainer = nacosTaskDefinition.addContainer(`NacosContainer`, {
        // Use an image from previous built image
        image: ecs.ContainerImage.fromRegistry('nacos/nacos-server:latest'),
        // ... other options here ...
        environment: {
            PREFER_HOST_MODE: 'hostname',
            MODE: 'standalone'
        }
      });
      nacosContainer.addPortMappings({
        containerPort: 8848,
      });
      const nacosService = new ecs.FargateService(this, `NacosService`, {
        cluster,
        cloudMapOptions: {
          dnsRecordType: servicediscovery.DnsRecordType.A,
          dnsTtl: cdk.Duration.seconds(10),
          failureThreshold: 2,
        },
        taskDefinition: nacosTaskDefinition,
        desiredCount: 1
      });
  }
}