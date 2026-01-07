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
  apiBaseUrl?: string; // Allow custom API Base URL
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

const ESCROW_ABI = [
  "function createTx(bytes32 txId, address creator, uint256 amount)",
];
const MUSD_ADDRESS = '0x4dABf45C8cF333Ef1e874c3FDFC3C86799af80c8';
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
];


/**
 * PaymentService class
 * Handles EVM wallet initialization, transaction signing, and payment flow with retries.
 */
export class PaymentService {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private apiBaseUrl: string;

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

    this.apiBaseUrl = config.apiBaseUrl || 'https://x402-services.vercel.app';
  }

  /**
   * Performs a payment on-chain and retries the original request with proof of payment.
   * 
   * @param params.paymentData - The payment details (amount, recipient).
   * @param params.retryRequest - A callback that performs the HTTP request. Must accept headers.
   * @returns The response from the retried request.
   */
  // async payAndRetry<T>(params: {
  //   paymentData: PaymentData;
  //   retryRequest: (headers: Record<string, string>) => Promise<T>;
  // }): Promise<T> {
  //   const { paymentData, retryRequest } = params;

  //   try {
  //     // 1. Validate Payment Data
  //     if (!ethers.isAddress(paymentData.recipient)) {
  //       throw new Error(`Invalid recipient address: ${paymentData.recipient}`);
  //     }

  //     // 2. Build Transaction
  //     const txRequest = {
  //       to: paymentData.recipient,
  //       value: BigInt(paymentData.amount),
  //       // Gas limit/price will be estimated by provider/wallet
  //     };

  //     // 3. Sign & Send Transaction
  //     // console.log(`Sending payment of ${paymentData.amount} wei to ${paymentData.recipient}...`);
  //     const txResponse = await this.wallet.sendTransaction(txRequest);
      
  //     // 4. Wait for confirmation
  //     // console.log(`Transaction sent: ${txResponse.hash}. Waiting for confirmation...`);
  //     const receipt = await txResponse.wait(1); // Wait for 1 confirmation

  //     if (!receipt || receipt.status !== 1) {
  //       throw new Error('Transaction failed or was reverted on-chain.');
  //     }

  //     // 5. Retry original request with header X-Payment-Tx
  //     const txHash = receipt.hash;
  //     const headers = {
  //       'X-Payment-Tx': txHash,
  //       'Content-Type': 'application/json', // Default content type, extendable if needed
  //     };

  //     // 6. Return final HTTP response
  //     return await retryRequest(headers);

  //   } catch (error: any) {
  //     // 7. Throw clear errors on failure
  //     const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during payment flow';
  //     // console.error('PaymentService Error:', errorMessage);
  //     throw new Error(`PaymentService Failed: ${errorMessage}`);
  //   }
  // }

  /**
   * Get AI response
   * 
   * @param agentSlug
   * @returns
   */
  async generateAIResponse<T = any>(agentSlug: string, message: string): Promise<T> {
    try {
      const initialResponse = await fetch(`${this.apiBaseUrl}/agent/${agentSlug}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
        }),
      });

      if (!initialResponse.ok && initialResponse.status !== 402) {
        throw new Error(`Unexpected status code: ${initialResponse.status}`);
      }

      const paymentDetail = await initialResponse.json();
      if (!paymentDetail){
        throw new Error('Payment detail not found in response.');
      }
      
      const txId = paymentDetail.transactionId;
      const amountPayment = paymentDetail.amount;
      const receiverAddress = paymentDetail.receiverAddress;

      const amount = ethers.parseUnits(amountPayment.toString(), 6);

      if (!receiverAddress) {
          throw new Error('Receiver address not found in payment details.');
      }

      // Payment to escrow wallet (smart contract call)
      // Approve MUSD
      const musdContract = new ethers.Contract(MUSD_ADDRESS, ERC20_ABI, this.wallet);
      console.log(`Approving MUSD spending for ${receiverAddress}...`);
      const approveTx = await musdContract.approve(receiverAddress, amount);
      await approveTx.wait(1);

      //Create Transaction on Escrow
      console.log(`Initiating Expect Payment to creator ${receiverAddress} (${amount} wei)`);
      const txResponse = await musdContract.transfer(receiverAddress, amount);
      
      console.log(`Payment sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);

      if (!receipt || receipt.status !== 1) {
          throw new Error('Payment transaction failed.');
      }

      // Retry with txHash
      const finalTxHash = receipt.hash;
      const headers = {
        'Content-Type': 'application/json',
        'x-payment-tx': finalTxHash,
      };

      console.log(`Retry with txHash: ${finalTxHash}`);

      const retryResponse = await fetch(`${this.apiBaseUrl}/agent/${agentSlug}/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message: message,
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
   * Get AI response
   * 
   * @param agentSlug
   * @returns
   */
  async generateAIResponseEscrow<T = any>(agentSlug: string, message: string): Promise<T> {
    try {
      const initialResponse = await fetch(`${this.apiBaseUrl}/agent/escrow/${agentSlug}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
        }),
      });

      if (!initialResponse.ok && initialResponse.status !== 402) {
        throw new Error(`Unexpected status code: ${initialResponse.status}`);
      }

      const paymentDetail = await initialResponse.json();
      if (!paymentDetail){
        throw new Error('Payment detail not found in response.');
      }
      
      const txId = paymentDetail.transactionId;
      const escrowAddress = paymentDetail.escrowAddress;
      const amountPayment = paymentDetail.amount;
      const receiverAddress = paymentDetail.receiverAddress;

      const amount = ethers.parseUnits(amountPayment.toString(), 6);

      if (!receiverAddress) {
          throw new Error('Receiver address not found in payment details.');
      }

      // Payment to escrow wallet (smart contract call)
      // Approve MUSD
      const musdContract = new ethers.Contract(MUSD_ADDRESS, ERC20_ABI, this.wallet);
      console.log(`Approving MUSD spending for ${escrowAddress}...`);
      const approveTx = await musdContract.approve(escrowAddress, amount);
      await approveTx.wait(1);

      //Create Transaction on Escrow
      console.log(`Initiating Expect Payment to ${escrowAddress} for creator ${receiverAddress} (${amount} wei)`);
      const contract = new ethers.Contract(escrowAddress, ESCROW_ABI, this.wallet);
      
      // Note: We are using MUSD now, so we generally do NOT send native value (msg.value) 
      // unless the contract specifically requires both. Assuming standard ERC20 payment:
      const txResponse = await contract.createTx(
          txId, 
          receiverAddress, 
          amount
      );
      
      console.log(`Escrow payment sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);

      if (!receipt || receipt.status !== 1) {
          throw new Error('Escrow transaction failed.');
      }

      // Retry with txHash
      const finalTxHash = receipt.hash;
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-payment-tx': finalTxHash,
      };

      console.log(`Retry with txHash: ${finalTxHash}`);

      const retryResponse = await fetch(`${this.apiBaseUrl}/agent/escrow/${agentSlug}/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message: message,
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
      let initialResponse;

      try{
        initialResponse = await fetch(`${this.apiBaseUrl}/${gatewaySlug}`);
      } catch (e){
        throw new Error(`Initial Endpoint Failed: ${e}`);
      }
      
      // If success immediately (no payment required), return data
      if (initialResponse.ok) {
        return await initialResponse.json();
      }

      if (initialResponse.status !== 402) {
          throw new Error(`Unexpected status code: ${initialResponse.status}`);
      }

      const paymentDetail = await initialResponse.json();

      if (!paymentDetail) {
        throw new Error('Payment Detail not found.');
      }

      console.log('Payment Detail:', paymentDetail);
    
      const amountPayment = paymentDetail.amount;
      const receiverAddress = paymentDetail.receiverAddress;

      const amount = ethers.parseUnits(amountPayment.toString(), 6);


      if (!receiverAddress) {
          throw new Error('Receiver address not found in payment details.');
      }

      // Payment to receiver
      // Approve MUSD
      const musdContract = new ethers.Contract(MUSD_ADDRESS, ERC20_ABI, this.wallet);
      // console.log(`Approving MUSD spending for ${receiverAddress}`);
      // const approveTx = await musdContract.approve(receiverAddress, amount);
      // await approveTx.wait(1);

      //Create Transaction on receiver
      console.log(`Initiating Expect Payment to ${receiverAddress} (${amount} wei)`);
      const txResponse = await musdContract.transfer(receiverAddress, amount);
      
      console.log(`Payment sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);

      if (!receipt || receipt.status !== 1) {
          throw new Error('Payment transaction failed.');
      }

      // Retry with txHash
      const finalTxHash = receipt.hash;
      const headers = {
        'x-payment-tx': finalTxHash,
      };

      console.log("view header: ", headers)

      const retryResponse = await fetch(`${this.apiBaseUrl}/${gatewaySlug}`, {
          method: 'GET',
          headers: headers
      });

      if (!retryResponse.ok) {
           const errorText = await retryResponse.text();
           throw new Error(`Retry failed: ${retryResponse.status} - ${errorText}`);
      }

      return await retryResponse.json();

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error : 'Unknown error in getProxyEndpoint';
        throw new Error(`Proxy Endpoint Failed: ${errorMessage}`);
    }
  }

  /**
   * Get proxy endpoint escrow
   * 
   * @param gatewaySlug 
   * @returns 
   */
  async getProxyEndpointEscrow<T = any>(gatewaySlug: string): Promise<T> {
    try {
      // Get payment details
      let initialResponse;

      try{
        initialResponse = await fetch(`${this.apiBaseUrl}/escrow/${gatewaySlug}`);
      } catch (e){
        throw new Error(`Initial Endpoint Failed: ${e}`);
      }
      
      // If success immediately (no payment required), return data
      if (initialResponse.ok) {
        return await initialResponse.json();
      }

      if (initialResponse.status !== 402) {
          throw new Error(`Unexpected status code: ${initialResponse.status}`);
      }

      const paymentDetail = await initialResponse.json();

      if (!paymentDetail) {
        throw new Error('Payment Detail not found.');
      }

      console.log('Payment Detail:', paymentDetail);
      
      const txId = paymentDetail.transactionId;
      const escrowAddress = paymentDetail.escrowAddress;
      const amountPayment = paymentDetail.amount;
      const receiverAddress = paymentDetail.receiverAddress;

      const amount = ethers.parseUnits(amountPayment.toString(), 6);


      if (!receiverAddress) {
          throw new Error('Receiver address not found in payment details.');
      }

      // Payment to escrow wallet (smart contract call)
      // Approve MUSD
      const musdContract = new ethers.Contract(MUSD_ADDRESS, ERC20_ABI, this.wallet);
      console.log(`Approving MUSD spending for ${escrowAddress}`);
      const approveTx = await musdContract.approve(escrowAddress, amount);
      await approveTx.wait(1);

      //Create Transaction on Escrow
      console.log(`Initiating Expect Payment to ${escrowAddress} for creator ${receiverAddress} (${amount} wei)`);
      const contract = new ethers.Contract(escrowAddress, ESCROW_ABI, this.wallet);
      
      // Note: We are using MUSD now, so we generally do NOT send native value (msg.value) 
      // unless the contract specifically requires both. Assuming standard ERC20 payment:
      const txResponse = await contract.createTx(
          txId, 
          receiverAddress, 
          amount
      );
      
      console.log(`Escrow payment sent: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);

      if (!receipt || receipt.status !== 1) {
          throw new Error('Escrow transaction failed.');
      }

      // Retry with txHash
      const finalTxHash = receipt.hash;
      const headers = {
        'x-payment-tx': finalTxHash,
      };

      console.log("view header: ", headers)

      const retryResponse = await fetch(`${this.apiBaseUrl}/escrow/${gatewaySlug}`, {
          method: 'GET',
          headers: headers
      });

      if (!retryResponse.ok) {
           const errorText = await retryResponse.text();
           throw new Error(`Retry failed: ${retryResponse.status} - ${errorText}`);
      }

      return await retryResponse.json();

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error : 'Unknown error in getProxyEndpoint';
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
