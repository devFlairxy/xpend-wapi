import { PrismaClient } from '@prisma/client';
import { WalletInfo, DepositInfo } from '../types';
import { SecureStorageService } from './secure-storage.service';

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private secureStorage: SecureStorageService;

  private constructor() {
    this.prisma = new PrismaClient();
    this.secureStorage = SecureStorageService.getInstance();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Store disposable wallet in database
   */
  public async storeDisposableWallet(walletInfo: WalletInfo): Promise<void> {
    try {
      await this.prisma.disposableWallet.create({
        data: {
          userId: walletInfo.userId,
          network: walletInfo.network,
          address: walletInfo.address,
          privateKey: walletInfo.privateKey,
          derivationPath: walletInfo.derivationPath,
          qrCode: walletInfo.qrCode || null,
          status: 'UNUSED',
        },
      });
    } catch (error) {
      throw new Error(`Failed to store disposable wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get disposable wallet from database
   */
  public async getDisposableWallet(userId: string, network: string): Promise<WalletInfo | null> {
    try {
      const wallet = await this.prisma.disposableWallet.findFirst({
        where: {
          userId,
          network,
          status: 'UNUSED',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!wallet) {
        return null;
      }

      // Decrypt private key if it's encrypted
      let privateKey = wallet.privateKey;
      try {
        privateKey = this.secureStorage.decryptPrivateKey(wallet.privateKey, wallet.id);
      } catch (error) {
        privateKey = wallet.privateKey;
      }

      return {
        id: wallet.id,
        userId: wallet.userId,
        network: wallet.network as any,
        address: wallet.address,
        privateKey: privateKey,
        derivationPath: wallet.derivationPath,
        qrCode: wallet.qrCode || '',
        status: wallet.status,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      };
    } catch (error) {
      throw new Error(`Failed to get disposable wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark wallet as pending when deposit is detected
   */
  public async markWalletAsPending(walletId: string): Promise<void> {
    try {
      await this.prisma.disposableWallet.update({
        where: { id: walletId },
        data: {
          status: 'PENDING',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      throw new Error(`Failed to mark wallet as pending: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark wallet as used after successful processing
   */
  public async markWalletAsUsed(userId: string, network: string): Promise<void> {
    try {
      const wallet = await this.prisma.disposableWallet.findFirst({
        where: {
          userId,
          network,
          status: 'PENDING',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (wallet) {
        await this.prisma.disposableWallet.update({
          where: { id: wallet.id },
          data: {
            status: 'USED',
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      throw new Error(`Failed to mark wallet as used: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark wallet as used by ID
   */
  public async markWalletAsUsedById(walletId: string): Promise<void> {
    try {
      await this.prisma.disposableWallet.update({
        where: { id: walletId },
        data: {
          status: 'USED',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      throw new Error(`Failed to mark wallet as used by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark wallet as failed
   */
  public async markWalletAsFailed(walletId: string): Promise<void> {
    try {
      await this.prisma.disposableWallet.update({
        where: { id: walletId },
        data: {
          status: 'FAILED',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      throw new Error(`Failed to mark wallet as failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get count of used wallets for a user and network
   */
  public async getUsedWalletsCount(userId: string, network: string): Promise<number> {
    try {
      const count = await this.prisma.disposableWallet.count({
        where: {
          userId,
          network,
          status: 'USED',
        },
      });
      return count;
    } catch (error) {
      throw new Error(`Failed to get used wallets count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store deposit in database
   */
  public async storeDeposit(depositData: {
    userId: string;
    walletId: string;
    amount: string;
    currency: string;
    network: string;
    txId: string;
    walletAddress: string;
  }): Promise<DepositInfo> {
    try {
      const deposit = await this.prisma.deposit.create({
        data: {
          userId: depositData.userId,
          walletId: depositData.walletId,
          amount: depositData.amount,
          currency: depositData.currency,
          network: depositData.network,
          txId: depositData.txId,
          walletAddress: depositData.walletAddress,
        },
      });

      return {
        id: deposit.id,
        userId: deposit.userId,
        amount: deposit.amount,
        currency: deposit.currency,
        network: deposit.network,
        txId: deposit.txId,
        wallet: deposit.walletAddress,
        confirmations: deposit.confirmations,
        status: deposit.status,
        webhookSent: deposit.webhookSent,
        createdAt: deposit.createdAt,
        updatedAt: deposit.updatedAt,
      };
    } catch (error) {
      throw new Error(`Failed to store deposit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update deposit confirmations and status
   */
  public async updateDepositConfirmations(
    depositId: string, 
    confirmations: number, 
    status: 'PENDING' | 'CONFIRMED' | 'FAILED'
  ): Promise<void> {
    try {
      await this.prisma.deposit.update({
        where: { id: depositId },
        data: {
          confirmations,
          status,
        },
      });
    } catch (error) {
      throw new Error(`Failed to update deposit confirmations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark deposit webhook as sent
   */
  public async markWebhookSent(depositId: string): Promise<void> {
    try {
      await this.prisma.deposit.update({
        where: { id: depositId },
        data: { webhookSent: true },
      });
    } catch (error) {
      throw new Error(`Failed to mark webhook sent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store forward transaction
   */
  public async storeForwardTransaction(data: {
    depositId: string;
    forwardTxHash: string;
    network: string;
    amount: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.forwardTransaction.create({
        data: {
          depositId: data.depositId,
          forwardTxHash: data.forwardTxHash,
          network: data.network,
          amount: data.amount,
          status: data.status,
          error: data.error || null,
        },
      });
    } catch (error) {
      throw new Error(`Failed to store forward transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get last known balance for a user and network
   */
  public async getLastKnownBalance(_userId: string, _network: string): Promise<number | null> {
    try {
      // This would typically be stored in a separate table
      // For now, return null to indicate no previous balance
      return null;
    } catch (error) {
      throw new Error(`Failed to get last known balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update last known balance for a user and network
   */
  public async updateLastKnownBalance(userId: string, network: string, balance: number): Promise<void> {
    try {
      // This would typically be stored in a separate table
      // For now, just log the update
      console.log(`Updated last known balance for user ${userId} on ${network}: ${balance}`);
    } catch (error) {
      throw new Error(`Failed to update last known balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all pending deposits
   */
  public async getPendingDeposits(): Promise<DepositInfo[]> {
    try {
      const deposits = await this.prisma.deposit.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      return deposits.map(deposit => ({
        id: deposit.id,
        userId: deposit.userId,
        amount: deposit.amount,
        currency: deposit.currency,
        network: deposit.network,
        txId: deposit.txId,
        wallet: deposit.walletAddress,
        confirmations: deposit.confirmations,
        status: deposit.status,
        webhookSent: deposit.webhookSent,
        createdAt: deposit.createdAt,
        updatedAt: deposit.updatedAt,
      }));
    } catch (error) {
      throw new Error(`Failed to get pending deposits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all disposable wallets for deposit monitoring
   */
  public async getAllDisposableWallets(): Promise<{ userId: string; network: string; address: string }[]> {
    try {
      const wallets = await this.prisma.disposableWallet.findMany({
        select: {
          userId: true,
          network: true,
          address: true,
        },
      });

      return wallets;
    } catch (error) {
      throw new Error(`Failed to get all disposable wallets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all wallets for a specific network
   */
  public async getWalletsByNetwork(network: string): Promise<Array<{ id: string; address: string; privateKey: string }>> {
    try {
      const wallets = await this.prisma.disposableWallet.findMany({
        where: { network },
        select: {
          id: true,
          address: true,
          privateKey: true,
        },
      });
      return wallets;
    } catch (error) {
      throw new Error(`Failed to get wallets for network ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a wallet address already exists
   */
  public async walletAddressExists(address: string): Promise<boolean> {
    const count = await this.prisma.disposableWallet.count({
      where: { address },
    });
    return count > 0;
  }

  /**
   * Check if wallet has any existing deposits
   */
  public async checkWalletDepositHistory(address: string): Promise<boolean> {
    try {
      const depositCount = await this.prisma.deposit.count({
        where: {
          walletAddress: address,
          status: {
            in: ['CONFIRMED', 'PENDING']
          }
        }
      });
      return depositCount > 0;
    } catch (error) {
      throw new Error(`Failed to check wallet deposit history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get wallet by address
   */
  public async getWalletByAddress(address: string): Promise<WalletInfo | null> {
    try {
      const wallet = await this.prisma.disposableWallet.findUnique({
        where: { address },
      });

      if (!wallet) {
        return null;
      }

      // Decrypt private key if it's encrypted
      let privateKey = wallet.privateKey;
      try {
        privateKey = this.secureStorage.decryptPrivateKey(wallet.privateKey, wallet.id);
      } catch (error) {
        privateKey = wallet.privateKey;
      }

      return {
        id: wallet.id,
        userId: wallet.userId,
        network: wallet.network as any,
        address: wallet.address,
        privateKey: privateKey,
        derivationPath: wallet.derivationPath,
        qrCode: wallet.qrCode || '',
        status: wallet.status,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      };
    } catch (error) {
      throw new Error(`Failed to get wallet by address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close database connection
   */
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
} 