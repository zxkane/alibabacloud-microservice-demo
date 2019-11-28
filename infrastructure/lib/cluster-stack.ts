import appmesh = require('@aws-cdk/aws-appmesh');
import cdk = require('@aws-cdk/core');
import certmgr = require('@aws-cdk/aws-certificatemanager');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import iam = require('@aws-cdk/aws-iam');
import logs = require('@aws-cdk/aws-logs');
import servicediscovery = require('@aws-cdk/aws-servicediscovery');
import ssm = require('@aws-cdk/aws-ssm');
import route53 = require('@aws-cdk/aws-route53');
import route53Targets = require('@aws-cdk/aws-route53-targets');
import { MessageChannel } from 'worker_threads';

interface ClusterProps extends cdk.StackProps {
    readonly vpc: ec2.IVpc;
}
export class ClusterStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: ClusterProps) {
        super(scope, id, props);

        // The code that defines your stack goes here
        const stack = cdk.Stack.of(this);

        const mesh = new appmesh.Mesh(this, 'eCommentMesh', {
            meshName: 'eCommentMesh',
            egressFilter: appmesh.MeshFilterType.ALLOW_ALL,
        });

        const cloudmapNamespace = 'eCommenceCloudMapNamesapce';
        const cluster = new ecs.Cluster(this, `eCommenceCluster`, {
            defaultCloudMapNamespace: {
                name: cloudmapNamespace,
                type: servicediscovery.NamespaceType.DNS_PRIVATE,
                vpc: props.vpc
            },
            vpc: props.vpc
        });

        const domainName = 'master-builder.aws.kane.mx';
        const hostedZone = route53.HostedZone.fromLookup(this, `HostedZone-aws-kane-mx`, {
            domainName: 'aws.kane.mx',
            privateZone: false
        });

        const certificate = new certmgr.DnsValidatedCertificate(this, `Certificate-${domainName}`, {
            domainName,
            hostedZone,
            validationMethod: certmgr.ValidationMethod.DNS
        });

        const lb = new elbv2.ApplicationLoadBalancer(this, 'eCommence-ALB', {
            vpc: props.vpc,
            internetFacing: true,
            http2Enabled: true
        });

        // redirect 80 to 443
        const listener80 = lb.addListener('Listener80', { port: 80 });
        listener80.addRedirectResponse('redirect-to-443', {
            protocol: elbv2.ApplicationProtocol.HTTPS,
            port: '443',
            statusCode: 'HTTP_301'
        });

        const listener443 = lb.addListener('Listener443', { port: 443 });
        listener443.addCertificateArns('Certs', [certificate.certificateArn]);

        const logGroup = new logs.LogGroup(this, 'eCommenceLogGroup', {
            retention: logs.RetentionDays.ONE_WEEK
        });

