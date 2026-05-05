import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";

export interface WebSocketBridgeProps {
  /**
   * The Secrets Manager secret containing the ElevenLabs API key.
   */
  elevenLabsSecret: secretsmanager.ISecret;

  /**
   * The ElevenLabs Conversational AI Agent ID.
   */
  elevenLabsAgentId: string;

  /**
   * The ARN of the Amazon Connect instance.
   */
  connectInstanceArn: string;
}

/**
 * Creates a Lambda function that acts as a WebSocket bridge between
 * Amazon Connect's audio stream and ElevenLabs Conversational AI agent.
 *
 * The Lambda is invoked by Amazon Connect via a contact flow and:
 * 1. Receives the caller's audio stream from Connect
 * 2. Forwards it to the ElevenLabs agent via WebSocket
 * 3. Receives the agent's audio response
 * 4. Streams it back to the caller through Connect
 */
export class WebSocketBridge extends Construct {
  public readonly bridgeFunction: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: WebSocketBridgeProps) {
    super(scope, id);

    // Lambda function for the WebSocket bridge
    this.bridgeFunction = new lambdaNode.NodejsFunction(this, "BridgeFunction", {
      entry: path.join(__dirname, "../../lambda/websocket-bridge/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(15), // Max for Connect Lambda invocations
      memorySize: 512,
      environment: {
        ELEVENLABS_SECRET_ARN: props.elevenLabsSecret.secretArn,
        ELEVENLABS_AGENT_ID: props.elevenLabsAgentId,
        CONNECT_INSTANCE_ARN: props.connectInstanceArn,
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        format: lambdaNode.OutputFormat.CJS,
        externalModules: ["@aws-sdk/*"],
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
      description: "WebSocket bridge between Amazon Connect and ElevenLabs Conversational AI",
    });

    // Grant the Lambda permission to read the ElevenLabs API key secret
    props.elevenLabsSecret.grantRead(this.bridgeFunction);

    // Grant the Lambda permission to interact with Amazon Connect
    this.bridgeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "connect:StartContactStreaming",
          "connect:StopContactStreaming",
        ],
        resources: [props.connectInstanceArn, `${props.connectInstanceArn}/*`],
      })
    );

    // Output the Lambda ARN for use in Connect contact flows
    new cdk.CfnOutput(this, "BridgeFunctionArn", {
      value: this.bridgeFunction.functionArn,
      description:
        "ARN of the WebSocket bridge Lambda (use in Connect 'Invoke AWS Lambda function' block)",
      exportName: "ElevenLabsBridgeFunctionArn",
    });

    new cdk.CfnOutput(this, "BridgeFunctionName", {
      value: this.bridgeFunction.functionName,
      description: "Name of the WebSocket bridge Lambda function",
      exportName: "ElevenLabsBridgeFunctionName",
    });
  }
}
