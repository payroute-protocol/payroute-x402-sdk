import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentService } from '../src/PaymentService';
import { ethers } from 'ethers';

// Mock ethers
vi.mock('ethers', () => {
  const mockWait = vi.fn().mockResolvedValue({ status: 1, hash: '0xTxHash' });
  const mockSendTransaction = vi.fn().mockResolvedValue({
    wait: mockWait,
    hash: '0xTxHash'
  });
  
  const mockApprove = vi.fn().mockResolvedValue({
      wait: mockWait,
      hash: '0xApproveHash'
  });
  
  const mockCreateTx = vi.fn().mockResolvedValue({
      wait: mockWait,
      hash: '0xCreateTxHash'
  });

  const MockContract = vi.fn();
  MockContract.prototype.approve = mockApprove;
  MockContract.prototype.createTx = mockCreateTx;

  const MockWallet = vi.fn();
  MockWallet.prototype.address = '0xWalletAddress';
  MockWallet.prototype.sendTransaction = mockSendTransaction;
  MockWallet.prototype.connect = vi.fn().mockReturnThis();

  const MockJsonRpcProvider = vi.fn();
  MockJsonRpcProvider.prototype.getNetwork = vi.fn();

  return {
    ethers: {
        Wallet: MockWallet,
        JsonRpcProvider: MockJsonRpcProvider,
        Contract: MockContract,
        isAddress: (addr: string) => addr.startsWith('0x') && addr.length === 42,
    }
  };
});

// Mock fetch
const globalFetch = global.fetch;
const mockFetch = vi.fn();

describe('PaymentService', () => {
  let service: PaymentService;
  const mockPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';

  beforeEach(() => {
    global.fetch = mockFetch;
    service = new PaymentService({ privateKey: mockPrivateKey, network: 'localhost' });
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = globalFetch;
  });

  it('should initialize correctly', () => {
    expect(service).toBeDefined();
    expect(service.getAddress()).toBe('0xWalletAddress');
  });

  describe('payAndRetry', () => {
    it('should pay and retry successfully', async () => {
      const mockRetry = vi.fn().mockResolvedValue({ success: true });
      const paymentData = {
        amount: '1000',
        recipient: '0xRecipientAddress000000000000000000000000'
      };

      const result = await service.payAndRetry({
        paymentData,
        retryRequest: mockRetry
      });

      expect(mockRetry).toHaveBeenCalledWith(expect.objectContaining({
        'X-Payment-Tx': '0xTxHash'
      }));
      expect(result).toEqual({ success: true });
    });
  });

  describe('getProxyEndpoint', () => {
    it('should handle 402, pay escrow, and retry', async () => {
      const mockPaymentDetails = {
        transactionId: "tx-123",
        escrowAddress: "0xEscrowCreator",
        amountPayment: "5000000",
        contractAddress: "0xEscrowContract000000000000000000000000"
      };

      // Mock sequence of fetch responses
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 402,
          json: async () => mockPaymentDetails
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "Protected Content" })
        });

      const result = await service.getProxyEndpoint('some-gateway');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/some-gateway'));
      
      // Verify second call has payment headers
      expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/some-gateway'), expect.objectContaining({
        headers: expect.objectContaining({
          'x-payment-tx': '0xTxHash' // Note: Contract mocks return mockWait which returns '0xTxHash'
        })
      }));

      expect(result).toEqual({ data: "Protected Content" });
    });
  });

  describe('generateAIResponse', () => {
    it('should handle 402, pay escrow, and retry', async () => {
        const mockPaymentDetails = {
          transactionId: "tx-ai-123",
          escrowAddress: "0xEscrowCreator",
          amountPayment: "10000000",
          contractAddress: "0xEscrowContract000000000000000000000000"
        };
  
        // Mock sequence of fetch responses
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 402,
            json: async () => mockPaymentDetails
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ reply: "AI Response" })
          });
  
        const result = await service.generateAIResponse('agent-slug', 'Hello');
  
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/agent/agent-slug/chat'), expect.anything());
        
        // Verify second call has payment headers
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
            headers: expect.objectContaining({
                'x-payment-tx': '0xTxHash'
            })
        }));
  
        expect(result).toEqual({ reply: "AI Response" });
      });
  });
});
