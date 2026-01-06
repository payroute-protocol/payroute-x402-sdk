import { ethers } from 'ethers';
/**
 * PaymentData interface for transaction details
 */
export interface PaymentData {
  amount: string; // Amount in wei
  recipient: string; // Recipient address
  currency?: string; // Optional, defaults to native token (MNT)
}

/**
 * Configuration options for the PaymentService
 */
export interface PaymentServiceConfig {
  privateKey: string;
  network?: 'mantle' | 'mantleTestnet' | 'localhost';
  rpcUrl?: string; // Allow custom RPC URL override
}

/**
 * Network configuration map
 */
const NETWORKS = {
  mantle: {
    name: 'Mantle Mainnet',
    rpc: 'https://rpc.mantle.xyz',
    chainId: 5000,
  },
  mantleTestnet: {
    name: 'Mantle Testnet',
    rpc: 'https://rpc.sepolia.mantle.xyz',
    chainId: 5003,
  },
  localhost: {
    name: 'Localhost',
    rpc: 'http://127.0.0.1:8545',
    chainId: 31337,
  }
};

const BASE_ENDPOINT = 'https://x402-services.vercel.app';
const ESCROW_ABI = [
  "function createTx(string txId, address creator, uint256 amount) external payable"
];
const MUSD_ADDRESS = '0x4dABf45C8cF333Ef1e874c3FDFC3C86799af80c8';
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];


/**
 * PaymentService class
 * Handles EVM wallet initialization, transaction signing, and payment flow with retries.
 */
export class PaymentService {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;

  constructor(config: PaymentServiceConfig) {
    const networkKey = config.network || 'mantle';
    const networkConfig = NETWORKS[networkKey];
    
    if (!networkConfig && !config.rpcUrl) {
        throw new Error(`Invalid network: ${networkKey} and no RPC URL provided.`);
    }

    const rpcUrl = config.rpcUrl || networkConfig?.rpc;
    
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Initialize wallet
    try {
      this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    } catch (error) {
      throw new Error('Invalid private key provided.');
    }
  }

  /**
   * Performs a payment on-chain and retries the original request with proof of payment.
   * 
   * @param params.paymentData - The payment details (amount, recipient).
   * @param params.retryRequest - A callback that performs the HTTP request. Must accept headers.
   * @returns The response from the retried request.
   */
  async payAndRetry<T>(params: {
    paymentData: PaymentData;
    retryRequest: (headers: Record<string, string>) => Promise<T>;
  }): Promise<T> {
    const { paymentData, retryRequest } = params;

    try {
      // 1. Validate Payment Data
      if (!ethers.isAddress(paymentData.recipient)) {
        throw new Error(`Invalid recipient address: ${paymentData.recipient}`);
      }

      // 2. Build Transaction
      const txRequest = {
        to: paymentData.recipient,
        value: BigInt(paymentData.amount),
        // Gas limit/price will be estimated by provider/wallet
      };

      // 3. Sign & Send Transaction
      // console.log(`Sending payment of ${paymentData.amount} wei to ${paymentData.recipient}...`);
      const txResponse = await this.wallet.sendTransaction(txRequest);
      
      // 4. Wait for confirmation
      // console.log(`Transaction sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1); // Wait for 1 confirmation

      if (!receipt || receipt.status !== 1) {
        throw new Error('Transaction failed or was reverted on-chain.');
      }

      // 5. Retry original request with header X-Payment-Tx
      const txHash = receipt.hash;
      const headers = {
        'X-Payment-Tx': txHash,
        'Content-Type': 'application/json', // Default content type, extendable if needed
      };

      // 6. Return final HTTP response
      return await retryRequest(headers);

    } catch (error: any) {
      // 7. Throw clear errors on failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during payment flow';
      // console.error('PaymentService Error:', errorMessage);
      throw new Error(`PaymentService Failed: ${errorMessage}`);
    }
  }

