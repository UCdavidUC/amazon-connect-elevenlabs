# Amazon Connect + ElevenLabs Integration

This project provides two integration approaches between Amazon Connect and ElevenLabs:

1. **Native TTS Integration** — Uses Amazon Connect's built-in third-party TTS support to replace Amazon Polly with ElevenLabs voices in your contact flows. Simple, low-code, production-ready.

2. **Conversational AI Agent Integration** — Bridges Amazon Connect calls to an ElevenLabs Conversational AI agent via a Lambda-powered WebSocket relay. Full agent capabilities including real-time conversation, tool use, and knowledge base access.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Approach 1: Native TTS                           │
│                                                                     │
│  Caller ──► Amazon Connect ──► Set Voice Block (ElevenLabs) ──►     │
│             Contact Flow       Secrets Manager (API Key)            │
│                                KMS Key (Encryption)                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│              Approach 2: Conversational AI Agent                    │
│                                                                     │
│  Caller ──► Amazon Connect ──► Lambda (WebSocket Bridge) ──►        │
│             Contact Flow       ▲                          │         │
│             (Streaming)        │                          ▼         │
│                                └──── ElevenLabs Agent ◄──┘         │
│                                      (wss://api.elevenlabs.io)     │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- AWS Account with Amazon Connect instance
- ElevenLabs account (Starter plan or above for API access)
- Node.js 18+ and npm
- AWS CDK v2 installed (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate credentials

## Quick Start

```bash
# Install dependencies
cd connect-elevenlabs
npm install

# Configure your environment
cp .env.example .env
# Edit .env with your values

# Deploy
npx cdk bootstrap   # First time only
npx cdk deploy
```

## Project Structure

```
connect-elevenlabs/
├── bin/
│   └── app.ts                          # CDK app entry point
├── lib/
│   ├── connect-elevenlabs-stack.ts     # Main CDK stack
│   └── constructs/
│       ├── elevenlabs-secret.ts        # Secrets Manager + KMS construct
│       ├── connect-instance.ts         # Connect instance construct
│       └── websocket-bridge.ts         # Lambda WebSocket bridge construct
├── lambda/
│   └── websocket-bridge/
│       ├── index.ts                    # Lambda handler
│       └── elevenlabs-client.ts        # ElevenLabs WebSocket client
├── docs/
│   ├── ELEVENLABS_SETUP.md            # ElevenLabs configuration guide
│   ├── CONNECT_FLOW_SETUP.md          # Contact flow setup guide
│   └── ARCHITECTURE.md                # Detailed architecture docs
├── .env.example
├── cdk.json
├── tsconfig.json
└── package.json
```

## Detailed Setup Guides

- [ElevenLabs Configuration](docs/ELEVENLABS_SETUP.md) — Create voices, agents, and get API keys
- [Amazon Connect Flow Setup](docs/CONNECT_FLOW_SETUP.md) — Configure contact flows
- [Architecture Details](docs/ARCHITECTURE.md) — Deep dive into the architecture

## Costs

- **Amazon Connect**: Per-minute telephony charges ([pricing](https://aws.amazon.com/connect/pricing/))
- **ElevenLabs**: Per-character TTS charges ([pricing](https://elevenlabs.io/pricing))
- **AWS Lambda**: Per-invocation + duration ([pricing](https://aws.amazon.com/lambda/pricing/))
- **Secrets Manager**: Per-secret/month + per-API-call ([pricing](https://aws.amazon.com/secrets-manager/pricing/))
- **KMS**: Per-key/month + per-API-call ([pricing](https://aws.amazon.com/kms/pricing/))

## License

MIT
