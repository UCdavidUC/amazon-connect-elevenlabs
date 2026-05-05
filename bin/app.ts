#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { ConnectElevenLabsStack } from "../lib/connect-elevenlabs-stack";

dotenv.config();

const app = new cdk.App();

new ConnectElevenLabsStack(app, "ConnectElevenLabsStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "Amazon Connect + ElevenLabs Voice AI Integration",

  // ElevenLabs configuration
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
  elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID || "",
  elevenLabsSecretName: process.env.ELEVENLABS_SECRET_NAME || "",

  // Connect configuration
  createNewConnectInstance: process.env.CREATE_NEW_CONNECT_INSTANCE === "true",
  connectInstanceArn: process.env.CONNECT_INSTANCE_ARN || "",
  connectInstanceAlias: process.env.CONNECT_INSTANCE_ALIAS || "elevenlabs-connect",

  // Feature flags
  deployAgentBridge: process.env.DEPLOY_AGENT_BRIDGE === "true",
});
