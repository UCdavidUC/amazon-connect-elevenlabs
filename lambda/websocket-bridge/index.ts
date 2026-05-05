import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { ElevenLabsConversationClient } from "./elevenlabs-client";

const secretsClient = new SecretsManagerClient({});

let cachedApiKey: string | undefined;

/**
 * Retrieves the ElevenLabs API key from Secrets Manager (with caching).
 */
async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const secretArn = process.env.ELEVENLABS_SECRET_ARN;
  if (!secretArn) throw new Error("ELEVENLABS_SECRET_ARN not set");

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error("Secret value is empty");
  }

  // Secret is stored as JSON: {"apiToken": "sk_xxx"}
  const parsed = JSON.parse(response.SecretString);
  cachedApiKey = parsed.apiToken || parsed.api_key;

  if (!cachedApiKey) {
    throw new Error("apiToken not found in secret JSON");
  }

  return cachedApiKey;
}

/**
 * Amazon Connect Lambda handler.
 *
 * This function is invoked by Amazon Connect via an "Invoke AWS Lambda function"
 * block in a contact flow. It bridges the caller's audio to an ElevenLabs
 * Conversational AI agent.
 *
 * Connect invocation types:
 * - Initial invocation: Sets up the conversation
 * - Streaming invocation: Handles real-time audio exchange
 *
 * The function returns SSML/text responses that Connect plays to the caller,
 * or signals to transfer/hang up.
 */
export async function handler(event: ConnectContactFlowEvent): Promise<ConnectLambdaResponse> {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) {
    console.error("ELEVENLABS_AGENT_ID not set");
    return buildResponse("I'm sorry, the voice agent is not configured. Please try again later.");
  }

  try {
    const apiKey = await getApiKey();
    const contactId = event.Details.ContactData.ContactId;
    const callerNumber =
      event.Details.ContactData.CustomerEndpoint?.Address || "unknown";

    console.log(`Processing contact ${contactId} from ${callerNumber}`);

    // Determine the action based on the invocation parameters
    const action = event.Details.Parameters?.action || "greet";
    const userInput = event.Details.Parameters?.userInput || "";

    switch (action) {
      case "greet": {
        // Initial greeting — start a conversation with the ElevenLabs agent
        const client = new ElevenLabsConversationClient(apiKey, agentId);
        const greeting = await client.getInitialGreeting();
        return buildResponse(greeting, { conversationStarted: "true" });
      }

      case "process_input": {
        // Process user speech input through the ElevenLabs agent
        if (!userInput) {
          return buildResponse("I didn't catch that. Could you please repeat?");
        }

        const client = new ElevenLabsConversationClient(apiKey, agentId);
        const response = await client.sendMessage(userInput);

        // Check if the agent wants to end the conversation
        if (response.shouldEndConversation) {
          return buildResponse(response.text, { endConversation: "true" });
        }

        return buildResponse(response.text);
      }

      case "transfer": {
        // Agent requested transfer to human agent
        return buildResponse("Let me transfer you to a human agent. Please hold.", {
          transferToAgent: "true",
        });
      }

      default:
        return buildResponse("How can I help you today?");
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return buildResponse(
      "I'm experiencing a technical issue. Let me transfer you to a human agent.",
      { transferToAgent: "true" }
    );
  }
}

/**
 * Builds a response object for Amazon Connect.
 */
function buildResponse(
  message: string,
  additionalAttributes: Record<string, string> = {}
): ConnectLambdaResponse {
  return {
    message,
    ...additionalAttributes,
  };
}

// --- Type Definitions ---

interface ConnectContactFlowEvent {
  Details: {
    ContactData: {
      ContactId: string;
      Channel: string;
      InstanceARN: string;
      CustomerEndpoint?: {
        Address: string;
        Type: string;
      };
      SystemEndpoint?: {
        Address: string;
        Type: string;
      };
      Attributes: Record<string, string>;
    };
    Parameters: Record<string, string>;
  };
  Name: string;
}

interface ConnectLambdaResponse {
  message: string;
  [key: string]: string;
}
