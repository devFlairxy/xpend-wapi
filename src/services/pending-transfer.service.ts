import { PrismaClient } from '@prisma/client';

export interface PendingTransfer {
  network: string;
  count: number;
  totalAmount: string;
  userIds: string[];
  watchIds: string[];
}

export interface NetworkPendingTransfers {
  [network: string]: PendingTransfer;
}

export class PendingTransferService {
  private static instance: PendingTransferService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient();
  }

  public static getInstance(): PendingTransferService {
    if (!PendingTransferService.instance) {
      PendingTransferService.instance = new PendingTransferService();
    }
    return PendingTransferService.instance;
  }

  /**
   * Get all pending transfers that need gas fees to be processed
   */
  public async getPendingTransfers(): Promise<NetworkPendingTransfers> {
    try {
      // Get all confirmed deposits that haven't been forwarded yet
      const confirmedDeposits = await this.prisma.depositWatch.findMany({
        where: {
          status: 'CONFIRMED',
          actualAmount: { not: null },
          txHash: { not: null },
        },
        select: {
          id: true,
          userId: true,
          network: true,
          actualAmount: true,
          address: true,
          token: true,
        },
      });

      // Group by network
      const pendingTransfers: NetworkPendingTransfers = {};

      for (const deposit of confirmedDeposits) {
        if (!pendingTransfers[deposit.network]) {
          pendingTransfers[deposit.network] = {
            network: deposit.network,
            count: 0,
            totalAmount: '0',
            userIds: [],
            watchIds: [],
          };
        }

        const networkTransfer = pendingTransfers[deposit.network];
        if (networkTransfer) {
          networkTransfer.count++;
          networkTransfer.totalAmount = this.addAmounts(
            networkTransfer.totalAmount,
            deposit.actualAmount!
          );
          networkTransfer.userIds.push(deposit.userId);
          networkTransfer.watchIds.push(deposit.id);
        }
      }

      return pendingTransfers;
    } catch (error) {
      console.error('Error getting pending transfers:', error);
      return {};
    }
  }

  /**
   * Get pending transfers for a specific network
   */
  public async getPendingTransfersForNetwork(network: string): Promise<PendingTransfer | null> {
    try {
      const confirmedDeposits = await this.prisma.depositWatch.findMany({
        where: {
          network,
          status: 'CONFIRMED',
          actualAmount: { not: null },
          txHash: { not: null },
        },
        select: {
          id: true,
          userId: true,
          actualAmount: true,
        },
      });

      if (confirmedDeposits.length === 0) {
        return null;
      }

      const totalAmount = confirmedDeposits.reduce(
        (sum, deposit) => this.addAmounts(sum, deposit.actualAmount!),
        '0'
      );

      return {
        network,
        count: confirmedDeposits.length,
        totalAmount,
        userIds: confirmedDeposits.map(d => d.userId),
        watchIds: confirmedDeposits.map(d => d.id),
      };
    } catch (error) {
      console.error(`Error getting pending transfers for ${network}:`, error);
      return null;
    }
  }

  /**
   * Check if there are any pending transfers across all networks
   */
  public async hasPendingTransfers(): Promise<boolean> {
    try {
      const count = await this.prisma.depositWatch.count({
        where: {
          status: 'CONFIRMED',
          actualAmount: { not: null },
          txHash: { not: null },
        },
      });

      return count > 0;
    } catch (error) {
      console.error('Error checking for pending transfers:', error);
      return false;
    }
  }

  /**
   * Get summary of pending transfers
   */
  public async getPendingTransfersSummary(): Promise<{
    totalPending: number;
    networksWithPending: string[];
    totalAmount: string;
  }> {
    try {
      const pendingTransfers = await this.getPendingTransfers();
      
      const networksWithPending = Object.keys(pendingTransfers);
      const totalPending = Object.values(pendingTransfers).reduce((sum, transfer) => sum + transfer.count, 0);
      
      const totalAmount = Object.values(pendingTransfers).reduce(
        (sum, transfer) => this.addAmounts(sum, transfer.totalAmount),
        '0'
      );

      return {
        totalPending,
        networksWithPending,
        totalAmount,
      };
    } catch (error) {
      console.error('Error getting pending transfers summary:', error);
      return {
        totalPending: 0,
        networksWithPending: [],
        totalAmount: '0',
      };
    }
  }

  /**
   * Mark a deposit watch as forwarded (remove from pending)
   */
  public async markAsForwarded(watchId: string): Promise<void> {
    try {
      await this.prisma.depositWatch.update({
        where: { id: watchId },
        data: { status: 'INACTIVE' },
      });
    } catch (error) {
      console.error(`Error marking watch ${watchId} as forwarded:`, error);
    }
  }

  /**
   * Get detailed pending transfer information for alerts
   */
  public async getDetailedPendingTransfers(): Promise<Array<{
    network: string;
    count: number;
    totalAmount: string;
    token: string;
    oldestPending: Date;
    newestPending: Date;
  }>> {
    try {
      const confirmedDeposits = await this.prisma.depositWatch.findMany({
        where: {
          status: 'CONFIRMED',
          actualAmount: { not: null },
          txHash: { not: null },
        },
        select: {
          network: true,
          actualAmount: true,
          token: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by network
      const networkGroups: { [key: string]: any[] } = {};
      
      for (const deposit of confirmedDeposits) {
        if (!networkGroups[deposit.network]) {
          networkGroups[deposit.network] = [];
        }
        const networkGroup = networkGroups[deposit.network];
        if (networkGroup) {
          networkGroup.push(deposit);
        }
      }

      const detailedTransfers = [];

      for (const [network, deposits] of Object.entries(networkGroups)) {
        const totalAmount = deposits.reduce(
          (sum, deposit) => this.addAmounts(sum, deposit.actualAmount!),
          '0'
        );

        const oldestPending = deposits[0].createdAt;
        const newestPending = deposits[deposits.length - 1].updatedAt;

        detailedTransfers.push({
          network,
          count: deposits.length,
          totalAmount,
          token: deposits[0].token,
          oldestPending,
          newestPending,
        });
      }

      return detailedTransfers;
    } catch (error) {
      console.error('Error getting detailed pending transfers:', error);
      return [];
    }
  }

  /**
   * Add two amount strings (handles decimal arithmetic)
   */
  private addAmounts(amount1: string, amount2: string): string {
    try {
      const num1 = parseFloat(amount1) || 0;
      const num2 = parseFloat(amount2) || 0;
      return (num1 + num2).toFixed(6); // USDT has 6 decimals
    } catch (error) {
      console.error('Error adding amounts:', error);
      return '0';
    }
  }

  /**
   * Cleanup method
   */
  public async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
} 