  /**
   * Get AI response
   * 
   * @param agentSlug
   * @returns
   */
  async generateAIResponse<T = any>(agentSlug: string, message: string): Promise<T> {
    try {
      const initialResponse = await fetch(`${BASE_ENDPOINT}/agent/${agentSlug}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
        }),
      });

      if (!initialResponse.ok && initialResponse.status !== 402) {
        throw new Error(`Unexpected status code: ${initialResponse.status}`);
      }

      const paymentDetail = await initialResponse.json();
      
      const txId = paymentDetail.transactionId;
      const escrowAddress = paymentDetail.escrowAddress;
      const amountPayment = paymentDetail.amountPayment;
      // Expect contract address in response, or default to a known address if applicable
      const contractAddress = paymentDetail.contractAddress; 

      if (!contractAddress) {
          throw new Error('Contract address not found in payment details.');
      }

      // Payment to escrow wallet (smart contract call)
      // Approve MUSD
      const musdContract = new ethers.Contract(MUSD_ADDRESS, ERC20_ABI, this.wallet);
      // console.log(`Approving MUSD spending for ${contractAddress}...`);
      const approveTx = await musdContract.approve(contractAddress, amountPayment);
      await approveTx.wait(1);

      //Create Transaction on Escrow
      // console.log(`Initiating Expect Payment to ${contractAddress} for creator ${escrowAddress} (${amountPayment} wei)`);
      const contract = new ethers.Contract(contractAddress, ESCROW_ABI, this.wallet);
      
      // Note: We are using MUSD now, so we generally do NOT send native value (msg.value) 
      // unless the contract specifically requires both. Assuming standard ERC20 payment:
      const txResponse = await contract.createTx(
          txId, 
          escrowAddress, 
          amountPayment
      );
      
      // console.log(`Escrow payment sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);

      if (!receipt || receipt.status !== 1) {
          throw new Error('Escrow transaction failed.');
      }

      // Retry with txHash
      const finalTxHash = receipt.hash;
      const headers = {
        'x-payment-tx': finalTxHash,
        'Content-Type': 'application/json'
      };

      const retryResponse = await fetch(`${BASE_ENDPOINT}/agent/${agentSlug}/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message,
        }),
      });

      if (!retryResponse.ok) {
           const errorText = await retryResponse.text();
           throw new Error(`Retry failed: ${retryResponse.status} - ${errorText}`);
      }

      return await retryResponse.json();
      
      
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during payment flow';
      throw new Error(`PaymentService Failed: ${errorMessage}`);
    }
  }

  /**
   * Get proxy endpoint
   * 
   * @param gatewaySlug 
   * @returns 
   */
  async getProxyEndpoint<T = any>(gatewaySlug: string): Promise<T> {
    try {
      // Get payment details
      const initialResponse = await fetch(`${BASE_ENDPOINT}/escrow/${gatewaySlug}`);
      
      // If success immediately (no payment required), return data
      if (initialResponse.ok) {
        return await initialResponse.json();
      }

      if (initialResponse.status !== 402) {
          throw new Error(`Unexpected status code: ${initialResponse.status}`);
      }

      const paymentDetail = await initialResponse.json();
      
      const txId = paymentDetail.transactionId;
      const escrowAddress = paymentDetail.escrowAddress;
      const amountPayment = paymentDetail.amountPayment;
      // Expect contract address in response, or default to a known address if applicable
      const contractAddress = paymentDetail.contractAddress; 

      if (!contractAddress) {
          throw new Error('Contract address not found in payment details.');
      }

      // Payment to escrow wallet (smart contract call)
      // Approve MUSD
      const musdContract = new ethers.Contract(MUSD_ADDRESS, ERC20_ABI, this.wallet);
      // console.log(`Approving MUSD spending for ${contractAddress}...`);
      const approveTx = await musdContract.approve(contractAddress, amountPayment);
      await approveTx.wait(1);

      //Create Transaction on Escrow
      // console.log(`Initiating Expect Payment to ${contractAddress} for creator ${escrowAddress} (${amountPayment} wei)`);
      const contract = new ethers.Contract(contractAddress, ESCROW_ABI, this.wallet);
      
      // Note: We are using MUSD now, so we generally do NOT send native value (msg.value) 
      // unless the contract specifically requires both. Assuming standard ERC20 payment:
      const txResponse = await contract.createTx(
          txId, 
          escrowAddress, 
          amountPayment
      );
      
      // console.log(`Escrow payment sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);

      if (!receipt || receipt.status !== 1) {
          throw new Error('Escrow transaction failed.');
      }

      // Retry with txHash
      const finalTxHash = receipt.hash;
      const headers = {
        'x-payment-tx': finalTxHash,
        'Content-Type': 'application/json'
      };

      const retryResponse = await fetch(`${BASE_ENDPOINT}/${gatewaySlug}`, {
          method: 'GET',
          headers: headers
      });

      if (!retryResponse.ok) {
           const errorText = await retryResponse.text();
           throw new Error(`Retry failed: ${retryResponse.status} - ${errorText}`);
      }

      return await retryResponse.json();

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error in getProxyEndpoint';
        throw new Error(`Proxy Endpoint Failed: ${errorMessage}`);
    }
  }


  /**
   * Helper to get the current wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }
}
