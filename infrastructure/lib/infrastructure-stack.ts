import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');

export class InfrastructureStack extends cdk.Stack {

  readonly vpc: ec2.IVpc;
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const useDefault = this.node.tryGetContext('DefaultVPC') ? 
      Boolean(this.node.tryGetContext('DefaultVPC')) : false;
    if (useDefault) {
      this.vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { 
        isDefault: true
      });
    } else {
      // create a vpc in two AZs
      this.vpc = new ec2.Vpc(this, 'MyVPC', {
        cidr: '10.0.0.0/16',
        enableDnsHostnames: true,
        enableDnsSupport: true,
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'ingress',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 22,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE
          }
        ]
      });
    }
  }
}
