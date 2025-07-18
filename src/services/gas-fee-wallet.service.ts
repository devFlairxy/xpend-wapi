import { ethers } from 'ethers';
import { config } from '../config';
import { SecureStorageService } from './secure-storage.service';

export interface GasFeeWalletInfo {
  network: string;
  address: string;
  privateKey: string;
  balance: string;
  isAvailable: boolean;
}

export class GasFeeWalletService {
  private static instance: GasFeeWalletService;
  private secureStorage: SecureStorageService;

  private constructor() {
    this.secureStorage = SecureStorageService.getInstance();
  }

  public static getInstance(): GasFeeWalletService {
    if (!GasFeeWalletService.instance) {
      GasFeeWalletService.instance = new GasFeeWalletService();
    }
    return GasFeeWalletService.instance;
  }

  /**
   * Get gas fee wallet for a specific network
   */
  public async getGasFeeWallet(network: string): Promise<GasFeeWalletInfo> {
    try {
      const walletAddress = config.blockchain.gasFeeWallets[network as keyof typeof config.blockchain.gasFeeWallets];
      const encryptedPrivateKey = config.blockchain.gasFeeWalletKeys[network as keyof typeof config.blockchain.gasFeeWalletKeys];

      if (!walletAddress || !encryptedPrivateKey) {
        throw new Error(`Gas fee wallet not configured for network: ${network}`);
      }

      // Decrypt private key
      const privateKey = this.secureStorage.decryptPrivateKey(encryptedPrivateKey, `gas-fee-${network}`);

      // Get current balance
      const balance = await this.getWalletBalance(network, walletAddress);

      return {
        network,
        address: walletAddress,
        privateKey,
        balance,
        isAvailable: parseFloat(balance) > 0,
      };
    } catch (error) {
      throw new Error(`Failed to get gas fee wallet for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get wallet balance for native token (ETH, BNB, MATIC, etc.)
   */
  private async getWalletBalance(network: string, address: string): Promise<string> {
    try {
      switch (network) {
        case 'ethereum':
        case 'bsc':
        case 'polygon':
        case 'busd':
          return await this.getEVMBalance(network, address);
        case 'solana':
          return await this.getSolanaBalance(address);
        case 'tron':
          return await this.getTronBalance(address);
        default:
          throw new Error(`Unsupported network: ${network}`);
      }
    } catch (error) {
      console.error(`Error getting balance for ${network} wallet ${address}:`, error);
      return '0';
    }
  }

  /**
   * Get EVM chain balance (Ethereum, BSC, Polygon, BUSD)
   */
  private async getEVMBalance(network: string, address: string): Promise<string> {
    try {
      const networkConfig = config.chains[network as keyof typeof config.chains];
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const balance = await provider.getBalance(address);
      
      return ethers.formatEther(balance);
    } catch (error) {
      throw new Error(`Failed to get ${network} balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Solana balance
   */
  private async getSolanaBalance(address: string): Promise<string> {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const connection = new Connection(config.chains.solana.rpcUrl);
      const publicKey = new PublicKey(address);
      const balance = await connection.getBalance(publicKey);
      
      // Convert lamports to SOL (1 SOL = 1e9 lamports)
      return (balance / 1e9).toString();
    } catch (error) {
      throw new Error(`Failed to get Solana balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Tron balance
   */
  private async getTronBalance(address: string): Promise<string> {
    try {
      const TronWeb = (await import('tronweb')).default;
      const TronWebConstructor = (TronWeb as any).TronWeb || (TronWeb as any).default.TronWeb;
      const tronWeb = new TronWebConstructor(
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        '01' // Dummy private key for read-only operations
      );
      
      const balance = await tronWeb.trx.getBalance(address);
      
      // Convert sun to TRX (1 TRX = 1e6 sun)
      return (balance / 1e6).toString();
    } catch (error) {
      throw new Error(`Failed to get Tron balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate gas fee wallet has sufficient balance
   */
  public async validateGasFeeWalletBalance(
    network: string,
    requiredAmount: string
  ): Promise<{
    hasSufficientBalance: boolean;
    currentBalance: string;
    requiredBalance: string;
    deficit: string;
  }> {
    try {
      const walletInfo = await this.getGasFeeWallet(network);
      const currentBalance = parseFloat(walletInfo.balance);
      const requiredBalance = parseFloat(requiredAmount);
      const deficit = Math.max(0, requiredBalance - currentBalance);

      return {
        hasSufficientBalance: currentBalance >= requiredBalance,
        currentBalance: walletInfo.balance,
        requiredBalance: requiredAmount,
        deficit: deficit.toString(),
      };
    } catch (error) {
      throw new Error(`Failed to validate gas fee wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all gas fee wallet statuses
   */
  public async getAllGasFeeWalletStatuses(): Promise<GasFeeWalletInfo[]> {
    const networks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'];
    const statuses: GasFeeWalletInfo[] = [];

    for (const network of networks) {
      try {
        const status = await this.getGasFeeWallet(network);
        statuses.push(status);
      } catch (error) {
        console.error(`Failed to get status for ${network} gas fee wallet:`, error);
        // Add error status
        statuses.push({
          network,
          address: 'Not configured',
          privateKey: '',
          balance: '0',
          isAvailable: false,
        });
      }
    }

    return statuses;
  }

  /**
   * Check if gas fee wallet is configured for a network
   */
  public isGasFeeWalletConfigured(network: string): boolean {
    const walletAddress = config.blockchain.gasFeeWallets[network as keyof typeof config.blockchain.gasFeeWallets];
    const privateKey = config.blockchain.gasFeeWalletKeys[network as keyof typeof config.blockchain.gasFeeWalletKeys];
    
    return !!(walletAddress && privateKey);
  }

  /**
   * Get gas fee wallet address for a network
   */
  public getGasFeeWalletAddress(network: string): string | null {
    return config.blockchain.gasFeeWallets[network as keyof typeof config.blockchain.gasFeeWallets] || null;
  }
} 