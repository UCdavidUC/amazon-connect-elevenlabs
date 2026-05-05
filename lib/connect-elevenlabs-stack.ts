import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ElevenLabsSecret } from "./constructs/elevenlabs-secret";
import { ConnectInstance } from "./constructs/connect-instance";
import { WebSocketBridge } from "./constructs/websocket-bridge";
import { LexPassthroughBot } from "./constructs/lex-passthrough-bot";

export interface ConnectElevenLabsStackProps extends cdk.StackProps {
  // ElevenLabs
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
  elevenLabsAgentId: string;
  elevenLabsSecretName: string;

  // Connect
  createNewConnectInstance: boolean;
  connectInstanceArn: string;
  connectInstanceAlias: string;

  // Features
  deployAgentBridge: boolean;
}

export class ConnectElevenLabsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ConnectElevenLabsStackProps) {
    super(scope, id, props);

    // =========================================================================
    // Amazon Connect Instance
    // =========================================================================
    const connectInstance = new ConnectInstance(this, "ConnectInstance", {
      createNew: props.createNewConnectInstance,
      existingInstanceArn: props.connectInstanceArn,
      instanceAlias: props.connectInstanceAlias,
    });

    // =========================================================================
    // Approach 1: Native TTS — Secrets Manager + KMS for ElevenLabs API Key
    // =========================================================================
    const elevenLabsSecret = new ElevenLabsSecret(this, "ElevenLabsSecret", {
      existingSecretName: props.elevenLabsSecretName || undefined,
      apiKey: props.elevenLabsSecretName ? undefined : props.elevenLabsApiKey,
      connectInstanceArn: connectInstance.instanceArn,
      accountId: this.account,
    });

    // Output the values needed to configure the Set Voice block in Connect
    new cdk.CfnOutput(this, "ElevenLabsVoiceId", {
      value: props.elevenLabsVoiceId,
      description: "ElevenLabs Voice ID (use in Connect Set Voice block → Voice field)",
    });

    new cdk.CfnOutput(this, "ElevenLabsModelId", {
      value: props.elevenLabsModelId,
      description: "ElevenLabs Model ID (use in Connect Set Voice block → Model field)",
    });

    // =========================================================================
    // Approach 2: Conversational AI Agent — Lambda WebSocket Bridge
    // =========================================================================
    if (props.deployAgentBridge && props.elevenLabsAgentId) {
      // Lex passthrough bot for capturing free-form speech in Connect
      new LexPassthroughBot(this, "LexPassthroughBot");

      new WebSocketBridge(this, "WebSocketBridge", {
        elevenLabsSecret: elevenLabsSecret.secret,
        elevenLabsAgentId: props.elevenLabsAgentId,
        connectInstanceArn: connectInstance.instanceArn,
      });
    } else if (props.deployAgentBridge && !props.elevenLabsAgentId) {
      console.warn(
        "⚠️  DEPLOY_AGENT_BRIDGE is true but ELEVENLABS_AGENT_ID is not set. " +
          "Skipping WebSocket bridge deployment. Set ELEVENLABS_AGENT_ID in .env to enable."
      );
    }
  }
}
