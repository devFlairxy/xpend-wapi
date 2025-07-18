export interface WalletGenerationRequest {
  userId: string;
  network: SupportedNetwork;
}

export interface WalletGenerationResponse {
  network: SupportedNetwork;
  address: string;
  qrCode?: string;
}

// Add new types for network-specific requests
export type SupportedNetwork = 'ethereum' | 'bsc' | 'polygon' | 'solana' | 'tron' | 'busd';

export interface NetworkWalletRequest {
  userId: string;
  network: SupportedNetwork;
}

export interface NetworkWalletResponse {
  network: SupportedNetwork;
  address: string;
  qrCode?: string;
}

export interface WalletInfo {
  id: string;
  userId: string;
  network: SupportedNetwork;
  address: string;
  privateKey: string;
  derivationPath: string;
  qrCode?: string; // Base64 encoded QR code
  isUsed?: boolean; // Track if wallet has been used for deposits
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ChainConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  usdtContract: string;
}

export interface DepositWebhookPayload {
  userId: string;
  amount: string;
  currency: string;
  network: string;
  txId: string;
  wallet: string;
}

// New deposit monitoring types
export interface DepositWatchRequest {
  userId: string;
  network: SupportedNetwork;
  expectedAmount: string;
  tokenCode?: string; // Token type (USDT, BUSD, etc.) to deposit
  webhookUrl?: string;
  paymentId?: string; // Optional payment ID from credo for linking deposit to specific request
}

export interface DepositWatchResponse {
  id: string;
  userId: string;
  address: string;
  network: string;
  expectedAmount: string;
  status: 'ACTIVE' | 'CONFIRMED' | 'EXPIRED' | 'INACTIVE';
  expiresAt: string;
  confirmations: number;
  txHash?: string;
  actualAmount?: string;
}

export interface DepositMonitorWebhookPayload {
  userId: string;
  address: string;
  network: string;
  token: string; // Token type (USDT, BUSD, etc.)
  expectedAmount: string;
  actualAmount: string;
  confirmations: number;
  status: 'CONFIRMED' | 'EXPIRED';
  txHash: string | null;
  timestamp: string;
  watchId: string;
  paymentId?: string; // Payment ID from credo for linking deposit to specific request
}

export type WatchStatus = 'ACTIVE' | 'CONFIRMED' | 'EXPIRED' | 'INACTIVE';

export interface DepositInfo {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  network: string;
  txId: string;
  wallet: string;
  confirmations: number;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  webhookSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ForwardRequest {
  network: string;
  amount: string;
  privateKey: string;
  fromPrivateKey: string;
  toAddress: string;
  masterWallet: string;
  userId?: string;
  fromWallet?: string;
}

export interface ForwardResult {
  success: boolean;
  txHash?: string;
  error?: string;
  retries?: number;
  network?: string;
  amount?: string;
  gasUsed?: string;
}

export class WalletGenerationError extends Error {
  public code: string;
  public chain: string | undefined;

  constructor(message: string, chain?: string) {
    super(message);
    this.name = 'WalletGenerationError';
    this.code = 'WALLET_GENERATION_ERROR';
    this.chain = chain;
  }
} 