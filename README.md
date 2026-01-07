# Payroute x402 SDK

The official Node.js and TypeScript SDK for the **Payroute Protocol** on Mantle Network.

This SDK abstracts the complexity of **HTTP 402 Pay-Per-Hit** workflows, enabling seamless autonomous payments for premium APIs, static content, and AI Agents. It handles wallet management, token approvals, on-chain escrow transactions, and automatic request retries.

## Features

- **Full x402 Abstraction**: Automates the HTTP 402 -> Payment -> Retry loop.
- **Mantle Network Support**: Built for Mantle Mainnet and Sepolia Testnet.
- **AI Agent Ready**: Dedicated methods for interacting with Payroute-enabled AI Agents.
- **Token Management**: Automatically handles ERC20 (MUSD) approvals and transfers.
- **Type-Safe**: Written in TypeScript with full type definitions.

## Installation

```bash
npm install @payroute/x402-sdk
```

## Quick Start

### 1. Initialize the Service

```typescript
import { PaymentService } from "@payroute/x402-sdk";

const service = new PaymentService({
  privateKey: process.env.WALLET_PRIVATE_KEY, // Your EVM private key
  network: "mantle", // 'mantle' | 'mantleTestnet' | 'localhost'
});
```

### 2. Consume a Paid Proxy Endpoint

Access premium content served behind a Payroute gateway.

#### Direct Payment (Non-Escrow)

Use this method for direct peer-to-peer payments to a receiver.

```typescript
try {
  const content = await service.getProxyEndpoint("MantleDocs");
  console.log("Accessed Content:", content);
} catch (error) {
  console.error("Payment or Fetch Failed:", error);
}
```

#### Escrow Payment

Use this method when the gateway requires payment via an escrow smart contract.

```typescript
try {
  const contentStart = await service.getProxyEndpointEscrow("BitcoinOutlook");
  console.log("Accessed Escrow Content:", contentStart);
} catch (error) {
  console.error("Payment or Fetch Failed:", error);
}
```

### 3. Interact with a Paid AI Agent

Send messages to an AI agent that requires per-message payments.

#### Direct Payment (Non-Escrow)

```typescript
try {
  const response = await service.generateAIResponse(
    "mantleAgent",
    "How to build smart contract on Mantle Network?"
  );
  console.log("AI Response:", response);
} catch (error) {
  console.error("Agent Interaction Failed:", error);
}
```

#### Escrow Payment

```typescript
try {
  const responseEscrow = await service.generateAIResponseEscrow(
    "mantleAgent",
    "How to build AVS on EigenLayer?"
  );
  console.log("AI Response Escrow:", responseEscrow);
} catch (error) {
  console.error("Agent Interaction Failed:", error);
}
```

## Advanced Usage

### Custom RPC Provider

You can override the default RPC URLs for custom configuration.

```typescript
const service = new PaymentService({
  privateKey: "...",
  rpcUrl: "https://rpc.ankr.com/mantle",
});
```

## Integration with AI Agents & LLMs

One of the most powerful use cases for `@payroute/x402-sdk` is enabling **Autonomous Economic Agents**. Because the SDK handles the entire payment lifecycle programmatically, LLMs can "pay" for their own resources without user intervention.

### Example: Autonomous Research Agent

Imagine an AI agent tasked with gathering premium market data. It can use this SDK to automatically pay for each data point it accesses using its own wallet.

```typescript
import { PaymentService } from "@payroute/x402-sdk";
import { openai } from "./my-llm-setup"; // Hypothetical LLM client

// 1. Give the Agent a Wallet
const agentWalletKey = process.env.AGENT_PRIVATE_KEY;
const payroute = new PaymentService({
  privateKey: agentWalletKey,
  network: "mantle",
});

async function autonomousResearchTask(topic: string) {
  console.log(`Agent starting research on: ${topic}...`);

  // 2. Agent decides it needs premium data (e.g., from 'HighValueData' endpoint)
  // The SDK handles the 402 challenge, approves tokens, pays, and returns the data.
  console.log("Accessing premium data source...");

  // THIS SINGLE LINE handles the entire negotiation and payment
  const premiumData = await payroute.getProxyEndpointEscrow("HighValueData");

  // 3. Agent processes the purchased data
  console.log("Data acquired. Analyzing...");
  const analysis = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: `Analyze this data: ${JSON.stringify(premiumData)}`,
      },
    ],
  });

  return analysis.choices[0].message.content;
}
```

This pattern transforms **passive tools** into **economically active agents** capable of trading value for information or services on the open market.

### Example: Agent-to-Agent Consultation

Your agent can also pay to converse with other specialized AI agents (e.g., a "Legal Expert" or "Medical Advisor").

```typescript
async function consultExpertAgent(problem: string) {
  // Agent identifies it needs help from a specific expert agent slug
  const expertAgentSlug = "legal-expert-v1";

  console.log(`Consulting ${expertAgentSlug}...`);

  // The SDK handles payment for the conversation turn
  const expertAdvice = await payroute.generateAIResponseEscrow(
    expertAgentSlug,
    `I have a user asking about: ${problem}. What are the compliance risks?`
  );

  // Initial Agent integrates the paid advice into its final response
  return expertAdvice.response;
}
```

## Architecture

The SDK implements the **Payroute x402 Protocol**:

1.  **Request**: SDK attempts to access a resource.
2.  **Challenge (402)**: Server responds with `402 Payment Required` and payment details (Receiver Address, Amount, Transaction ID, and optionally Escrow Address).
3.  **Approval (If needed)**: SDK approves the required token (MUSD) for the escrow contract or spends directly.
4.  **Payment**:
    - **Direct**: Transfers MUSD directly to the receiver.
    - **Escrow**: Calls the Escrow contract's `createTx` function.
5.  **Confirmation**: SDK waits for blockchain confirmation.
6.  **Retry**: SDK retries the original request with the transaction hash in the `x-payment-tx` header.
7.  **Response**: Server validates the transaction and returns the content.

## License

MIT © [Payroute Protocol](https://github.com/payroute-protocol)
