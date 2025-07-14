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

      // Get all user wallets from database
      const userWallets = await this.databaseService.getAllUserWallets();
      
      for (const userWallet of userWallets) {
        await this.checkUserDeposits(userWallet);
      }

      console.log(`✅ Deposit check completed for ${userWallets.length} users`);
    } catch (error) {
      console.error('❌ Error checking deposits:', error);
    }
  }

  /**
   * Check for deposits for a specific user
   */
  private async checkUserDeposits(userWallet: { userId: string; wallets: { [key: string]: string } }): Promise<void> {
    try {
      // For now, we'll simulate deposit detection
      // In production, this would query blockchain APIs
      await this.simulateDepositDetection(userWallet);
    } catch (error) {
      console.error(`❌ Error checking deposits for user ${userWallet.userId}:`, error);
    }
  }

  /**
   * Simulate deposit detection (replace with real blockchain queries)
   */
  private async simulateDepositDetection(userWallet: { userId: string; wallets: { [key: string]: string } }): Promise<void> {
    // Simulate random deposits for testing
    const shouldSimulateDeposit = Math.random() < 0.01; // 1% chance per check
    
    if (shouldSimulateDeposit) {
      const networks = ['ethereum', 'bsc', 'polygon', 'solana', 'ton'];
      const randomNetwork = networks[Math.floor(Math.random() * networks.length)];
      const randomAmount = (Math.random() * 1000 + 1).toFixed(2);
      const randomTxId = `0x${Math.random().toString(16).substring(2, 66)}`;

      console.log(`🎯 Simulating deposit: ${randomAmount} USDT on ${randomNetwork} for user ${userWallet.userId}`);

      // Store deposit in database
      const userWalletRecord = await this.databaseService.getUserWallets(userWallet.userId);
      if (userWalletRecord) {
        const walletAddress = userWallet.wallets[randomNetwork as keyof typeof userWallet.wallets];
        if (walletAddress) {
          const deposit = await this.databaseService.storeDeposit({
            userId: userWallet.userId,
            userWalletId: 'temp-id', // In real implementation, get actual wallet ID
            amount: randomAmount,
            currency: 'USDT',
            network: randomNetwork || 'ethereum',
            txId: randomTxId,
            wallet: walletAddress,
          });

          // Update confirmations (simulate blockchain confirmations)
          setTimeout(async () => {
            await this.databaseService.updateDepositConfirmations(deposit.id, 1, 'CONFIRMED');
            
            // Send webhook notification
            const webhookPayload: DepositWebhookPayload = {
              userId: userWallet.userId,
              amount: randomAmount,
              currency: 'USDT',
              network: randomNetwork || 'ethereum',
              txId: randomTxId,
              wallet: walletAddress,
            };

            const webhookSuccess = await this.webhookService.sendDepositWebhookWithRetry(webhookPayload);
            if (webhookSuccess) {
              await this.databaseService.markWebhookSent(deposit.id);
            }
          }, 5000); // Simulate 5 second confirmation time
        }
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