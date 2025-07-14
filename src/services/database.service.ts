import { PrismaClient } from '@prisma/client';
import { UserWallets, DepositInfo } from '../types';

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Store user wallets in database
   */
  public async storeUserWallets(userWallets: UserWallets): Promise<void> {
    try {
      await this.prisma.userWallet.create({
        data: {
          userId: userWallets.userId,
          ethereumAddress: userWallets.ethereum.address,
          ethereumPrivateKey: userWallets.ethereum.privateKey,
          ethereumDerivationPath: userWallets.ethereum.derivationPath,
          ethereumQrCode: userWallets.ethereum.qrCode || null,
          
          bscAddress: userWallets.bsc.address,
          bscPrivateKey: userWallets.bsc.privateKey,
          bscDerivationPath: userWallets.bsc.derivationPath,
          bscQrCode: userWallets.bsc.qrCode || null,
          
          polygonAddress: userWallets.polygon.address,
          polygonPrivateKey: userWallets.polygon.privateKey,
          polygonDerivationPath: userWallets.polygon.derivationPath,
          polygonQrCode: userWallets.polygon.qrCode || null,
          
          solanaAddress: userWallets.solana.address,
          solanaPrivateKey: userWallets.solana.privateKey,
          solanaDerivationPath: userWallets.solana.derivationPath,
          solanaQrCode: userWallets.solana.qrCode || null,
          
          tonAddress: userWallets.ton.address,
          tonPrivateKey: userWallets.ton.privateKey,
          tonDerivationPath: userWallets.ton.derivationPath,
          tonQrCode: userWallets.ton.qrCode || null,
        },
      });
    } catch (error) {
      throw new Error(`Failed to store user wallets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user wallets from database
   */
  public async getUserWallets(userId: string): Promise<UserWallets | null> {
    try {
      const userWallet = await this.prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!userWallet) {
        return null;
      }

      return {
        userId: userWallet.userId,
        ethereum: {
          address: userWallet.ethereumAddress,
          privateKey: userWallet.ethereumPrivateKey,
          derivationPath: userWallet.ethereumDerivationPath,
          qrCode: userWallet.ethereumQrCode || '',
        },
        bsc: {
          address: userWallet.bscAddress,
          privateKey: userWallet.bscPrivateKey,
          derivationPath: userWallet.bscDerivationPath,
          qrCode: userWallet.bscQrCode || '',
        },
        polygon: {
          address: userWallet.polygonAddress,
          privateKey: userWallet.polygonPrivateKey,
          derivationPath: userWallet.polygonDerivationPath,
          qrCode: userWallet.polygonQrCode || '',
        },
        solana: {
          address: userWallet.solanaAddress,
          privateKey: userWallet.solanaPrivateKey,
          derivationPath: userWallet.solanaDerivationPath,
          qrCode: userWallet.solanaQrCode || '',
        },
        ton: {
          address: userWallet.tonAddress,
          privateKey: userWallet.tonPrivateKey,
          derivationPath: userWallet.tonDerivationPath,
          qrCode: userWallet.tonQrCode || '',
        },
        createdAt: userWallet.createdAt,
        updatedAt: userWallet.updatedAt,
      };
    } catch (error) {
      throw new Error(`Failed to get user wallets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store deposit in database
   */
  public async storeDeposit(depositData: {
    userId: string;
    userWalletId: string;
    amount: string;
    currency: string;
    network: string;
    txId: string;
    wallet: string;
  }): Promise<DepositInfo> {
    try {
      const deposit = await this.prisma.deposit.create({
        data: {
          userId: depositData.userId,
          userWalletId: depositData.userWalletId,
          amount: depositData.amount,
          currency: depositData.currency,
          network: depositData.network,
          txId: depositData.txId,
          wallet: depositData.wallet,
        },
      });

      return {
        id: deposit.id,
        userId: deposit.userId,
        amount: deposit.amount,
        currency: deposit.currency,
        network: deposit.network,
        txId: deposit.txId,
        wallet: deposit.wallet,
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
        wallet: deposit.wallet,
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
   * Get all user wallets for deposit monitoring
   */
  public async getAllUserWallets(): Promise<{ userId: string; wallets: { [key: string]: string } }[]> {
    try {
      const userWallets = await this.prisma.userWallet.findMany({
        select: {
          userId: true,
          ethereumAddress: true,
          bscAddress: true,
          polygonAddress: true,
          solanaAddress: true,
          tonAddress: true,
        },
      });

      return userWallets.map(wallet => ({
        userId: wallet.userId,
        wallets: {
          ethereum: wallet.ethereumAddress,
          bsc: wallet.bscAddress,
          polygon: wallet.polygonAddress,
          solana: wallet.solanaAddress,
          ton: wallet.tonAddress,
        },
      }));
    } catch (error) {
      throw new Error(`Failed to get all user wallets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close database connection
   */
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
} 