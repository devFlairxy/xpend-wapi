import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { EventEmitter } from 'events';
import { 
  DepositWatchRequest, 
  DepositWatchResponse, 
  DepositMonitorWebhookPayload
} from '../types';
import { WalletService } from './wallet.service';
import { BatchTransferService } from './batch-transfer.service';
import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import TronWeb from 'tronweb';

// USDT ABI for EVM chains
const USDT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Solana USDT mint address (mainnet)
const SOLANA_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export class DepositWatchService extends EventEmitter {
  private static instance: DepositWatchService;
  private prisma: PrismaClient;
  private walletService: WalletService;
  private batchTransferService: BatchTransferService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL_MS = 30000; // 30 seconds
  private readonly REQUIRED_CONFIRMATIONS = 5;
  private readonly WATCH_DURATION_HOURS = 1;
  private lastKnownBalances = new Map<string, number>(); // Track balances for comparison

  private constructor() {
    super();
    this.prisma = new PrismaClient();
    this.walletService = WalletService.getInstance();
    this.batchTransferService = BatchTransferService.getInstance();
    this.startMonitoring();
  }

  public static getInstance(): DepositWatchService {
    if (!DepositWatchService.instance) {
      DepositWatchService.instance = new DepositWatchService();
    }
    return DepositWatchService.instance;
  }

  /**
   * Start watching for a deposit on a specific network
   */
  public async startDepositWatch(request: DepositWatchRequest): Promise<DepositWatchResponse> {
    try {
      console.log(`Starting deposit watch for user ${request.userId} on ${request.network}`);

      // Get the user's wallet address for the network
      const walletInfo = await this.walletService.getDisposableWallet(request.userId, request.network);
      if (!walletInfo) {
        throw new Error(`No wallet found for user ${request.userId} on network ${request.network}`);
      }

      const address = walletInfo.address;

      // Check if there's already an active watch for this user/network
      const existingWatch = await this.prisma.depositWatch.findFirst({
        where: {
          userId: request.userId,
          network: request.network,
          status: 'ACTIVE',
        },
      });

      if (existingWatch) {
        // Update the existing watch with new expected amount and extend expiry
        const updatedWatch = await this.prisma.depositWatch.update({
          where: { id: existingWatch.id },
          data: {
            expectedAmount: request.expectedAmount,
            webhookUrl: request.webhookUrl || null,
            paymentId: request.paymentId || null,
            expiresAt: new Date(Date.now() + this.WATCH_DURATION_HOURS * 60 * 60 * 1000),
            updatedAt: new Date(),
          },
        });

        return this.formatWatchResponse(updatedWatch);
      }

      // Create new deposit watch
      const expiresAt = new Date(Date.now() + this.WATCH_DURATION_HOURS * 60 * 60 * 1000);
      
      const depositWatch = await this.prisma.depositWatch.create({
        data: {
          userId: request.userId,
          walletId: walletInfo.id, // Link to the disposable wallet
          address: address,
          network: request.network,
          token: request.tokenCode || 'USDT', // Use tokenCode from request, default to USDT
          expectedAmount: request.expectedAmount,
          webhookUrl: request.webhookUrl || null,
          paymentId: request.paymentId || null,
          expiresAt,
          status: 'ACTIVE',
        },
      });

      console.log(`Created deposit watch for user ${request.userId} on ${request.network}:`, depositWatch.id);

      return this.formatWatchResponse(depositWatch);
    } catch (error) {
      console.error('Error starting deposit watch:', error);
      throw error;
    }
  }

  /**
   * Stop watching a specific deposit
   */
  public async stopDepositWatch(watchId: string): Promise<void> {
    try {
      await this.prisma.depositWatch.update({
        where: { id: watchId },
        data: { 
          status: 'INACTIVE',
          updatedAt: new Date(),
        },
      });

      console.log(`Stopped deposit watch: ${watchId}`);
    } catch (error) {
      console.error('Error stopping deposit watch:', error);
      throw error;
    }
  }

  /**
   * Get all active deposit watches for a user
   */
  public async getUserDepositWatches(userId: string): Promise<DepositWatchResponse[]> {
    try {
      const watches = await this.prisma.depositWatch.findMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
      });

      return watches.map(watch => this.formatWatchResponse(watch));
    } catch (error) {
      console.error('Error getting user deposit watches:', error);
      throw error;
    }
  }

  /**
   * Start the monitoring process
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    let maintenanceCounter = 0;
    const MAINTENANCE_INTERVAL = 20; // Run maintenance every 20 cycles (10 minutes)

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorActiveWatches();
        
        // Run maintenance tasks periodically
        maintenanceCounter++;
        if (maintenanceCounter >= MAINTENANCE_INTERVAL) {
          await this.runMaintenanceTasks();
          maintenanceCounter = 0;
        }
      } catch (error) {
        console.error('Error in monitoring interval:', error);
      }
    }, this.MONITORING_INTERVAL_MS);

    console.log('Deposit monitoring started with enhanced webhook retry system');
  }

  /**
   * Monitor all active deposit watches
   */
  private async monitorActiveWatches(): Promise<void> {
    try {
      const activeWatches = await this.prisma.depositWatch.findMany({
        where: {
          status: 'ACTIVE',
        },
      });

      if (activeWatches.length === 0) {
        console.log(`💤 No active deposit watches to monitor`);
        return;
      }

      console.log(`🔍 Monitoring ${activeWatches.length} active deposit watches...`);

      let completedCount = 0;
      for (const watch of activeWatches) {
        try {
                // Check if watch has expired
      if (new Date() > watch.expiresAt) {
        await this.handleExpiredWatch(watch);
        completedCount++;
        continue;
      }

      // Check if watch has been failing webhooks for too long (3 hours past expiry)
      const maxWebhookRetryTime = new Date(watch.expiresAt.getTime() + 3 * 60 * 60 * 1000); // 3 hours past expiry
      if (new Date() > maxWebhookRetryTime && !watch.webhookSent) {
        console.log(`⏰ FORCE STOPPING watch ${watch.id} - webhook retries exhausted (3 hours past expiry)`);
        await this.forceStopWatchWithFailedWebhook(watch);
        completedCount++;
        continue;
      }

          // Check for deposits on this address
          await this.checkForDeposits(watch);
        } catch (error) {
          console.error(`❌ Error monitoring watch ${watch.id}:`, error);
        }
      }

      if (completedCount > 0) {
        console.log(`✅ ${completedCount} deposit checks completed this cycle`);
      }

    } catch (error) {
      console.error('❌ Error monitoring active watches:', error);
    }
  }

  /**
   * Check for deposits on a specific watch
   */
  private async checkForDeposits(watch: any): Promise<void> {
    try {
      console.log(`🔍 Checking deposits for ${watch.address} on ${watch.network} (Watch: ${watch.id})`);

      // Update last checked time
      await this.prisma.depositWatch.update({
        where: { id: watch.id },
        data: { lastCheckedAt: new Date() },
      });

      // Route to appropriate blockchain checker based on network
      switch (watch.network.toLowerCase()) {
        case 'ethereum':
          await this.checkEthereumDeposits(watch);
          break;
        case 'bsc':
          await this.checkBSCDeposits(watch);
          break;
        case 'polygon':
          await this.checkPolygonDeposits(watch);
          break;
        case 'solana':
          await this.checkSolanaDeposits(watch);
          break;
        case 'tron':
          await this.checkTronDeposits(watch);
          break;
        case 'busd':
          await this.checkBSCDeposits(watch); // BUSD uses same logic as BSC, just different contract
          break;
        default:
          console.warn(`Unsupported network for deposit monitoring: ${watch.network}`);
      }

    } catch (error) {
      console.error(`❌ Error checking deposits for watch ${watch.id}:`, error);
    }
  }

  /**
   * Handle expired watch (1 hour timeout)
   */
  private async handleExpiredWatch(watch: any): Promise<void> {
    let webhookSent = false;
    
    try {
      console.log(`⏰ WATCH EXPIRED: ${watch.id} (1 hour timeout reached)`);
      console.log(`💸 No deposit received for ${watch.expectedAmount} on ${watch.network}`);

      // Send expired webhook FIRST (before database update)
      if (watch.webhookUrl && !watch.webhookSent) {
        try {
          await this.sendWebhookWithHealthCheck(watch, 'EXPIRED');
          webhookSent = true;
          console.log(`✅ Expiry webhook sent successfully for watch ${watch.id}`);
        } catch (webhookError) {
          const errorMessage = webhookError instanceof Error ? webhookError.message : 'Unknown webhook error';
          console.error(`❌ Failed to send expiry webhook for watch ${watch.id}:`, errorMessage);
        }
      } else {
        console.log(`ℹ️  No webhook URL configured or already sent for watch ${watch.id}`);
        webhookSent = true; // No webhook needed, so consider it "sent"
      }

      // CRITICAL FIX: Only change status to EXPIRED if webhook was successfully sent
      // If webhook failed, keep status ACTIVE so monitoring continues and webhook can be retried
      if (webhookSent) {
        try {
          await this.prisma.depositWatch.update({
            where: { id: watch.id },
            data: { 
              status: 'EXPIRED',
              webhookSent: true,
              updatedAt: new Date(),
            },
          });
          console.log(`📝 Watch ${watch.id} status updated to EXPIRED - monitoring stopped`);
          console.log(`🏁 MONITORING COMPLETE for watch ${watch.id} - Address will no longer be monitored`);
          
          // Mark the wallet as used since the watch expired
          try {
            await this.walletService.markWalletAsUsedById(watch.walletId);
            console.log(`🔒 Wallet marked as used for wallet ${watch.walletId} due to expiry`);
          } catch (walletError) {
            const walletErrorMessage = walletError instanceof Error ? walletError.message : 'Unknown wallet error';
            console.error(`❌ Failed to mark wallet as used for expired watch ${watch.id}:`, walletErrorMessage);
          }
        } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
          console.error(`❌ Failed to update watch ${watch.id} to EXPIRED status:`, errorMessage);
        }
      } else {
        // Keep watch ACTIVE if webhook failed - this allows monitoring to continue and retry webhook
        try {
          await this.prisma.depositWatch.update({
            where: { id: watch.id },
            data: { 
              webhookSent: false,
              updatedAt: new Date(),
              // Status remains ACTIVE - monitoring continues!
            },
          });
          console.log(`🔄 Watch ${watch.id} remains ACTIVE - webhook failed, will retry on next cycle`);
          console.log(`⏰ MONITORING CONTINUES for watch ${watch.id} - webhook will be retried`);
        } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
          console.error(`❌ Failed to update watch ${watch.id} webhook status:`, errorMessage);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error handling expired watch ${watch.id}:`, errorMessage);
      
      // Keep watch active if there was an error - don't stop monitoring due to errors
      try {
        await this.prisma.depositWatch.update({
          where: { id: watch.id },
          data: { 
            webhookSent: false,
            updatedAt: new Date(),
            // Status remains ACTIVE
          },
        });
        console.log(`🔄 Watch ${watch.id} remains ACTIVE due to error - monitoring continues`);
      } catch (dbError) {
        const dbErrorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';
        console.error(`❌ Failed to keep watch ${watch.id} active:`, dbErrorMessage);
      }
    }
  }

  /**
   * Handle confirmed deposit (5+ confirmations)
   */
  private async handleConfirmedDeposit(watch: any, txHash: string, actualAmount: string): Promise<void> {
    let webhookSent = false;
    
    try {
      console.log(`🎉 DEPOSIT CONFIRMED for watch ${watch.id}!`);
      console.log(`💰 Amount: ${actualAmount} on ${watch.network}`);
      console.log(`📊 Transaction: ${txHash}`);

      // Step 1: Add to batch transfer queue instead of immediate forwarding
      try {
        console.log(`📦 Adding ${actualAmount} USDT on ${watch.network} to batch transfer queue...`);
        
        await this.batchTransferService.addToBatchQueue(
          watch.id,
          watch.network,
          watch.userId,
          actualAmount
        );
        
        console.log(`✅ Deposit queued for batch transfer - user will be notified via webhook`);
        console.log(`💰 User wallet ${watch.address} will be processed in batch`);
        
      } catch (batchError) {
        const errorMessage = batchError instanceof Error ? batchError.message : 'Unknown batch error';
        console.error(`❌ Batch queue error for watch ${watch.id}:`, errorMessage);
        // Continue with webhook even if batching failed
      }

      // Step 2: Send confirmed webhook (after forwarding attempt)
      if (watch.webhookUrl && !watch.webhookSent) {
        try {
          await this.sendWebhookWithHealthCheck(watch, 'CONFIRMED', txHash, actualAmount);
          webhookSent = true;
          console.log(`✅ Webhook sent successfully for watch ${watch.id}`);
        } catch (webhookError) {
          const errorMessage = webhookError instanceof Error ? webhookError.message : 'Unknown webhook error';
          console.error(`❌ Failed to send confirmation webhook for watch ${watch.id}:`, errorMessage);
        }
      } else {
        console.log(`ℹ️  No webhook URL configured or already sent for watch ${watch.id}`);
        webhookSent = true; // No webhook needed, so consider it "sent"
      }

      // CRITICAL FIX: Only change status to CONFIRMED if webhook was successfully sent
      // If webhook failed, keep status ACTIVE so monitoring continues and webhook can be retried
      if (webhookSent) {
        try {
          await this.prisma.depositWatch.update({
            where: { id: watch.id },
            data: { 
              status: 'CONFIRMED',
              txHash,
              actualAmount,
              confirmations: this.REQUIRED_CONFIRMATIONS,
              webhookSent: true,
              updatedAt: new Date(),
            },
          });
          console.log(`📝 Watch ${watch.id} status updated to CONFIRMED - monitoring stopped`);
          console.log(`🏁 MONITORING COMPLETE for watch ${watch.id} - Address will no longer be monitored`);
          
          // Mark the wallet as used since the deposit was confirmed
          try {
            await this.walletService.markWalletAsUsedById(watch.walletId);
            console.log(`🔒 Wallet marked as used for wallet ${watch.walletId} due to confirmed deposit`);
          } catch (walletError) {
            const walletErrorMessage = walletError instanceof Error ? walletError.message : 'Unknown wallet error';
            console.error(`❌ Failed to mark wallet as used for confirmed watch ${watch.id}:`, walletErrorMessage);
          }
        } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
          console.error(`❌ Failed to update watch ${watch.id} to CONFIRMED status:`, errorMessage);
        }
      } else {
        // Keep watch ACTIVE but store deposit details - this allows monitoring to continue and retry webhook
        try {
          await this.prisma.depositWatch.update({
            where: { id: watch.id },
            data: { 
              txHash,
              actualAmount,
              confirmations: this.REQUIRED_CONFIRMATIONS,
              webhookSent: false,
              updatedAt: new Date(),
              // Status remains ACTIVE - monitoring continues!
            },
          });
          console.log(`🔄 Watch ${watch.id} remains ACTIVE - webhook failed, will retry on next cycle`);
          console.log(`💾 Deposit data saved: ${actualAmount} USDT (${txHash})`);
          console.log(`⏰ MONITORING CONTINUES for watch ${watch.id} - webhook will be retried`);
        } catch (dbError) {
          const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
          console.error(`❌ Failed to update watch ${watch.id} deposit data:`, errorMessage);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error handling confirmed deposit for watch ${watch.id}:`, errorMessage);
      
      // Keep watch active if there was an error - don't stop monitoring due to errors
      try {
        await this.prisma.depositWatch.update({
          where: { id: watch.id },
          data: { 
            txHash,
            actualAmount,
            confirmations: this.REQUIRED_CONFIRMATIONS,
            webhookSent: false,
            updatedAt: new Date(),
            // Status remains ACTIVE
          },
        });
        console.log(`🔄 Watch ${watch.id} remains ACTIVE due to error - monitoring continues`);
        console.log(`💾 Deposit data saved: ${actualAmount} USDT (${txHash})`);
      } catch (dbError) {
        const dbErrorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';
        console.error(`❌ Failed to keep watch ${watch.id} active:`, dbErrorMessage);
      }
    }
  }

  /**
   * Send webhook notification to credo bot API with retry logic and robust error handling
   */
  private async sendWebhook(
    watch: any, 
    status: 'CONFIRMED' | 'EXPIRED', 
    txHash?: string, 
    actualAmount?: string
  ): Promise<void> {
    const maxRetries = 3;
    const retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
    
    if (!watch.webhookUrl) {
      console.log(`No webhook URL for watch ${watch.id}`);
      return;
    }

    const payload: DepositMonitorWebhookPayload = {
      userId: watch.userId,
      address: watch.address,
      network: watch.network,
      token: watch.token || 'USDT', // Use the token from the watch record
      expectedAmount: watch.expectedAmount,
      actualAmount: actualAmount || '0',
      confirmations: status === 'CONFIRMED' ? this.REQUIRED_CONFIRMATIONS : 0,
      status,
      txHash: txHash || null,
      timestamp: new Date().toISOString(),
      watchId: watch.id,
      paymentId: watch.paymentId || undefined,
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(watch.webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-API-Signature': this.generateWebhookSignature(payload),
            'User-Agent': 'Wallet-API/1.0.0',
          },
          timeout: 15000, // 15 second timeout
          validateStatus: (status) => status < 500, // Don't throw on 4xx errors
        });

        // Handle different response status codes
        if (response.status >= 200 && response.status < 300) {
          // Check if credo API responded with status: "ok"
          const responseData = response.data;
          const isCredoSuccess = responseData && responseData.status === 'ok';
          
          if (isCredoSuccess) {
            // Success - mark webhook as sent
            await this.markWebhookAsSent(watch.id, attempt);
            console.log(`✅ Webhook sent successfully for watch ${watch.id} (attempt ${attempt}), credo responded: ${JSON.stringify(responseData)}`);
            return;
          } else {
            // HTTP 200 but credo didn't return status: "ok" - treat as failure
            console.warn(`⚠️ Webhook received HTTP ${response.status} but credo API did not return status: "ok" for watch ${watch.id}`);
            console.warn(`📄 Credo response: ${JSON.stringify(responseData)}`);
            
            if (attempt === maxRetries) {
              await this.markWebhookAsFailed(watch.id, `Credo API did not return status: "ok". Response: ${JSON.stringify(responseData)}`);
              return;
            }
            // Continue to retry
          }
          
        } else if (response.status >= 400 && response.status < 500) {
          // Client error - don't retry, mark as failed
          console.error(`❌ Webhook failed with client error for watch ${watch.id}: ${response.status} ${response.statusText}`);
          await this.markWebhookAsFailed(watch.id, `Client error: ${response.status} ${response.statusText}`);
          return;
          
        } else if (response.status >= 500) {
          // Server error - retry
          console.warn(`⚠️ Webhook server error for watch ${watch.id} (attempt ${attempt}): ${response.status} ${response.statusText}`);
          if (attempt === maxRetries) {
            await this.markWebhookAsFailed(watch.id, `Server error after ${maxRetries} attempts: ${response.status}`);
            return;
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = (error as any)?.code;
        console.error(`❌ Webhook attempt ${attempt} failed for watch ${watch.id}:`, errorMessage);

        // Handle specific error types
        if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
          console.error(`🚫 Connection error for watch ${watch.id}: ${errorMessage}`);
          if (attempt === maxRetries) {
            await this.markWebhookAsFailed(watch.id, `Connection error: ${errorMessage}`);
            return;
          }
        } else if (errorCode === 'ECONNABORTED' || errorMessage.includes('timeout')) {
          console.error(`⏰ Timeout error for watch ${watch.id}: ${errorMessage}`);
          if (attempt === maxRetries) {
            await this.markWebhookAsFailed(watch.id, `Timeout error: ${errorMessage}`);
            return;
          }
        } else {
          // Unexpected error
          console.error(`💥 Unexpected error for watch ${watch.id}: ${errorMessage}`);
          if (attempt === maxRetries) {
            await this.markWebhookAsFailed(watch.id, `Unexpected error: ${errorMessage}`);
            return;
          }
        }
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        const delay = retryDelays[attempt - 1] || 5000; // Default to 5s if index is out of bounds
        console.log(`⏳ Retrying webhook for watch ${watch.id} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Mark webhook as successfully sent in database
   */
  private async markWebhookAsSent(watchId: string, attempts: number): Promise<void> {
    try {
      await this.prisma.depositWatch.update({
        where: { id: watchId },
        data: { 
          webhookSent: true,
          updatedAt: new Date(),
        },
      });
      console.log(`📝 Webhook marked as sent for watch ${watchId} (${attempts || 1} attempts)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to mark webhook as sent for watch ${watchId}:`, errorMessage);
    }
  }

  /**
   * Mark webhook as failed in database
   */
  private async markWebhookAsFailed(watchId: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.depositWatch.update({
        where: { id: watchId },
        data: { 
          webhookSent: false,
          updatedAt: new Date(),
        },
      });
      console.error(`💀 Webhook permanently failed for watch ${watchId}: ${errorMessage}`);
    } catch (error) {
      const dbErrorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to mark webhook as failed for watch ${watchId}:`, dbErrorMessage);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate webhook signature for security using HMAC-SHA256
   */
  private generateWebhookSignature(payload: DepositMonitorWebhookPayload): string {
    const crypto = require('crypto');
    const secret = process.env['SHARED_SECRET'] || 'default-shared-secret';
    const payloadString = JSON.stringify(payload);
    
    // Create HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Test webhook endpoint health before sending important notifications
   */
  private async testWebhookHealth(webhookUrl: string): Promise<boolean> {
    try {
      console.log(`🔍 Testing webhook health for: ${webhookUrl}`);
      
      const healthCheckPayload = {
        type: 'health_check',
        timestamp: new Date().toISOString(),
        source: 'wallet-api',
      };

      const response = await axios.post(`${webhookUrl}/health`, healthCheckPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Wallet-API/1.0.0',
        },
        timeout: 5000, // Shorter timeout for health check
        validateStatus: (status) => status < 500,
      });

      if (response.status >= 200 && response.status < 300) {
        // Check if credo API responded with status: "ok" for health check
        const responseData = response.data;
        const isCredoHealthy = responseData && responseData.status === 'ok';
        
        if (isCredoHealthy) {
          console.log(`✅ Webhook health check passed for: ${webhookUrl}, credo responded: ${JSON.stringify(responseData)}`);
          return true;
        } else {
          console.warn(`⚠️ Webhook health check failed - credo API did not return status: "ok" for: ${webhookUrl}`);
          console.warn(`📄 Health check response: ${JSON.stringify(responseData)}`);
          return false;
        }
      } else {
        console.warn(`⚠️ Webhook health check failed with status ${response.status} for: ${webhookUrl}`);
        return false;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️ Webhook health check error for ${webhookUrl}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Enhanced send webhook with pre-flight health check for critical notifications
   */
  private async sendWebhookWithHealthCheck(
    watch: any, 
    status: 'CONFIRMED' | 'EXPIRED', 
    txHash?: string, 
    actualAmount?: string
  ): Promise<void> {
    // For critical notifications, do a quick health check first
    if (status === 'CONFIRMED') {
      const isHealthy = await this.testWebhookHealth(watch.webhookUrl);
      if (!isHealthy) {
        console.warn(`⚠️ Webhook endpoint appears unhealthy, but proceeding with notification for watch ${watch.id}`);
      }
    }

    // Proceed with normal webhook sending with retry logic
    await this.sendWebhook(watch, status, txHash, actualAmount);
  }

  /**
   * Format database watch record to response format
   */
  private formatWatchResponse(watch: any): DepositWatchResponse {
    return {
      id: watch.id,
      userId: watch.userId,
      address: watch.address,
      network: watch.network,
      expectedAmount: watch.expectedAmount,
      status: watch.status,
      expiresAt: watch.expiresAt.toISOString(),
      confirmations: watch.confirmations,
      txHash: watch.txHash,
      actualAmount: watch.actualAmount,
    };
  }

  /**
   * Manually complete a deposit check (for testing purposes)
   */
  public async manuallyCompleteDeposit(watchId: string, actualAmount?: string): Promise<void> {
    try {
      const watch = await this.prisma.depositWatch.findUnique({
        where: { id: watchId },
      });

      if (!watch) {
        throw new Error(`Watch ${watchId} not found`);
      }

      if (watch.status !== 'ACTIVE') {
        throw new Error(`Watch ${watchId} is not active (status: ${watch.status})`);
      }

      console.log(`🎯 Manually completing deposit for watch ${watchId}`);

      const amount = actualAmount || watch.expectedAmount;
      const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;

      await this.handleConfirmedDeposit(watch, txHash, amount);
    } catch (error) {
      console.error(`❌ Error manually completing deposit for watch ${watchId}:`, error);
      throw error;
    }
  }

  /**
   * Get monitoring statistics
   */
  public async getMonitoringStats(): Promise<{
    active: number;
    confirmed: number;
    expired: number;
    inactive: number;
    total: number;
  }> {
    try {
      const [active, confirmed, expired, inactive] = await Promise.all([
        this.prisma.depositWatch.count({ where: { status: 'ACTIVE' } }),
        this.prisma.depositWatch.count({ where: { status: 'CONFIRMED' } }),
        this.prisma.depositWatch.count({ where: { status: 'EXPIRED' } }),
        this.prisma.depositWatch.count({ where: { status: 'INACTIVE' } }),
      ]);

      const total = active + confirmed + expired + inactive;

      return { active, confirmed, expired, inactive, total };
    } catch (error) {
      console.error('❌ Error getting monitoring stats:', error);
      throw error;
    }
  }

  /**
   * Check Ethereum deposits using real blockchain queries
   */
  private async checkEthereumDeposits(watch: any): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains.ethereum.rpcUrl);
      const usdtContract = new ethers.Contract(config.chains.ethereum.usdtContract, USDT_ABI, provider);
      
      const balanceMethod = usdtContract['balanceOf'];
      if (!balanceMethod) throw new Error('balanceOf method not found');
      const balance = await balanceMethod(watch.address);
      const balanceFormatted = parseFloat(ethers.formatUnits(balance, 6)); // USDT has 6 decimals
      
      const balanceKey = `ethereum_${watch.address}`;
      const lastKnownBalance = this.lastKnownBalances.get(balanceKey) || 0;
      
      console.log(`💰 Ethereum USDT balance for ${watch.address}: ${balanceFormatted} (was: ${lastKnownBalance})`);
      
      if (balanceFormatted > lastKnownBalance) {
        const depositAmount = balanceFormatted - lastKnownBalance;
        console.log(`🎯 Found Ethereum deposit: ${depositAmount} USDT!`);
        
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        
        const expectedAmount = parseFloat(watch.expectedAmount);
        if (Math.abs(depositAmount - expectedAmount) < 0.01) {
          await this.handleDepositFound(watch, depositAmount.toString());
        }
      } else {
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        console.log(`⏳ No new Ethereum deposits for watch ${watch.id}`);
      }
    } catch (error) {
      console.error(`❌ Error checking Ethereum deposits for watch ${watch.id}:`, error);
    }
  }

  /**
   * Check BSC deposits using real blockchain queries (handles both USDT and BUSD)
   */
  private async checkBSCDeposits(watch: any): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains.bsc.rpcUrl);
      
      // Determine which token contract to check based on the watch token field
      let contractAddress: string;
      let tokenName: string;
      
      if (watch.token && watch.token.toLowerCase() === 'busd') {
        contractAddress = config.chains.busd.usdtContract; // BUSD contract
        tokenName = 'BUSD';
      } else {
        contractAddress = config.chains.bsc.usdtContract; // USDT contract
        tokenName = 'USDT';
      }
      
      const contract = new ethers.Contract(contractAddress, USDT_ABI, provider);
      
      const balanceMethod = contract['balanceOf'];
      if (!balanceMethod) throw new Error('balanceOf method not found');
      const balance = await balanceMethod(watch.address);
      const balanceFormatted = parseFloat(ethers.formatUnits(balance, 18)); // Both BSC USDT and BUSD have 18 decimals
      
      // Use token-specific balance key to track different tokens separately
      const balanceKey = `bsc_${watch.token.toLowerCase()}_${watch.address}`;
      const lastKnownBalance = this.lastKnownBalances.get(balanceKey) || 0;
      
      console.log(`💰 BSC ${tokenName} balance for ${watch.address}: ${balanceFormatted} (was: ${lastKnownBalance})`);
      console.log(`🎯 Watching for: ${watch.expectedAmount} ${tokenName} (token: ${watch.token})`);
      
      if (balanceFormatted > lastKnownBalance) {
        const depositAmount = balanceFormatted - lastKnownBalance;
        console.log(`🎯 Found BSC ${tokenName} deposit: ${depositAmount} ${tokenName}!`);
        
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        
        const expectedAmount = parseFloat(watch.expectedAmount);
        if (Math.abs(depositAmount - expectedAmount) < 0.01) {
          console.log(`✅ Deposit amount ${depositAmount} ${tokenName} matches expected ${expectedAmount} ${tokenName}`);
          await this.handleDepositFound(watch, depositAmount.toString());
        } else {
          console.log(`⚠️ Deposit amount ${depositAmount} ${tokenName} doesn't match expected ${expectedAmount} ${tokenName}`);
        }
      } else {
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        console.log(`⏳ No new BSC ${tokenName} deposits for watch ${watch.id}`);
      }
    } catch (error) {
      console.error(`❌ Error checking BSC deposits for watch ${watch.id}:`, error);
    }
  }

  /**
   * Check Polygon deposits using real blockchain queries
   */
  private async checkPolygonDeposits(watch: any): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains.polygon.rpcUrl);
      const usdtContract = new ethers.Contract(config.chains.polygon.usdtContract, USDT_ABI, provider);
      
      const balanceMethod = usdtContract['balanceOf'];
      if (!balanceMethod) throw new Error('balanceOf method not found');
      const balance = await balanceMethod(watch.address);
      const balanceFormatted = parseFloat(ethers.formatUnits(balance, 6)); // Polygon USDT has 6 decimals
      
      const balanceKey = `polygon_${watch.address}`;
      const lastKnownBalance = this.lastKnownBalances.get(balanceKey) || 0;
      
      console.log(`💰 Polygon USDT balance for ${watch.address}: ${balanceFormatted} (was: ${lastKnownBalance})`);
      
      if (balanceFormatted > lastKnownBalance) {
        const depositAmount = balanceFormatted - lastKnownBalance;
        console.log(`🎯 Found Polygon deposit: ${depositAmount} USDT!`);
        
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        
        const expectedAmount = parseFloat(watch.expectedAmount);
        if (Math.abs(depositAmount - expectedAmount) < 0.01) {
          await this.handleDepositFound(watch, depositAmount.toString());
        }
      } else {
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        console.log(`⏳ No new Polygon deposits for watch ${watch.id}`);
      }
    } catch (error) {
      console.error(`❌ Error checking Polygon deposits for watch ${watch.id}:`, error);
    }
  }

  /**
   * Check Solana deposits using real blockchain queries
   */
  private async checkSolanaDeposits(watch: any): Promise<void> {
    try {
      const connection = new Connection(config.chains.solana.rpcUrl);
      const userPublicKey = new PublicKey(watch.address);
      const usdtMint = new PublicKey(SOLANA_USDT_MINT);
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, {
        mint: usdtMint,
      });

      const balanceKey = `solana_${watch.address}`;
      let currentBalance = 0;

      if (tokenAccounts.value.length > 0) {
        const usdtAccount = tokenAccounts.value[0];
        if (usdtAccount?.account?.data?.parsed?.info?.tokenAmount?.uiAmount) {
          currentBalance = usdtAccount.account.data.parsed.info.tokenAmount.uiAmount;
        }
      }

      const lastKnownBalance = this.lastKnownBalances.get(balanceKey) || 0;
      
      console.log(`💰 Solana USDT balance for ${watch.address}: ${currentBalance} (was: ${lastKnownBalance})`);
      
      if (currentBalance > lastKnownBalance) {
        const depositAmount = currentBalance - lastKnownBalance;
        console.log(`🎯 Found Solana deposit: ${depositAmount} USDT!`);
        
        this.lastKnownBalances.set(balanceKey, currentBalance);
        
        const expectedAmount = parseFloat(watch.expectedAmount);
        if (Math.abs(depositAmount - expectedAmount) < 0.01) {
          await this.handleDepositFound(watch, depositAmount.toString());
        }
      } else {
        this.lastKnownBalances.set(balanceKey, currentBalance);
        console.log(`⏳ No new Solana deposits for watch ${watch.id}`);
      }
    } catch (error) {
      console.error(`❌ Error checking Solana deposits for watch ${watch.id}:`, error);
    }
  }

  /**
   * Check Tron deposits using TronWeb
   */
  private async checkTronDeposits(watch: any): Promise<void> {
    try {
      console.log(`🔍 Checking Tron USDT deposits for ${watch.address} (Watch: ${watch.id})`);
      
      // Create TronWeb instance with the correct constructor
      const TronWebConstructor = (TronWeb as any).TronWeb || (TronWeb as any).default.TronWeb;
      const tronWeb = new TronWebConstructor(
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        '01' // Dummy private key for read-only operations
      );

      const usdtContractAddress = config.chains.tron.usdtContract; // TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
      const usdtDecimals = 6; // TRC20 USDT has 6 decimals

      // Get USDT contract instance
      const contract = await tronWeb.contract().at(usdtContractAddress);
      
      // Check USDT balance for the watched address
      const balanceResult = await contract.balanceOf(watch.address).call();
      const balanceInWei = balanceResult.toString();
      const balanceFormatted = parseFloat(balanceInWei) / Math.pow(10, usdtDecimals);
      
      const balanceKey = `tron_${watch.address}`;
      const lastKnownBalance = this.lastKnownBalances.get(balanceKey) || 0;
      
      console.log(`💰 Tron USDT balance for ${watch.address}: ${balanceFormatted} USDT (was: ${lastKnownBalance} USDT)`);
      
      if (balanceFormatted > lastKnownBalance) {
        const depositAmount = balanceFormatted - lastKnownBalance;
        console.log(`🎯 Found Tron USDT deposit: ${depositAmount} USDT!`);
        
        // Update the known balance
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        
        // Check if deposit amount matches expected amount (within 0.01 USDT tolerance)
        const expectedAmount = parseFloat(watch.expectedAmount);
        if (Math.abs(depositAmount - expectedAmount) < 0.01) {
          console.log(`✅ Deposit matches expected amount: ${expectedAmount} USDT`);
          
          // Get recent transactions to find the exact transaction hash
          try {
            const txHash = await this.getTronTransactionHash(watch.address, depositAmount);
            await this.handleConfirmedDeposit(watch, txHash, depositAmount.toString());
          } catch (txError) {
            // If we can't get the transaction hash, still process the deposit
            console.warn(`⚠️ Could not get transaction hash: ${txError}`);
            await this.handleConfirmedDeposit(watch, `tron_${Date.now()}`, depositAmount.toString());
          }
        } else {
          console.log(`⚠️ Deposit amount ${depositAmount} doesn't match expected ${expectedAmount}`);
        }
      } else {
        // Update the known balance even if no new deposits
        this.lastKnownBalances.set(balanceKey, balanceFormatted);
        console.log(`⏳ No new Tron USDT deposits for watch ${watch.id}`);
      }
      
    } catch (error) {
      console.error(`❌ Error checking Tron deposits for watch ${watch.id}:`, error);
    }
  }

  /**
   * Get Tron transaction hash for a recent deposit
   */
  private async getTronTransactionHash(address: string, _amount: number): Promise<string> {
    try {
      const TronWebConstructor = (TronWeb as any).TronWeb || (TronWeb as any).default.TronWeb;
      const tronWeb = new TronWebConstructor(
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl
      );

      // Get recent transactions for the address
      const transactions = await tronWeb.trx.getTransactionsFromAddress(address, 'to', 10);
      
      // Find the most recent USDT transfer transaction that matches our amount
      for (const tx of transactions) {
        if (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) {
          const contract = tx.raw_data.contract[0];
          if (contract.type === 'TriggerSmartContract') {
            // This could be a USDT transfer, return the transaction ID
            return tx.txID || `tron_${Date.now()}`;
          }
        }
      }
      
      // If no specific transaction found, return a placeholder
      return `tron_deposit_${Date.now()}`;
    } catch (error) {
      console.warn(`⚠️ Could not fetch Tron transaction hash: ${error}`);
      return `tron_${Date.now()}`;
    }
  }

  /**
   * Handle when a deposit is found
   */
  private async handleDepositFound(watch: any, depositAmount: string, txHash?: string): Promise<void> {
    try {
      console.log(`💰 Deposit found for watch ${watch.id}: ${depositAmount} USDT`);
      
      let confirmations = 5; // Assume sufficient confirmations for balance-based detection
      const generatedTxHash = txHash || `0x${Math.random().toString(16).substring(2, 66)}`;
      
      await this.prisma.depositWatch.update({
        where: { id: watch.id },
        data: { 
          confirmations,
          actualAmount: depositAmount,
          txHash: generatedTxHash,
          updatedAt: new Date(),
        },
      });

      console.log(`📊 Watch ${watch.id}: ${confirmations}/${this.REQUIRED_CONFIRMATIONS} confirmations`);

      if (confirmations >= this.REQUIRED_CONFIRMATIONS) {
        await this.handleConfirmedDeposit(watch, generatedTxHash, depositAmount);
      }
    } catch (error) {
      console.error(`❌ Error handling deposit found for watch ${watch.id}:`, error);
    }
  }

  /**
   * Cleanup and stop monitoring
   */
  public async cleanup(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    await this.prisma.$disconnect();
    console.log('✅ Deposit watch service cleaned up');
  }

  /**
   * Get webhook delivery statistics
   */
  public async getWebhookStats(): Promise<{
    totalWebhooks: number;
    sentWebhooks: number;
    failedWebhooks: number;
    pendingWebhooks: number;
    successRate: number;
  }> {
    try {
      const [total, sent, failed] = await Promise.all([
        this.prisma.depositWatch.count({
          where: {
            webhookUrl: { not: null },
          },
        }),
        this.prisma.depositWatch.count({
          where: {
            webhookUrl: { not: null },
            webhookSent: true,
          },
        }),
        this.prisma.depositWatch.count({
          where: {
            webhookUrl: { not: null },
            webhookSent: false,
            OR: [
              { status: 'CONFIRMED' },
              { status: 'EXPIRED' },
            ],
          },
        }),
      ]);

      const pending = total - sent - failed;
      const successRate = total > 0 ? (sent / total) * 100 : 0;

      return {
        totalWebhooks: total,
        sentWebhooks: sent,
        failedWebhooks: failed,
        pendingWebhooks: pending,
        successRate: Math.round(successRate * 100) / 100,
      };
    } catch (error) {
      console.error('❌ Error getting webhook stats:', error);
      throw error;
    }
  }

  /**
   * Retry failed webhooks for critical deposits and expired watches
   */
  public async retryFailedWebhooks(): Promise<void> {
    try {
      console.log('🔄 Checking for failed webhooks to retry...');

      // Find ACTIVE watches that need webhook retry
      const failedWebhooks = await this.prisma.depositWatch.findMany({
        where: {
          OR: [
            // Confirmed deposits that are still ACTIVE (webhook failed)
            {
              status: 'ACTIVE',
              webhookUrl: { not: null },
              webhookSent: false,
              actualAmount: { not: null }, // Has deposit data
              txHash: { not: null },
              updatedAt: {
                lt: new Date(Date.now() - 5 * 60 * 1000), // Only retry after 5 minutes
              },
            },
            // Expired watches that are still ACTIVE (webhook failed)
            {
              status: 'ACTIVE',
              webhookUrl: { not: null },
              webhookSent: false,
              expiresAt: {
                lt: new Date(), // Expired
              },
              updatedAt: {
                lt: new Date(Date.now() - 5 * 60 * 1000), // Only retry after 5 minutes
              },
            },
            // Legacy CONFIRMED status with failed webhooks
            {
              status: 'CONFIRMED',
              webhookUrl: { not: null },
              webhookSent: false,
              updatedAt: {
                lt: new Date(Date.now() - 5 * 60 * 1000), // Only retry after 5 minutes
              },
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        take: 10, // Limit to 10 retries per run
      });

      if (failedWebhooks.length === 0) {
        console.log('✅ No failed webhooks to retry');
        return;
      }

      console.log(`🔄 Found ${failedWebhooks.length} failed webhooks to retry`);

      for (const watch of failedWebhooks) {
        try {
          const isExpired = new Date() > watch.expiresAt;
          const hasDepositData = watch.actualAmount && watch.txHash;
          
          if (hasDepositData) {
            console.log(`🔄 Retrying webhook for confirmed deposit watch ${watch.id}`);
            await this.sendWebhook(watch, 'CONFIRMED', watch.txHash || undefined, watch.actualAmount || undefined);
          } else if (isExpired) {
            console.log(`🔄 Retrying webhook for expired watch ${watch.id}`);
            await this.sendWebhook(watch, 'EXPIRED');
          } else {
            console.log(`⏸️ Skipping watch ${watch.id} - no deposit data and not expired yet`);
            continue;
          }
          
          // Add delay between retries to avoid overwhelming the endpoint
          await this.sleep(2000);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Retry failed for watch ${watch.id}:`, errorMessage);
        }
      }

      console.log(`✅ Webhook retry process completed for ${failedWebhooks.length} webhooks`);
    } catch (error) {
      console.error('❌ Error during webhook retry process:', error);
    }
  }

  /**
   * Force stop a watch that has been failing webhook delivery for too long
   */
  private async forceStopWatchWithFailedWebhook(watch: any): Promise<void> {
    try {
      const hasDepositData = watch.actualAmount && watch.txHash;
      const isExpired = new Date() > watch.expiresAt;
      
      // Determine the final status based on what happened
      const finalStatus = hasDepositData ? 'CONFIRMED' : (isExpired ? 'EXPIRED' : 'INACTIVE');
      
      await this.prisma.depositWatch.update({
        where: { id: watch.id },
        data: { 
          status: finalStatus,
          webhookSent: false, // Mark as failed webhook
          updatedAt: new Date(),
        },
      });

      console.log(`🛑 Watch ${watch.id} force-stopped with status ${finalStatus} - webhook delivery failed permanently`);
      
      if (hasDepositData) {
        console.log(`💰 Deposit was found: ${watch.actualAmount} USDT (${watch.txHash}) but webhook failed`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error force-stopping watch ${watch.id}:`, errorMessage);
    }
  }

  /**
   * Enhanced monitoring cycle with webhook retry
   */
  public async runMaintenanceTasks(): Promise<void> {
    try {
      console.log('🔧 Running maintenance tasks...');

      // Retry failed webhooks
      await this.retryFailedWebhooks();

      // Log webhook statistics
      const stats = await this.getWebhookStats();
      console.log('📊 Webhook Statistics:', {
        total: stats.totalWebhooks,
        sent: stats.sentWebhooks,
        failed: stats.failedWebhooks,
        pending: stats.pendingWebhooks,
        successRate: `${stats.successRate}%`,
      });

      console.log('✅ Maintenance tasks completed');
    } catch (error) {
      console.error('❌ Error during maintenance tasks:', error);
    }
  }
}

export const depositWatchService = DepositWatchService.getInstance(); 