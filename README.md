# Payroute x402 SDK

The official Node.js and TypeScript SDK for the **Payroute Protocol** on Mantle Network.

This SDK abstracts the complexity of **HTTP 402 Pay-Per-Hit** workflows, enabling seamless autonomous payments for premium APIs, static content, and AI Agents. It handles wallet management, token approvals, on-chain escrow transactions, and automatic request retries.

## Features

- 🚀 **Full x402 Abstraction**: Automates the HTTP 402 -> Payment -> Retry loop.
- 💸 **Mantle Network Support**: Built for Mantle Mainnet and Sepolia Testnet.
- 🤖 **AI Agent Ready**: Dedicated methods for interacting with Payroute-enabled AI Agents.
- 📦 **Token Management**: Automatically handles ERC20 (MUSD) approvals and transfers.
- 🛡️ **Type-Safe**: Written in TypeScript with full type definitions.

## Installation

```bash
npm install payroute-x402-sdk ethers
```

_Note: `ethers` peer dependency (v6) is required._

## Quick Start

### 1. Initialize the Service

```typescript
import { PaymentService } from "payroute-x402-sdk";

const service = new PaymentService({
  privateKey: process.env.WALLET_PRIVATE_KEY, // Your EVM private key
  network: "mantle", // 'mantle' | 'mantleTestnet' | 'localhost'
});
```

### 2. Consume a Paid Proxy Endpoint

Access premium content served behind a Payroute gateway.

```typescript
try {
  const content = await service.getProxyEndpoint("my-premium-blog-post");
  console.log("Accessed Content:", content);
} catch (error) {
  console.error("Payment or Fetch Failed:", error);
}
```

### 3. Interact with a Paid AI Agent

Send messages to an AI agent that requires per-message payments.

```typescript
try {
  const response = await service.generateAIResponse(
    "finance-advisor-agent",
    "What is the outlook for MNT?"
  );
  console.log("AI Response:", response);
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

### Generic Pay-And-Retry

If you are building a custom integration that follows the x402 generic pattern but doesn't fit the standard gateway/agent flow, you can use the low-level `payAndRetry` method.

```typescript
const response = await service.payAndRetry({
  paymentData: {
    amount: "1000000000000000000", // 1 ETH/MNT in wei
    recipient: "0x123...",
  },
  retryRequest: async (headers) => {
    // Perform your custom retry logic here using the provided headers
    // headers['X-Payment-Tx'] will contain the transaction hash
    return fetch("https://api.custom.com/resource", { headers });
  },
});
```

## Architecture

The SDK implements the **Payroute x402 Protocol**:

1.  **Request**: SDK attempts to access a resource.
2.  **Challenge (402)**: Server responds with `402 Payment Required` and payment details (Escrow contract, Amount, Transaction ID).
3.  **Approval**: SDK approves the required token (MUSD) for the escrow contract.
4.  **Payment**: SDK calls the Escrow contract's `createTx` function.
5.  **Confirmation**: SDK waits for blockchain confirmation.
6.  **Retry**: SDK retries the original request with the transaction hash in the `x-payment-tx` header.
7.  **Response**: Server validates the transaction and returns the content.

## License

MIT © [Payroute Protocol](https://github.com/payroute-protocol)
