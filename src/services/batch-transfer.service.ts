import { PrismaClient } from '@prisma/client';
import { ForwarderService } from './forwarder.service';
import { GasFeeService } from './gas-fee.service';
import { SlackService } from './slack.service';
import { ethers } from 'ethers';

export interface BatchTransfer {
  id: string;
  network: string;
  watchIds: string[];
  userIds: string[];
  amounts: string[];
  totalAmount: string;
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  executedAt?: Date;
  txHash?: string;
  gasUsed?: string;
  gasPrice?: string;
  error?: string;
  batchSize: number;
  estimatedGasSavings: string;
}

export interface BatchConfig {
  maxBatchSize: number;        // Maximum transfers per batch
  minBatchSize: number;        // Minimum transfers before executing
  maxWaitTime: number;         // Maximum time to wait (milliseconds)
  gasPriceThreshold: bigint;   // Execute when gas price is below this
  checkInterval: number;       // How often to check for batch execution
  enabledNetworks: string[];   // Networks to batch
  priorityNetworks: string[];  // Networks that get priority execution
  gasSavingsThreshold: number; // Minimum gas savings % to execute batch
}

export interface BatchExecutionResult {
  success: boolean;
  batchId: string;
  txHash?: string | undefined;
  gasUsed?: string | undefined;
  gasPrice?: string | undefined;
  totalAmount: string;
  batchSize: number;
  gasSavings: string;
  error?: string | undefined;
  partialSuccess?: {
    successful: number;
    failed: number;
    failedWatchIds: string[];
  };
}

export class BatchTransferService {
  private static instance: BatchTransferService;
  private prisma: PrismaClient;
  private forwarderService: ForwarderService;
  private gasFeeService: GasFeeService;
  private slackService: SlackService;
  private batchQueue: Map<string, BatchTransfer> = new Map();
  private executionInterval?: NodeJS.Timeout;
  private isExecuting: boolean = false;

  private readonly defaultConfig: BatchConfig = {
    maxBatchSize: 20,                    // 20 transfers per batch
    minBatchSize: 5,                     // Minimum 5 transfers
    maxWaitTime: 4 * 60 * 60 * 1000,    // 4 hours max wait
    gasPriceThreshold: ethers.parseUnits('25', 'gwei'), // 25 gwei threshold
    checkInterval: 5 * 60 * 1000,       // Check every 5 minutes
    enabledNetworks: ['ethereum', 'bsc', 'polygon'],
    priorityNetworks: ['ethereum'],      // Ethereum gets priority
    gasSavingsThreshold: 30,             // 30% minimum gas savings
  };

  private constructor() {
    this.prisma = new PrismaClient();
    this.forwarderService = ForwarderService.getInstance();
    this.gasFeeService = GasFeeService.getInstance();
    this.slackService = SlackService.getInstance();
  }

  public static getInstance(): BatchTransferService {
    if (!BatchTransferService.instance) {
      BatchTransferService.instance = new BatchTransferService();
    }
    return BatchTransferService.instance;
  }

