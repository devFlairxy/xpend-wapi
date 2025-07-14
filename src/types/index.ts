export interface WalletGenerationRequest {
  userId: string;
}

export interface WalletGenerationResponse {
  ethereum: string;
  bsc: string;
  polygon: string;
  solana: string;
  ton: string;
}

export interface WalletInfo {
  address: string;
  privateKey: string;
  derivationPath: string;
  qrCode?: string; // Base64 encoded QR code
}

export interface UserWallets {
  userId: string;
  ethereum: WalletInfo;
  bsc: WalletInfo;
  polygon: WalletInfo;
  solana: WalletInfo;
  ton: WalletInfo;
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