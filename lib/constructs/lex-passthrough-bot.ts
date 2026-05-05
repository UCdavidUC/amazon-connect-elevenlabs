import * as cdk from "aws-cdk-lib";
import * as lex from "aws-cdk-lib/aws-lex";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface LexPassthroughBotProps {
  /**
   * The locale for speech recognition (e.g., "en_US").
   */
  locale?: string;
}

/**
 * Creates a minimal Amazon Lex V2 bot that acts as a speech-to-text passthrough.
 *
 * The bot has no real intents — only a FallbackIntent that captures all speech.
 * This lets Amazon Connect's "Get Customer Input" block transcribe free-form
 * speech without needing intent matching. The transcribed text is available
 * at $.Lex.FallbackIntent.InputTranscript in the contact flow.
 */
export class LexPassthroughBot extends Construct {
  public readonly bot: lex.CfnBot;
  public readonly botVersion: lex.CfnBotVersion;
  public readonly botAlias: lex.CfnBotAlias;

  constructor(scope: Construct, id: string, props: LexPassthroughBotProps = {}) {
    super(scope, id);

    const locale = props.locale || "en_US";

    // IAM role for the Lex bot
    const botRole = new iam.Role(this, "BotRole", {
      assumedBy: new iam.ServicePrincipal("lexv2.amazonaws.com"),
      description: "Role for ElevenLabs speech passthrough Lex bot",
    });

    // Lex V2 Bot
    this.bot = new lex.CfnBot(this, "PassthroughBot", {
      name: "ElevenLabsSpeechPassthrough",
      description:
        "Passthrough bot for capturing free-form speech in Amazon Connect. " +
        "All input falls through to FallbackIntent, providing transcribed text.",
      roleArn: botRole.roleArn,
      dataPrivacy: { ChildDirected: false },
      idleSessionTtlInSeconds: 300,
      autoBuildBotLocales: true,
      botLocales: [
        {
          localeId: locale,
          nluConfidenceThreshold: 0.4,
          intents: [
            {
              // FallbackIntent is a built-in intent that catches everything
              // not matched by other intents. Since we have no other intents,
              // it catches all speech input.
              name: "FallbackIntent",
              parentIntentSignature: "AMAZON.FallbackIntent",
              intentClosingSetting: {
                closingResponse: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value: " ", // Minimal response — Connect handles the actual reply
                        },
                      },
                    },
                  ],
                },
                isActive: false, // Don't play the closing response
              },
            },
          ],
        },
      ],
    });

    // Bot Version — creates an immutable numbered version (e.g., "1")
    // The alias requires a numeric version, not "DRAFT"
    this.botVersion = new lex.CfnBotVersion(this, "PassthroughBotVersion", {
      botId: this.bot.attrId,
      botVersionLocaleSpecification: [
        {
          localeId: locale,
          botVersionLocaleDetails: {
            sourceBotVersion: "DRAFT",
          },
        },
      ],
      description: "Initial version",
    });

    // Bot Alias — points to the numbered version, required for Connect integration
    this.botAlias = new lex.CfnBotAlias(this, "PassthroughBotAlias", {
      botId: this.bot.attrId,
      botAliasName: "live",
      botVersion: this.botVersion.attrBotVersion,
      sentimentAnalysisSettings: { DetectSentiment: false },
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "LexBotName", {
      value: this.bot.name!,
      description: "Lex bot name (select in Connect Get Customer Input block)",
      exportName: "ElevenLabsLexBotName",
    });

    new cdk.CfnOutput(this, "LexBotId", {
      value: this.bot.attrId,
      description: "Lex bot ID",
      exportName: "ElevenLabsLexBotId",
    });

    new cdk.CfnOutput(this, "LexBotAliasName", {
      value: "live",
      description: "Lex bot alias name (select in Connect Get Customer Input block)",
      exportName: "ElevenLabsLexBotAliasName",
    });
  }
}