        const nacosPorts = [8848, 9090];
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
            },
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'nacos',
                // datetimeFormat: '%Y-%m-%d %H:%M:%S',
                logGroup: logGroup,
            })
        });
        for (const port of nacosPorts) {
            nacosContainer.addPortMappings({
                containerPort: port,
            });
        }
        const nacosService = new ecs.FargateService(this, `NacosService`, {
            cluster,
            cloudMapOptions: {
                dnsRecordType: servicediscovery.DnsRecordType.A,
                dnsTtl: cdk.Duration.seconds(10),
                failureThreshold: 2,
            },
            taskDefinition: nacosTaskDefinition,
            desiredCount: 1,
            /** 
             * Use below commands to enable long ARN
             * 
             * aws ecs put-account-setting --name "serviceLongArnFormat" --value "enabled"
             * aws ecs put-account-setting --name "taskLongArnFormat" --value "enabled"
             * aws ecs put-account-setting --name "containerInstanceLongArnFormat" --value "enabled"
             */
            propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
        });

        const nacosServiceAddr = `${nacosService.cloudMapService!.serviceName}.${nacosService.cloudMapService!.namespace.namespaceName}:${nacosPorts[0]}`;
        const repoPrefix = 'ecommence/';
        const microServices = [];
        const eCommenceServices = [
            {
                name: 'cartservice',
                environments: {
                    'dubbo.registry.address': `nacos://${nacosServiceAddr}`,
                },
                cpu: 1024,
                memory: 2048,
                replicas: 1,
                ports: [12345]
            },
            {
                name: 'frontendservice',
                image: '',
                environments: {
                    'dubbo.registry.address': `nacos://${nacosServiceAddr}`,
                    'service.product.url': `http://productservice.${cloudmapNamespace}:8082`,
                    'app.dnsNaming': domainName
                },
                cpu: 1024,
                memory: 2048,
                replicas: 2,
                ports: [8080],
                expose: {
                    path: '/',
                    priority: 10
                },
                dependsOn: [
                    'cartservice',
                    'productservice'
                ],
                appmesh: true
            },
            {
                name: 'productservice',
                image: '',
                environments: {
                    'spring.cloud.inetutils.preferred-networks': '10.0',
                    'app.dnsNaming': domainName,
                },
                cpu: 1024,
                memory: 2048,
                replicas: 2,
                ports: [8082],
                appmesh: true,
                canary: true,
            }
        ];

        const uid = 1337;
        const envoyIngressPort = 15000;
        const envoyEgressPort = 15001;

        for (const service of eCommenceServices) {
            const versions = [{
                name: 'mainline',
                version: ssm.StringParameter.fromStringParameterAttributes(this, `${service.name}ImageVersion`, {
                    parameterName: `/prod/eCommence/${service.name}/version/latest`,
                    // 'version' can be specified but is optional.
                }).stringValue
            },];

            const routeTargets = [];
            const targets: elbv2.IApplicationLoadBalancerTarget[] = [];
            for (const version of versions) {
                const taskRole = new iam.Role(this, `TaskRole-${service.name}`, {
                    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
                    managedPolicies: [
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSAppMeshEnvoyAccess'),
                    ]
                });
                const executionRole = new iam.Role(this, `ExecutionRole-${service.name}`, {
                    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
                    managedPolicies: [
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
                    ]
                });

                const envoyContainerName = `envoy-${service.name}-${version.name}`;
                var proxyConfiguration = null;
                if (service.appmesh) {
                    proxyConfiguration = ecs.ProxyConfigurations.appMeshProxyConfiguration({
                        containerName: envoyContainerName,
                        properties: {
                            appPorts: service.ports,
                            proxyIngressPort: envoyIngressPort,
                            proxyEgressPort: envoyEgressPort,
                            egressIgnoredIPs: [
                                '169.254.170.2',
                                '169.254.169.254',
                            ],
                            ignoredUID: uid,
                        }
                    });
                }

                const microServiceTaskDefinition = new ecs.FargateTaskDefinition(this, `task-${service.name}-${version.name}`, {
                    memoryLimitMiB: service.memory,
                    cpu: service.cpu,
                    taskRole,
                    executionRole,
                    family: service.name,
                    proxyConfiguration,
                });
                const xrayDaemon = microServiceTaskDefinition.addContainer(`x-ray-for-${service.name}-${version.name}`, {
                    image: ecs.ContainerImage.fromRegistry('amazon/aws-xray-daemon'),
                    essential: true,
                    cpu: 32,
                    memoryReservationMiB: 256,
                    healthCheck: {
                        command: [
                            "CMD-SHELL",
                            "timeout 1 /bin/bash -c '</dev/tcp/localhost/2000 && </dev/udp/localhost/2000'"
                        ],
                        startPeriod: cdk.Duration.seconds(10),
                        interval: cdk.Duration.seconds(5),
                        timeout: cdk.Duration.seconds(2),
                        retries: 1
                    },
                    user: String(uid),
                });
                const microServiceContainer = microServiceTaskDefinition.addContainer(`container-${service.name}-${version.name}`, {
                    // Use an image from previous built image
                    image: ecs.ContainerImage.fromEcrRepository(
                        ecr.Repository.fromRepositoryName(this, `${service.name}EcrRepo`, `${repoPrefix}${service.name}`),
                        version.version),
                    // ... other options here ...
                    environment: Object.assign({ 'VERSION': version.version }, service.environments),
                    logging: ecs.LogDrivers.awsLogs({
                        streamPrefix: service.name,
                        datetimeFormat: '%Y-%m-%d %H:%M:%S',
                        logGroup: logGroup,
                    }),
                });

                microServiceContainer.addContainerDependencies({
                    container: xrayDaemon,
                    condition: ecs.ContainerDependencyCondition.HEALTHY,
                });
                if (service.ports) {
                    for (const port of service.ports) {
                        microServiceContainer.addPortMappings({
                            containerPort: port,
                        });
                    }
                }

                const microServiceService = new ecs.FargateService(this, `service-${service.name}-${version.name}`, {
                    cluster,
                    cloudMapOptions: {
                        name: service.name,
                        dnsRecordType: servicediscovery.DnsRecordType.A,
                        dnsTtl: cdk.Duration.seconds(10),
                        failureThreshold: 2,
                    },
                    taskDefinition: microServiceTaskDefinition,
                    desiredCount: service.replicas
                });
                for (const nacosPort of nacosPorts) {
                    nacosService.connections.allowFrom(microServiceService.connections,
                        ec2.Port.tcp(nacosPort), `request from ${service.name}`);
                }
                microServices.push({
                    name: service.name,
                    service: microServiceService,
                    ports: service.ports
                });

                if (service.appmesh) {
                    microServiceService.connections.allowInternally(ec2.Port.tcp(envoyIngressPort), 'envoy ingress port');
                    for (const port of service.ports) {
                        microServiceService.connections.allowInternally(ec2.Port.tcp(port), `service port ${port}`);
                    }

                    const node = new appmesh.VirtualNode(this, `node-${service.name}-${version.name}`, {
                        mesh,
                        cloudMapService: microServiceService.cloudMapService,
                        listener: {
                            portMapping: {
                                port: service.ports[0],
                                protocol: appmesh.Protocol.HTTP,
                            },
                        },
                    });

                    routeTargets.push({
                        virtualNode: node,
                        weight: 10, 
                    });

                    const envoyContainer = microServiceTaskDefinition.addContainer(envoyContainerName, {
                        image: ecs.ContainerImage.fromRegistry(`840364872350.dkr.ecr.${stack.region}.amazonaws.com/aws-appmesh-envoy:v1.12.1.1-prod`),
                        essential: true,
                        environment: {
                            APPMESH_VIRTUAL_NODE_NAME: `mesh/${mesh.meshName}/virtualNode/${node.virtualNodeName}`,
                            ENABLE_ENVOY_XRAY_TRACING: '1',
                        },
                        healthCheck: {
                            command: [
                                "CMD-SHELL",
                                "curl -s http://localhost:9901/server_info | grep state | grep -q LIVE"
                            ],
                            startPeriod: cdk.Duration.seconds(30),
                            interval: cdk.Duration.seconds(5),
                            timeout: cdk.Duration.seconds(2),
                            retries: 2
                        },
                        user: String(uid),
                    });
                    envoyContainer.addPortMappings({
                        containerPort: envoyIngressPort
                    }, {
                        containerPort: envoyEgressPort
                    });
                    microServiceContainer.addContainerDependencies({
                        container: envoyContainer,
                        condition: ecs.ContainerDependencyCondition.HEALTHY,
                    });
                    xrayDaemon.addContainerDependencies({
                        container: envoyContainer,
                        condition: ecs.ContainerDependencyCondition.HEALTHY,
                    });
                }

                if (service.expose) {
                    targets.push(microServiceService.loadBalancerTarget({
                        containerName: microServiceContainer.containerName,
                        containerPort: service.ports[0],
                        protocol: ecs.Protocol.TCP
                    }));    
                }
            }

            /**
             * Add app mesh
             */
            if (service.appmesh && service.canary) {
                const router = mesh.addVirtualRouter(`router-${service.name}`, {
                    listener: {
                        portMapping: {
                            port: service.ports[0],
                            protocol: appmesh.Protocol.HTTP,
                        }
                    }
                });
                router.addRoute(`route-${service.name}`, {
                    routeTargets,
                    prefix: `/`,
                    routeType: appmesh.RouteType.HTTP,
                });
                mesh.addVirtualService(`virtual-service-${service.name}`, {
                    virtualServiceName: service.name,
                    virtualRouter: router,
                });
            }

            if (service.expose) {
                const target = listener443.addTargets(`Forward-For-${service.name}`, {
                    protocol: elbv2.ApplicationProtocol.HTTP,
                    port: service.ports[0],
                    pathPattern: service.expose.path,
                    priority: service.expose.priority,
                    targets,
                    deregistrationDelay: cdk.Duration.seconds(5),
                });
                listener443.addTargetGroups('Targets', {
                    targetGroups: [target]
                });
            }
        }
        loop: for (const service of eCommenceServices) {
            if (service.dependsOn) {
                for (const micro of microServices) {
                    if (service.name == micro.name) {
                        for (const dependOn of service.dependsOn) {
                            for (const micro2 of microServices) {
                                if (dependOn == micro2.name) {
                                    for (const port of micro2.ports) {
                                        micro2.service.connections.allowFrom(micro.service.connections,
                                            ec2.Port.tcp(port), `Allow requests from ${service.name}`);
                                    }
                                }
                            }
                        }
                        continue loop;
                    }
                }
            }
        }

        new route53.ARecord(this, `AAlias-${domainName}`, {
            zone: hostedZone,
            recordName: domainName,
            ttl: cdk.Duration.minutes(5),
            target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(lb)),
        });
        new route53.AaaaRecord(this, `AaaaAlias-${domainName}`, {
            zone: hostedZone,
            recordName: domainName,
            ttl: cdk.Duration.minutes(5),
            target: route53.AddressRecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(lb)),
        });

        new cdk.CfnOutput(this, 'eCommenceEndpoint', {
            value: `https://${domainName}`,
            exportName: 'eCommenceEndpoint',
            description: 'DNS of endpoint'
        });
    }
}