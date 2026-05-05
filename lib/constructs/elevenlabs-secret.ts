import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface ElevenLabsSecretProps {
  /**
   * The name or ARN of an existing Secrets Manager secret containing the ElevenLabs API key.
   * If provided, the construct imports the existing secret instead of creating a new one.
   */
  existingSecretName?: string;

  /**
   * The ElevenLabs API key to store. Only used when creating a new secret
   * (i.e., when existingSecretName is not provided).
   */
  apiKey?: string;

  /**
   * The ARN of the Amazon Connect instance that will access this secret.
   */
  connectInstanceArn: string;

  /**
   * The AWS account ID.
   */
  accountId: string;
}

/**
 * Manages the Secrets Manager secret containing the ElevenLabs API key.
 *
 * Always creates a customer-managed KMS key with the correct Connect resource policy.
 * If an existing secret name is provided, it imports that secret (you must re-encrypt
 * the secret with the new KMS key manually or via CLI after deployment).
 *
 * Reference: https://docs.aws.amazon.com/connect/latest/adminguide/managing-secrets-resource-policies.html
 */
export class ElevenLabsSecret extends Construct {
  public readonly secret: secretsmanager.ISecret;
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: ElevenLabsSecretProps) {
    super(scope, id);

    // --- KMS Key (always created) ---
    // Amazon Connect requires a customer-managed KMS key, not the default aws/secretsmanager key.
    this.kmsKey = new kms.Key(this, "ElevenLabsKmsKey", {
      description: "KMS key for ElevenLabs API key secret used by Amazon Connect",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      alias: "alias/elevenlabs-connect-key",
    });

    // Grant Amazon Connect permission to decrypt
    this.kmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowConnectDecrypt",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("connect.amazonaws.com")],
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          ArnLike: {
            "aws:sourceArn": props.connectInstanceArn,
          },
          StringEquals: {
            "aws:sourceAccount": props.accountId,
          },
        },
      })
    );

    if (props.existingSecretName) {
      // ---------------------------------------------------------------
      // Import an existing secret
      // ---------------------------------------------------------------
      this.secret = secretsmanager.Secret.fromSecretNameV2(
        this,
        "ImportedSecret",
        props.existingSecretName
      );
    } else {
      // ---------------------------------------------------------------
      // Create a new secret
      // ---------------------------------------------------------------
      if (!props.apiKey) {
        throw new Error(
          "Either existingSecretName or apiKey must be provided. " +
            "Set ELEVENLABS_SECRET_NAME or ELEVENLABS_API_KEY in your .env file."
        );
      }

      const newSecret = new secretsmanager.Secret(this, "ElevenLabsApiKeySecret", {
        secretName: "elevenlabs/api-key",
        description: "ElevenLabs API key for Amazon Connect third-party TTS integration",
        encryptionKey: this.kmsKey,
        secretObjectValue: {
          api_key: cdk.SecretValue.unsafePlainText(props.apiKey),
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      newSecret.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: "AllowConnectGetSecret",
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal("connect.amazonaws.com")],
          actions: ["secretsmanager:GetSecretValue"],
          resources: ["*"],
          conditions: {
            ArnLike: {
              "aws:sourceArn": props.connectInstanceArn,
            },
            StringEquals: {
              "aws:sourceAccount": props.accountId,
            },
          },
        })
      );

      this.secret = newSecret;
    }

    // --- Outputs ---
    new cdk.CfnOutput(this, "SecretArn", {
      value: this.secret.secretArn,
      description: "ARN of the ElevenLabs API key secret (use in Connect Set Voice block)",
      exportName: "ElevenLabsSecretArn",
    });

    new cdk.CfnOutput(this, "KmsKeyArn", {
      value: this.kmsKey.keyArn,
      description: "KMS key ARN — re-encrypt your secret with this key",
      exportName: "ElevenLabsKmsKeyArn",
    });

    new cdk.CfnOutput(this, "KmsKeyId", {
      value: this.kmsKey.keyId,
      description: "KMS key ID — use in the aws secretsmanager update-secret command",
      exportName: "ElevenLabsKmsKeyId",
    });
  }
}
