import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');

interface ClusterProps extends cdk.StackProps {
    readonly vpc: ec2.IVpc;
}
export class ClusterStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ClusterProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const cluster = new ecs.Cluster(this, `eCommenceCluster`, {
        vpc: props.vpc
    });
  }
}