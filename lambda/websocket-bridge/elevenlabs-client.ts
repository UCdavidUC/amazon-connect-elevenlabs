/**
 * Response from the ElevenLabs Conversational AI agent.
 */
export interface AgentResponse {
  text: string;
  shouldEndConversation: boolean;
}

/**
 * Client for interacting with the ElevenLabs Conversational AI WebSocket API.
 *
 * Uses the native WebSocket available in Node.js 22+ (no external dependency).
 *
 * This client connects to the ElevenLabs agent via WebSocket and exchanges
 * text messages. For the Amazon Connect integration, we use the text-mode
 * conversation because Connect handles the STT/TTS separately via its native
 * third-party provider support.
 *
 * API Reference: https://elevenlabs.io/docs/conversational-ai/api-reference
 */
export class ElevenLabsConversationClient {
  private apiKey: string;
  private agentId: string;
  private baseUrl = "https://api.elevenlabs.io";

  constructor(apiKey: string, agentId: string) {
    this.apiKey = apiKey;
    this.agentId = agentId;
  }

  /**
   * Gets a signed WebSocket URL for the agent conversation.
   * The signed URL expires after 15 minutes.
   */
  private async getSignedUrl(): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/v1/convai/conversation/get_signed_url?agent_id=${this.agentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get signed URL: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as { signed_url: string };
    return data.signed_url;
  }

  /**
   * Gets the initial greeting from the agent.
   * Connects via WebSocket, waits for the agent's first message, then disconnects.
   */
  async getInitialGreeting(): Promise<string> {
    const signedUrl = await this.getSignedUrl();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Timeout waiting for agent greeting"));
      }, 10_000);

      // Node.js 22+ native WebSocket
      const ws = new WebSocket(signedUrl);
      let greeting = "";

      ws.addEventListener("open", () => {
        // Send conversation initiation
        ws.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: "", // Use the agent's default prompt
                },
              },
            },
          })
        );
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        try {
          const data = JSON.parse(
            typeof event.data === "string" ? event.data : event.data.toString()
          );

          // Respond to ping to keep connection alive
          if (data.type === "ping") {
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: "pong",
                  event_id: data.ping_event.event_id,
                })
              );
            }, data.ping_event.ping_ms);
          }

          if (data.type === "agent_response") {
            greeting += data.agent_response_event.agent_response;
          }

          // The agent has finished its initial response
          if (data.type === "agent_response_correction") {
            greeting =
              data.agent_response_correction_event.corrected_agent_response;
          }

          // Wait for the turn to complete
          if (data.type === "interruption" || data.type === "turn_end") {
            clearTimeout(timeout);
            ws.close();
            resolve(greeting || "Hello! How can I help you today?");
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      });

      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection error"));
      });

      ws.addEventListener("close", () => {
        clearTimeout(timeout);
        if (!greeting) {
          resolve("Hello! How can I help you today?");
        }
      });
    });
  }

  /**
   * Sends a text message to the agent and returns the response.
   * Opens a WebSocket connection, sends the user's text, and waits for the agent's reply.
   */
  async sendMessage(userMessage: string): Promise<AgentResponse> {
    const signedUrl = await this.getSignedUrl();

    return new Promise<AgentResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Timeout waiting for agent response"));
      }, 15_000);

      const ws = new WebSocket(signedUrl);
      let responseText = "";
      let shouldEnd = false;

      ws.addEventListener("open", () => {
        // Initialize conversation in text mode
        ws.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: "", // Use agent's default prompt
                },
              },
            },
          })
        );
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        try {
          const data = JSON.parse(
            typeof event.data === "string" ? event.data : event.data.toString()
          );

          // Respond to ping
          if (data.type === "ping") {
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: "pong",
                  event_id: data.ping_event.event_id,
                })
              );
            }, data.ping_event.ping_ms);
          }

          // Wait for conversation to be ready, then send user message
          if (data.type === "conversation_initiation_metadata") {
            ws.send(
              JSON.stringify({
                type: "user_message",
                user_message: {
                  text: userMessage,
                },
              })
            );
          }

          if (data.type === "agent_response") {
            responseText += data.agent_response_event.agent_response;
          }

          if (data.type === "agent_response_correction") {
            responseText =
              data.agent_response_correction_event.corrected_agent_response;
          }

          // Check for end-of-conversation signals from tools
          if (data.type === "tool_call") {
            const toolName = data.tool_call_event?.tool_name;
            if (
              toolName === "end_conversation" ||
              toolName === "hang_up" ||
              toolName === "transfer_to_agent"
            ) {
              shouldEnd = true;
            }
          }

          if (data.type === "turn_end" || data.type === "interruption") {
            clearTimeout(timeout);
            ws.close();
            resolve({
              text:
                responseText ||
                "I'm sorry, I didn't understand. Could you rephrase that?",
              shouldEndConversation: shouldEnd,
            });
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      });

      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection error"));
      });

      ws.addEventListener("close", () => {
        clearTimeout(timeout);
        resolve({
          text: responseText || "I'm sorry, could you repeat that?",
          shouldEndConversation: shouldEnd,
        });
      });
    });
  }
}
