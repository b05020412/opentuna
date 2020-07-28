import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/opentuna-stack';
import * as mock from './vpc-mock';
import ec2 = require('@aws-cdk/aws-ec2');
import sns = require('@aws-cdk/aws-sns');
import '@aws-cdk/assert/jest';
import { ResourcePart } from '@aws-cdk/assert/lib/assertions/have-resource';

describe('Tuna Manager stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  const vpcId = 'vpc-123456';
  let previous: (scope: cdk.Construct, options: cdk.GetContextValueOptions) => cdk.GetContextValueResult;

  beforeAll(() => {
    previous = mock.mockVpcContextProviderWith({
      vpcId,
      vpcCidrBlock: "10.58.0.0/16",
      "subnetGroups": [
        {
          "name": "ingress",
          "type": cxapi.VpcSubnetGroupType.PUBLIC,
          "subnets": [
            {
              "subnetId": "subnet-000f2b20b0ebaef37",
              "cidr": "10.58.0.0/22",
              "availabilityZone": "cn-northwest-1a",
              "routeTableId": "rtb-0f5312df5fe3ae508"
            },
            {
              "subnetId": "subnet-0b2cce92f08506a9a",
              "cidr": "10.58.4.0/22",
              "availabilityZone": "cn-northwest-1b",
              "routeTableId": "rtb-07e969fe93b6edd9a"
            },
            {
              "subnetId": "subnet-0571b340c9f28375c",
              "cidr": "10.58.8.0/22",
              "availabilityZone": "cn-northwest-1c",
              "routeTableId": "rtb-02ae139a60f628b5c"
            }
          ]
        },
        {
          "name": "private",
          "type": cxapi.VpcSubnetGroupType.PRIVATE,
          "subnets": [
            {
              "subnetId": "subnet-0a6dab6bc063ea432",
              "cidr": "10.58.32.0/19",
              "availabilityZone": "cn-northwest-1a",
              "routeTableId": "rtb-0be722c725fd0d29f"
            },
            {
              "subnetId": "subnet-08dd359da55a6160b",
              "cidr": "10.58.64.0/19",
              "availabilityZone": "cn-northwest-1b",
              "routeTableId": "rtb-0b13567ae92b08708"
            },
            {
              "subnetId": "subnet-0d300d086b989eefc",
              "cidr": "10.58.96.0/19",
              "availabilityZone": "cn-northwest-1c",
              "routeTableId": "rtb-08fe9e7932d86517e"
            }
          ]
        }
      ]
    }, options => {
      expect(options.filter).toEqual({
        'vpc-id': vpcId,
      });
    });
  });

  afterAll(() => {
    mock.restoreContextProvider(previous);
  });

  beforeEach(() => {
    app = new cdk.App();

    const commonStack = new cdk.Stack(app, 'CommonStack');
    const topic = new sns.Topic(commonStack, 'Test Topic');

    stack = new Tuna.OpentunaStack(app, 'OpenTunaStack', {
      vpcId,
      fileSystemId: 'fs-012345',
      notifyTopic: topic,
    });
  });

  test('Nested Tunasync Manager stack created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudFormation::Stack', {
      "Parameters": {
        "referencetoOpenTunaStackTunaManagerALBSG3A9F434BGroupId": {
          "Fn::GetAtt": [
            "TunaManagerALBSGD1FA31EB",
            "GroupId"
          ]
        },
        "referencetoOpenTunaStackTunaManagerSG9C92138FGroupId": {
          "Fn::GetAtt": [
            "TunaManagerSGEC810641",
            "GroupId"
          ]
        }
      },
      "TimeoutInMinutes": 10,
    });
  });

  test('Nested Tunasync Worker stack created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudFormation::Stack', {
      "Parameters": {
        "referencetoOpenTunaStackTunaWorkerSGDC640D13GroupId": {
          "Fn::GetAtt": [
            "TunaWorkerSG1B6F268B",
            "GroupId"
          ]
        },
        "referencetoOpenTunaStackTunaManagerStackNestedStackTunaManagerStackNestedStackResource1B954434OutputsOpenTunaStackTunaManagerStackTunaManagerALB7C30A3CCDNSName": {
          "Fn::GetAtt": [
            "TunaManagerStackNestedStackTunaManagerStackNestedStackResourceA0EA7C16",
            "Outputs.OpenTunaStackTunaManagerStackTunaManagerALB7C30A3CCDNSName"
          ]
        }
      },
      "TimeoutInMinutes": 10,
    });
  });

  test('Security groups between worker and manager with least privillege', () => {
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      "IpProtocol": "tcp",
      "FromPort": 80,
      "GroupId": {
        "Fn::GetAtt": [
          "TunaManagerALBSGD1FA31EB",
          "GroupId"
        ]
      },
      "SourceSecurityGroupId": {
        "Fn::GetAtt": [
          "TunaWorkerSG1B6F268B",
          "GroupId"
        ]
      },
      "ToPort": 80
    });
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      "IpProtocol": "tcp",
      "FromPort": 80,
      "GroupId": {
        "Fn::GetAtt": [
          "TunaWorkerSG1B6F268B",
          "GroupId"
        ]
      },
      "SourceSecurityGroupId": {
        "Fn::GetAtt": [
          "TunaManagerSGEC810641",
          "GroupId"
        ]
      },
      "ToPort": 80
    });
  });

  test('Asset bucket created', () => {
    cdk.Tag.add(app, 'app', `OpenTuna`);
    expect(stack).toHaveResourceLike('AWS::S3::Bucket', {
      "Properties": {
        "Tags": [
          {
            "Key": "app",
            "Value": "OpenTuna"
          }
        ]
      },
      "UpdateReplacePolicy": "Delete",
      "DeletionPolicy": "Delete",
    }, ResourcePart.CompleteDefinition);
  });

  test('default listener 80 created without custom domain', () => {
    expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
      "DefaultActions": [
        {
          "TargetGroupArn": {
            "Ref": "ExternalALBDefaultPort80ContentServerGroup4C4C350F"
          },
          "Type": "forward"
        }
      ],
      "LoadBalancerArn": {
        "Ref": "ExternalALB7DC65DEC"
      },
      "Port": 80,
      "Protocol": "HTTP"
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::TargetGroup', {
      "HealthCheckEnabled": true,
      "HealthCheckTimeoutSeconds": 15,
      "Port": 80,
      "Protocol": "HTTP",
      "TargetType": "ip",
      "VpcId": vpcId,
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::TargetGroup', {
      "Port": 80,
        "Protocol": "HTTP",
        "TargetGroupAttributes": [
          {
            "Key": "deregistration_delay.timeout_seconds",
            "Value": "10"
          },
          {
            "Key": "slow_start.duration_seconds",
            "Value": "60"
          }
        ],
        "TargetType": "ip",
        "VpcId": vpcId,
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "TargetGroupArn": {
            "Ref": "WebPortalWebTargetGroupB563B993"
          },
          "Type": "forward"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/",
              "/404.html",
              "/index.html",
              "/robots.txt",
              "/sitemap.xml"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 10
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "TargetGroupArn": {
            "Ref": "WebPortalWebTargetGroupB563B993"
          },
          "Type": "forward"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/help/*",
              "/news/*",
              "/static/*",
              "/status/*"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 15
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "RedirectConfig": {
            "Path": "/jobs",
            "StatusCode": "HTTP_302"
          },
          "Type": "redirect"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/static/tunasync.json"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 5
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "TargetGroupArn": {
            "Fn::GetAtt": [
              "WebPortalStackNestedStackWebPortalStackNestedStackResourceFBF35EF3",
              "Outputs.OpenTunaStackWebPortalStackWebPortalManagerTargetGroup51E2D9E3Ref"
            ]
          },
          "Type": "forward"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/jobs"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 20
    });
  });
});
