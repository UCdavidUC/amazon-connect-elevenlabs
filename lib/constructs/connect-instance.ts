import * as cdk from "aws-cdk-lib";
import * as connect from "aws-cdk-lib/aws-connect";
import { Construct } from "constructs";

export interface ConnectInstanceProps {
  /**
   * Whether to create a new Amazon Connect instance.
   * If false, connectInstanceArn must be provided.
   */
  createNew: boolean;

  /**
   * ARN of an existing Amazon Connect instance.
   * Required when createNew is false.
   */
  existingInstanceArn?: string;

  /**
   * Alias for a new Amazon Connect instance.
   * Required when createNew is true.
   */
  instanceAlias?: string;
}

/**
 * Manages the Amazon Connect instance — either creates a new one
 * or references an existing one.
 */
export class ConnectInstance extends Construct {
  public readonly instanceArn: string;

  constructor(scope: Construct, id: string, props: ConnectInstanceProps) {
    super(scope, id);

    if (props.createNew) {
      const instance = new connect.CfnInstance(this, "ConnectInstance", {
        identityManagementType: "CONNECT_MANAGED",
        instanceAlias: props.instanceAlias,
        attributes: {
          inboundCalls: true,
          outboundCalls: true,
          autoResolveBestVoices: true,
          contactflowLogs: true,
          earlyMedia: true,
        },
      });

      this.instanceArn = instance.attrArn;

      new cdk.CfnOutput(this, "ConnectInstanceArn", {
        value: instance.attrArn,
        description: "ARN of the Amazon Connect instance",
        exportName: "ConnectInstanceArn",
      });

      new cdk.CfnOutput(this, "ConnectInstanceId", {
        value: instance.attrId,
        description: "ID of the Amazon Connect instance",
        exportName: "ConnectInstanceId",
      });
    } else {
      if (!props.existingInstanceArn) {
        throw new Error(
          "connectInstanceArn is required when createNew is false. " +
            "Set CONNECT_INSTANCE_ARN in your .env file."
        );
      }
      this.instanceArn = props.existingInstanceArn;
    }
  }
}
