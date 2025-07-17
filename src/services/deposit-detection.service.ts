import { DatabaseService } from './database.service';
import { WebhookService } from './webhook.service';
import { DepositWebhookPayload } from '../types';

export class DepositDetectionService {
  private static instance: DepositDetectionService;
  private databaseService: DatabaseService;
  private webhookService: WebhookService;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.webhookService = WebhookService.getInstance();
  }

  public static getInstance(): DepositDetectionService {
    if (!DepositDetectionService.instance) {
      DepositDetectionService.instance = new DepositDetectionService();
    }
    return DepositDetectionService.instance;
  }

  /**
   * Start monitoring all user wallets for deposits
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Deposit monitoring is already running');
      return;
    }

    console.log('🔍 Starting deposit monitoring...');
    this.isMonitoring = true;

    // Check for deposits every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.checkForDeposits();
    }, 30000);

    // Initial check
    await this.checkForDeposits();
  }

  /**
   * Stop monitoring deposits
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Deposit monitoring stopped');
  }

  /**
   * Check for new deposits across all monitored wallets
   */
  private async checkForDeposits(): Promise<void> {
    try {
      console.log('🔍 Checking for new deposits...');

      // Get all disposable wallets from database
      const disposableWallets = await this.databaseService.getAllDisposableWallets();
      
      for (const wallet of disposableWallets) {
        await this.checkUserDeposits(wallet);
      }

      console.log(`✅ Deposit check completed for ${disposableWallets.length} wallets`);
    } catch (error) {
      console.error('❌ Error checking deposits:', error);
    }
  }

  /**
   * Check for deposits for a specific wallet
   */
  private async checkUserDeposits(wallet: { userId: string; network: string; address: string }): Promise<void> {
    try {
      // For now, we'll simulate deposit detection
      // In production, this would query blockchain APIs
      await this.simulateDepositDetection(wallet);
    } catch (error) {
      console.error(`❌ Error checking deposits for wallet ${wallet.address}:`, error);
    }
  }

  /**
   * Simulate deposit detection (replace with real blockchain queries)
   */
  private async simulateDepositDetection(wallet: { userId: string; network: string; address: string }): Promise<void> {
    // Simulate random deposits for testing
    const shouldSimulateDeposit = Math.random() < 0.01; // 1% chance per check
    
    if (shouldSimulateDeposit) {
      const randomAmount = (Math.random() * 1000 + 1).toFixed(2);
      const randomTxId = `0x${Math.random().toString(16).substring(2, 66)}`;

      console.log(`🎯 Simulating deposit: ${randomAmount} USDT on ${wallet.network} for user ${wallet.userId}`);

      // Get the wallet info to get the wallet ID
      const walletInfo = await this.databaseService.getDisposableWallet(wallet.userId, wallet.network);
      if (walletInfo) {
        const deposit = await this.databaseService.storeDeposit({
          userId: wallet.userId,
          walletId: walletInfo.id,
          amount: randomAmount,
          currency: 'USDT',
          network: wallet.network,
          txId: randomTxId,
          walletAddress: wallet.address,
        });

        // Update confirmations (simulate blockchain confirmations)
        setTimeout(async () => {
          await this.databaseService.updateDepositConfirmations(deposit.id, 1, 'CONFIRMED');
          
          // Send webhook notification
          const webhookPayload: DepositWebhookPayload = {
            userId: wallet.userId,
            amount: randomAmount,
            currency: 'USDT',
            network: wallet.network,
            txId: randomTxId,
            wallet: wallet.address,
          };

          const webhookSuccess = await this.webhookService.sendDepositWebhookWithRetry(webhookPayload);
          if (webhookSuccess) {
            await this.databaseService.markWebhookSent(deposit.id);
          }
        }, 5000); // Simulate 5 second confirmation time
      }
    }
  }

  /**
   * Get monitoring status
   */
  public isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Manual deposit check for testing
   */
  public async manualDepositCheck(): Promise<void> {
    console.log('🔍 Manual deposit check triggered');
    await this.checkForDeposits();
  }
} 