  /**
   * Start batch transfer service
   */
  public async startService(customConfig?: Partial<BatchConfig>): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...customConfig };
    
    console.log('🔄 Starting Batch Transfer Service...');
    console.log(`   Max Batch Size: ${finalConfig.maxBatchSize}`);
    console.log(`   Min Batch Size: ${finalConfig.minBatchSize}`);
    console.log(`   Max Wait Time: ${finalConfig.maxWaitTime / (60 * 1000)} minutes`);
    console.log(`   Gas Price Threshold: ${ethers.formatUnits(finalConfig.gasPriceThreshold, 'gwei')} gwei`);
    console.log(`   Check Interval: ${finalConfig.checkInterval / (60 * 1000)} minutes`);
    console.log(`   Enabled Networks: ${finalConfig.enabledNetworks.join(', ')}`);

    // Clear any existing interval
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
    }

    // Initial batch check
    await this.processBatchQueue(finalConfig);

    // Set up execution interval
    this.executionInterval = setInterval(async () => {
      await this.processBatchQueue(finalConfig);
    }, finalConfig.checkInterval);

    console.log('✅ Batch Transfer Service started successfully');
  }

  /**
   * Stop batch transfer service
   */
  public stopService(): void {
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = undefined as any;
      console.log('⏹️  Batch Transfer Service stopped');
    }
  }

  /**
   * Add a confirmed deposit to the batch queue
   */
  public async addToBatchQueue(watchId: string, network: string, userId: string, amount: string): Promise<void> {
    try {
      const batchKey = `${network}-${this.getCurrentBatchPeriod()}`;
      
      if (!this.batchQueue.has(batchKey)) {
        this.batchQueue.set(batchKey, {
          id: batchKey,
          network,
          watchIds: [],
          userIds: [],
          amounts: [],
          totalAmount: '0',
          status: 'PENDING',
          createdAt: new Date(),
          batchSize: 0,
          estimatedGasSavings: '0',
        });
      }

      const batch = this.batchQueue.get(batchKey)!;
      batch.watchIds.push(watchId);
      batch.userIds.push(userId);
      batch.amounts.push(amount);
      batch.totalAmount = this.addAmounts(batch.totalAmount, amount);
      batch.batchSize = batch.watchIds.length;

      // Calculate estimated gas savings
      batch.estimatedGasSavings = this.calculateEstimatedGasSavings(batch);

      console.log(`📦 Added to batch queue: ${watchId} (${amount} USDT) - Batch: ${batchKey} (${batch.batchSize}/${this.defaultConfig.maxBatchSize})`);
    } catch (error) {
      console.error(`❌ Error adding to batch queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process the batch queue and execute batches when conditions are met
   */
  private async processBatchQueue(config: BatchConfig): Promise<void> {
    if (this.isExecuting) {
      console.log('⏳ Batch execution already in progress, skipping...');
      return;
    }

    this.isExecuting = true;

    try {
      console.log(`\n🔄 Processing batch queue at ${new Date().toISOString()}`);

      for (const [batchKey, batch] of this.batchQueue.entries()) {
        try {
          const shouldExecute = await this.shouldExecuteBatch(batch, config);
          
          if (shouldExecute) {
            console.log(`🚀 Executing batch: ${batchKey} (${batch.batchSize} transfers, ${batch.totalAmount} USDT)`);
            const result = await this.executeBatch(batch);
            
            if (result.success) {
              console.log(`✅ Batch executed successfully: ${result.txHash}`);
              await this.sendBatchSuccessNotification(result);
            } else {
              console.error(`❌ Batch execution failed: ${result.error}`);
              await this.sendBatchFailureNotification(result);
            }
            
            // Remove from queue
            this.batchQueue.delete(batchKey);
          } else {
            console.log(`⏳ Batch ${batchKey} not ready for execution (${batch.batchSize}/${config.minBatchSize} transfers)`);
          }
        } catch (error) {
          console.error(`❌ Error processing batch ${batchKey}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`   Queue processing completed. Active batches: ${this.batchQueue.size}`);
    } catch (error) {
      console.error('❌ Error in batch queue processing:', error);
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Determine if a batch should be executed
   */
  private async shouldExecuteBatch(batch: BatchTransfer, config: BatchConfig): Promise<boolean> {
    // Check if batch size is sufficient
    if (batch.batchSize < config.minBatchSize) {
      return false;
    }

    // Check if max batch size reached
    if (batch.batchSize >= config.maxBatchSize) {
      console.log(`   Batch ${batch.id} ready: Max size reached (${batch.batchSize})`);
      return true;
    }

    // Check if max wait time reached
    const timeSinceCreation = Date.now() - batch.createdAt.getTime();
    if (timeSinceCreation >= config.maxWaitTime) {
      console.log(`   Batch ${batch.id} ready: Max wait time reached (${timeSinceCreation / (60 * 1000)} minutes)`);
      return true;
    }

    // Check if gas price is low enough
    try {
      const gasPrices = await this.gasFeeService.getNetworkGasPrice(batch.network);
      const currentGasPrice = gasPrices.standard;
      
      if (currentGasPrice <= config.gasPriceThreshold) {
        console.log(`   Batch ${batch.id} ready: Low gas price (${ethers.formatUnits(currentGasPrice, 'gwei')} gwei)`);
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ Could not check gas price for ${batch.network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check if it's a priority network
    if (config.priorityNetworks.includes(batch.network)) {
      console.log(`   Batch ${batch.id} ready: Priority network (${batch.network})`);
      return true;
    }

    return false;
  }

  /**
   * Execute a batch of transfers
   */
  private async executeBatch(batch: BatchTransfer): Promise<BatchExecutionResult> {
    try {
      console.log(`🔄 Executing batch ${batch.id} with ${batch.batchSize} transfers`);

      // Get all confirmed deposits for this batch
      const confirmedDeposits = await this.prisma.depositWatch.findMany({
        where: {
          id: { in: batch.watchIds },
          status: 'CONFIRMED',
        },
        include: {
          wallet: true,
        },
      });

      if (confirmedDeposits.length === 0) {
        throw new Error('No confirmed deposits found for batch');
      }

      // For now, use a placeholder master wallet (would be configured in production)
      const masterWallet = '0x0000000000000000000000000000000000000000'; // Placeholder

      // Create batch transfer request
      const batchRequest = {
        network: batch.network,
        transfers: confirmedDeposits.map(deposit => ({
          userId: deposit.userId,
          amount: deposit.actualAmount!,
          fromWallet: deposit.address,
          privateKey: deposit.wallet.privateKey,
          toAddress: masterWallet,
        })),
        masterWallet,
      };

      // Execute batch transfer (this would need to be implemented in forwarder service)
      const result = await this.executeBatchTransfer(batchRequest);

      // Update deposit watches status
      await this.updateBatchDepositStatuses(batch.watchIds, result.success ? 'INACTIVE' : 'CONFIRMED');

      return {
        success: result.success,
        batchId: batch.id,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        gasPrice: result.gasPrice,
        totalAmount: batch.totalAmount,
        batchSize: batch.batchSize,
        gasSavings: this.calculateGasSavings(),
        error: result.error,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Batch execution error: ${errorMessage}`);
      
      return {
        success: false,
        batchId: batch.id,
        totalAmount: batch.totalAmount,
        batchSize: batch.batchSize,
        gasSavings: '0',
        error: errorMessage,
      };
    }
  }

  /**
   * Execute batch transfer (placeholder - needs implementation in forwarder)
   */
  private async executeBatchTransfer(batchRequest: any): Promise<{
    success: boolean;
    txHash?: string | undefined;
    gasUsed?: string | undefined;
    gasPrice?: string | undefined;
    error?: string | undefined;
  }> {
    // TODO: Implement actual batch transfer logic in forwarder service
    // For now, execute transfers individually as a fallback
    console.log('⚠️ Batch transfer not implemented yet, falling back to individual transfers');
    
    const results = [];
    for (const transfer of batchRequest.transfers) {
      try {
        const result = await this.forwarderService.forwardFunds({
          userId: transfer.userId,
          network: batchRequest.network,
          amount: transfer.amount,
          fromWallet: transfer.fromWallet,
          privateKey: transfer.privateKey,
          fromPrivateKey: transfer.privateKey, // Add missing field
          toAddress: transfer.toAddress,
          masterWallet: batchRequest.masterWallet,
        });
        results.push(result);
      } catch (error) {
        results.push({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    return {
      success: successful > 0,
      txHash: successful > 0 ? `batch-${Date.now()}` : undefined,
      gasUsed: '0', // Would be calculated in actual implementation
      gasPrice: '0', // Would be calculated in actual implementation
      error: failed > 0 ? `${failed} transfers failed` : undefined,
    };
  }

  /**
   * Update deposit watch statuses after batch execution
   */
  private async updateBatchDepositStatuses(watchIds: string[], status: 'INACTIVE' | 'CONFIRMED'): Promise<void> {
    try {
      await this.prisma.depositWatch.updateMany({
        where: { id: { in: watchIds } },
        data: { status },
      });
    } catch (error) {
      console.error(`❌ Error updating batch deposit statuses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send batch success notification
   */
  private async sendBatchSuccessNotification(result: BatchExecutionResult): Promise<void> {
    try {
      const message = {
        channel: '#batch-transfers',
        text: `✅ Batch Transfer Successful - ${result.batchSize} transfers`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `✅ Batch Transfer Successful`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Batch ID:* ${result.batchId}\n*Tx Hash:* ${result.txHash || 'N/A'}`
              },
              {
                type: 'mrkdwn',
                text: `*Transfers:* ${result.batchSize}\n*Total Amount:* ${result.totalAmount} USDT`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Gas Used:* ${result.gasUsed || 'N/A'}\n*Gas Price:* ${result.gasPrice || 'N/A'}`
              },
              {
                type: 'mrkdwn',
                text: `*Gas Savings:* ${result.gasSavings}\n*Status:* Completed`
              }
            ]
          }
        ]
      };

      await this.slackService.sendMessage(message);
    } catch (error) {
      console.error('❌ Error sending batch success notification:', error);
    }
  }

  /**
   * Send batch failure notification
   */
  private async sendBatchFailureNotification(result: BatchExecutionResult): Promise<void> {
    try {
      const message = {
        channel: '#batch-transfers',
        text: `❌ Batch Transfer Failed - ${result.batchSize} transfers`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `❌ Batch Transfer Failed`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Batch ID:* ${result.batchId}\n*Error:* ${result.error || 'Unknown error'}`
              },
              {
                type: 'mrkdwn',
                text: `*Transfers:* ${result.batchSize}\n*Total Amount:* ${result.totalAmount} USDT`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⚠️ *Manual intervention may be required*'
            }
          }
        ]
      };

      await this.slackService.sendMessage(message);
    } catch (error) {
      console.error('❌ Error sending batch failure notification:', error);
    }
  }

  /**
   * Get current batch period (for grouping transfers)
   */
  private getCurrentBatchPeriod(): string {
    const now = new Date();
    const hour = Math.floor(now.getHours() / 2) * 2; // Group by 2-hour periods
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(hour).padStart(2, '0')}`;
  }

  /**
   * Calculate estimated gas savings for a batch
   */
  private calculateEstimatedGasSavings(batch: BatchTransfer): string {
    // Rough estimation: 50% gas savings for batches vs individual transfers
    const individualGasCost = batch.batchSize * 0.002; // 0.002 ETH per transfer
    const batchGasCost = individualGasCost * 0.5; // 50% savings
    const savings = individualGasCost - batchGasCost;
    return savings.toFixed(4);
  }

  /**
   * Calculate actual gas savings
   */
  private calculateGasSavings(): string {
    // This would be calculated based on actual gas used vs estimated individual costs
    return '0.001'; // Placeholder
  }

  /**
   * Add two amount strings
   */
  private addAmounts(amount1: string, amount2: string): string {
    try {
      const num1 = parseFloat(amount1) || 0;
      const num2 = parseFloat(amount2) || 0;
      return (num1 + num2).toFixed(6);
    } catch (error) {
      console.error('Error adding amounts:', error);
      return '0';
    }
  }

  /**
   * Get batch queue status
   */
  public getBatchQueueStatus(): {
    totalBatches: number;
    totalTransfers: number;
    totalAmount: string;
    networks: string[];
  } {
    let totalTransfers = 0;
    let totalAmount = '0';
    const networks = new Set<string>();

    for (const batch of this.batchQueue.values()) {
      totalTransfers += batch.batchSize;
      totalAmount = this.addAmounts(totalAmount, batch.totalAmount);
      networks.add(batch.network);
    }

    return {
      totalBatches: this.batchQueue.size,
      totalTransfers,
      totalAmount,
      networks: Array.from(networks),
    };
  }

  /**
   * Manual batch execution (for testing/admin)
   */
  public async executeBatchManually(batchId: string): Promise<BatchExecutionResult> {
    const batch = this.batchQueue.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found in queue`);
    }

    return this.executeBatch(batch);
  }

  /**
   * Cleanup method
   */
  public async cleanup(): Promise<void> {
    this.stopService();
    await this.prisma.$disconnect();
  }
} 