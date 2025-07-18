import { SlackService } from './slack.service';
import { GasFeeWalletService } from './gas-fee-wallet.service';
import { PendingTransferService } from './pending-transfer.service';
import { config } from '../config';
import { ethers } from 'ethers';

export interface WalletBalanceThreshold {
  network: string;
  lowThreshold: bigint; // in wei
  criticalThreshold: bigint; // in wei
  priority: 'low' | 'medium' | 'high';
}

export interface WalletBalanceAlert {
  network: string;
  walletAddress: string;
  currentBalance: bigint;
  threshold: bigint;
  balanceEth: string;
  thresholdEth: string;
  deficit: bigint;
  deficitEth: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
  estimatedTransfersRemaining: number;
  pendingTransfers?: {
    network: string;
    count: number;
    totalAmount: string;
    userIds: string[];
    watchIds: string[];
  };
}

export interface WalletBalanceMonitorConfig {
  checkInterval: number; // milliseconds
  alertCooldown: number; // milliseconds
  enabledNetworks: string[];
  thresholds: WalletBalanceThreshold[];
  slackChannel: string;
  enableNotifications: boolean;
  maxAlertsPerHour: number;
  balanceHistory: boolean;
  estimatedTransferCost: bigint; // Estimated cost per transfer
}

export class WalletBalanceMonitorService {
  private static instance: WalletBalanceMonitorService;
  private slackService: SlackService;
  private gasFeeWalletService: GasFeeWalletService;
  private pendingTransferService: PendingTransferService;
  private monitoringInterval?: NodeJS.Timeout | undefined;
  private lastAlerts: Map<string, number> = new Map();
  private balanceHistory: Map<string, Array<{ balance: bigint; timestamp: number }>> = new Map();
  private alertCount: Map<string, number> = new Map();
  private lastResetTime: number = Date.now();

  private readonly defaultConfig: WalletBalanceMonitorConfig = {
    checkInterval: 300000, // 5 minutes
    alertCooldown: 1800000, // 30 minutes
    enabledNetworks: ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'],
    thresholds: [
      {
        network: 'ethereum',
        lowThreshold: ethers.parseEther('0.05'), // 0.05 ETH - higher threshold for gas fee wallets
        criticalThreshold: ethers.parseEther('0.02'), // 0.02 ETH
        priority: 'high'
      },
      {
        network: 'bsc',
        lowThreshold: ethers.parseEther('0.05'), // 0.05 BNB
        criticalThreshold: ethers.parseEther('0.02'), // 0.02 BNB
        priority: 'high'
      },
      {
        network: 'polygon',
        lowThreshold: ethers.parseEther('0.1'), // 0.1 MATIC - higher for Polygon
        criticalThreshold: ethers.parseEther('0.05'), // 0.05 MATIC
        priority: 'high'
      },
      {
        network: 'solana',
        lowThreshold: ethers.parseEther('0.1'), // 0.1 SOL
        criticalThreshold: ethers.parseEther('0.05'), // 0.05 SOL
        priority: 'high'
      },
      {
        network: 'tron',
        lowThreshold: ethers.parseEther('100'), // 100 TRX (converted to wei for consistency)
        criticalThreshold: ethers.parseEther('50'), // 50 TRX
        priority: 'high'
      },
      {
        network: 'busd',
        lowThreshold: ethers.parseEther('0.05'), // 0.05 BNB (BUSD uses BSC)
        criticalThreshold: ethers.parseEther('0.02'), // 0.02 BNB
        priority: 'high'
      }
    ],
    slackChannel: '#gas-fee-alerts',
    enableNotifications: true,
    maxAlertsPerHour: 10,
    balanceHistory: true,
    estimatedTransferCost: ethers.parseEther('0.002') // 0.002 ETH estimated per transfer (higher for gas fee wallets)
  };

  private constructor() {
    this.slackService = SlackService.getInstance();
    this.gasFeeWalletService = GasFeeWalletService.getInstance();
    this.pendingTransferService = PendingTransferService.getInstance();
  }

  public static getInstance(): WalletBalanceMonitorService {
    if (!WalletBalanceMonitorService.instance) {
      WalletBalanceMonitorService.instance = new WalletBalanceMonitorService();
    }
    return WalletBalanceMonitorService.instance;
  }

  /**
   * Start wallet balance monitoring
   */
  public async startMonitoring(customConfig?: Partial<WalletBalanceMonitorConfig>): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...customConfig };
    
    console.log('💰 Starting Wallet Balance Monitoring Service...');
    console.log(`   Check Interval: ${finalConfig.checkInterval / 1000}s`);
    console.log(`   Alert Cooldown: ${finalConfig.alertCooldown / 1000}s`);
    console.log(`   Enabled Networks: ${finalConfig.enabledNetworks.join(', ')}`);
    console.log(`   Slack Channel: ${finalConfig.slackChannel}`);
    console.log(`   Notifications: ${finalConfig.enableNotifications ? 'Enabled' : 'Disabled'}`);

    // Clear any existing interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Initial check
    await this.checkWalletBalances(finalConfig);

    // Set up monitoring interval
    this.monitoringInterval = setInterval(async () => {
      await this.checkWalletBalances(finalConfig);
    }, finalConfig.checkInterval);

    console.log('✅ Wallet Balance Monitoring Service started successfully');
  }

  /**
   * Stop wallet balance monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('⏹️  Wallet Balance Monitoring Service stopped');
    }
  }

  /**
   * Check wallet balances across all enabled networks
   */
  private async checkWalletBalances(config: WalletBalanceMonitorConfig): Promise<void> {
    console.log(`\n💰 Checking wallet balances at ${new Date().toISOString()}`);

    // Reset alert count if an hour has passed
    const now = Date.now();
    if (now - this.lastResetTime > 3600000) { // 1 hour
      this.alertCount.clear();
      this.lastResetTime = now;
    }

    // First, check if there are any pending transfers that need gas fees
    const pendingTransfers = await this.pendingTransferService.getPendingTransfers();
    const hasPendingTransfers = Object.keys(pendingTransfers).length > 0;

    if (!hasPendingTransfers) {
      console.log('   No pending transfers found - skipping balance alerts');
      return;
    }

    console.log(`   Found pending transfers on networks: ${Object.keys(pendingTransfers).join(', ')}`);

    const alerts: WalletBalanceAlert[] = [];

    for (const network of config.enabledNetworks) {
      try {
        const threshold = config.thresholds.find(t => t.network === network);
        if (!threshold) {
          console.warn(`⚠️  No threshold configured for network: ${network}`);
          continue;
        }

        // Only check balances for networks that have pending transfers
        const networkPendingTransfers = pendingTransfers[network];
        if (!networkPendingTransfers) {
          console.log(`   ${network.toUpperCase()}: No pending transfers - skipping balance check`);
          continue;
        }

        console.log(`   ${network.toUpperCase()}: ${networkPendingTransfers.count} pending transfers (${networkPendingTransfers.totalAmount} USDT)`);

        // Get all wallets for this network
        const wallets = await this.getNetworkWallets(network);
        
        for (const wallet of wallets) {
          try {
            // Get current balance
            const currentBalance = await this.getWalletBalance(network, wallet.address);
            
            // Store in history if enabled
            if (config.balanceHistory) {
              this.storeBalanceHistory(wallet.address, currentBalance);
            }

            // Check for low balance alerts (only if there are pending transfers)
            const alert = this.checkForLowBalanceAlert(
              network, 
              wallet.address, 
              currentBalance, 
              threshold, 
              config
            );
            
            if (alert) {
              // Add pending transfer information to the alert
              alert.pendingTransfers = networkPendingTransfers;
              alerts.push(alert);
            }

            // Log current balance
            const nativeToken = this.getNativeTokenSymbol(network);
            console.log(`   ${network.toUpperCase()} - ${wallet.address}: ${ethers.formatEther(currentBalance)} ${nativeToken}`);

          } catch (error) {
            console.error(`❌ Error checking balance for wallet ${wallet.address} on ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

      } catch (error) {
        console.error(`❌ Error checking wallet balances for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Send alerts if any and notifications are enabled
    if (alerts.length > 0 && config.enableNotifications) {
      await this.sendBalanceAlerts(alerts, config);
    }

    console.log(`   Check completed. Alerts: ${alerts.length} (only for networks with pending transfers)`);
  }

  /**
   * Get gas fee wallets for a specific network
   */
  private async getNetworkWallets(network: string): Promise<Array<{ address: string; privateKey: string }>> {
    try {
      // Check if gas fee wallet is configured for this network
      if (!this.gasFeeWalletService.isGasFeeWalletConfigured(network)) {
        console.warn(`⚠️  No gas fee wallet configured for network: ${network}`);
        return [];
      }

      // Get gas fee wallet for this network
      const gasFeeWallet = await this.gasFeeWalletService.getGasFeeWallet(network);
      return [{
        address: gasFeeWallet.address,
        privateKey: gasFeeWallet.privateKey,
      }];
    } catch (error) {
      console.error(`❌ Error getting gas fee wallet for network ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Get wallet balance for a specific network
   */
  private async getWalletBalance(network: string, walletAddress: string): Promise<bigint> {
    try {
      switch (network) {
        case 'ethereum':
        case 'bsc':
        case 'polygon':
        case 'busd':
          return await this.getEVMBalance(network, walletAddress);
        case 'solana':
          return await this.getSolanaBalance(walletAddress);
        case 'tron':
          return await this.getTronBalance(walletAddress);
        default:
          throw new Error(`Unsupported network: ${network}`);
      }
    } catch (error) {
      throw new Error(`Failed to get balance for ${walletAddress} on ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get EVM chain balance (Ethereum, BSC, Polygon, BUSD)
   */
  private async getEVMBalance(network: string, walletAddress: string): Promise<bigint> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains[network as keyof typeof config.chains].rpcUrl);
      return await provider.getBalance(walletAddress);
    } catch (error) {
      throw new Error(`Failed to get ${network} balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Solana balance
   */
  private async getSolanaBalance(walletAddress: string): Promise<bigint> {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const connection = new Connection(config.chains.solana.rpcUrl);
      const publicKey = new PublicKey(walletAddress);
      const balance = await connection.getBalance(publicKey);
      
      // Convert lamports to wei for consistency (1 SOL = 1e9 lamports, 1 ETH = 1e18 wei)
      // So we multiply by 1e9 to convert lamports to wei equivalent
      return BigInt(balance) * BigInt(1e9);
    } catch (error) {
      throw new Error(`Failed to get Solana balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Tron balance
   */
  private async getTronBalance(walletAddress: string): Promise<bigint> {
    try {
      const TronWeb = (await import('tronweb')).default;
      const TronWebConstructor = (TronWeb as any).TronWeb || (TronWeb as any).default.TronWeb;
      const tronWeb = new TronWebConstructor(
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        '01' // Dummy private key for read-only operations
      );
      
      const balance = await tronWeb.trx.getBalance(walletAddress);
      
      // Convert sun to wei for consistency (1 TRX = 1e6 sun, 1 ETH = 1e18 wei)
      // So we multiply by 1e12 to convert sun to wei equivalent
      return BigInt(balance) * BigInt(1e12);
    } catch (error) {
      throw new Error(`Failed to get Tron balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if current balance is low enough to trigger an alert
   */
  private checkForLowBalanceAlert(
    network: string,
    walletAddress: string,
    currentBalance: bigint,
    threshold: WalletBalanceThreshold,
    config: WalletBalanceMonitorConfig
  ): WalletBalanceAlert | null {
    const alertKey = `${network}-${walletAddress}-low-balance`;
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(alertKey) || 0;
    const alertCount = this.alertCount.get(alertKey) || 0;

    // Check cooldown and rate limiting
    if (now - lastAlert < config.alertCooldown) {
      return null;
    }

    if (alertCount >= config.maxAlertsPerHour) {
      return null;
    }

    // Determine priority based on how low the balance is
    let priority: 'low' | 'medium' | 'high' = 'low';
    let thresholdToUse = threshold.lowThreshold;

    if (currentBalance <= threshold.criticalThreshold) {
      priority = 'high';
      thresholdToUse = threshold.criticalThreshold;
    } else if (currentBalance <= threshold.lowThreshold) {
      priority = 'medium';
      thresholdToUse = threshold.lowThreshold;
    } else {
      return null; // Balance is not low enough
    }

    // Calculate deficit and estimated transfers remaining
    const deficit = thresholdToUse - currentBalance;
    const estimatedTransfersRemaining = Number(currentBalance / config.estimatedTransferCost);

    const alert: WalletBalanceAlert = {
      network,
      walletAddress,
      currentBalance,
      threshold: thresholdToUse,
      balanceEth: ethers.formatEther(currentBalance),
      thresholdEth: ethers.formatEther(thresholdToUse),
      deficit,
      deficitEth: ethers.formatEther(deficit),
      timestamp: now,
      priority,
      estimatedTransfersRemaining: Math.max(0, estimatedTransfersRemaining)
    };

    // Update tracking
    this.lastAlerts.set(alertKey, now);
    this.alertCount.set(alertKey, alertCount + 1);

    return alert;
  }

  /**
   * Send balance alerts to Slack
   */
  private async sendBalanceAlerts(
    alerts: WalletBalanceAlert[], 
    config: WalletBalanceMonitorConfig
  ): Promise<void> {
    try {
      const alertBlocks = alerts.map(alert => this.createSlackBalanceAlertBlock(alert));
      
      const message = {
        channel: config.slackChannel,
        text: `🚨 Gas Fee Wallet Low Balance Alert - ${alerts.length} wallet(s) with PENDING TRANSFERS`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 Gas Fee Wallet Low Balance Alert - ${alerts.length} wallet(s) with PENDING TRANSFERS`,
              emoji: true
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*Time:* ${new Date().toISOString()} | *Priority:* ${this.getHighestPriority(alerts)}`
              }
            ]
          },
          {
            type: 'divider'
          },
          ...alertBlocks.flat(),
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⚠️ *CRITICAL ACTION REQUIRED:*\n• Fund these gas fee wallets immediately\n• Transfer operations are BLOCKED due to insufficient gas fees\n• Check wallet balances and add funds'
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'These are dedicated gas fee wallets that pay for transfer operations. Low balances are preventing deposits from being forwarded to master wallets.'
              }
            ]
          }
        ]
      };

      await this.slackService.sendMessage(message);
      console.log(`📤 Sent ${alerts.length} balance alert(s) to Slack`);

    } catch (error) {
      console.error(`❌ Failed to send balance alerts to Slack: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Slack block for a single balance alert
   */
  private createSlackBalanceAlertBlock(alert: WalletBalanceAlert): any[] {
    const priorityEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🔴'
    };

    const nativeToken = this.getNativeTokenSymbol(alert.network);

    const blocks = [
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*${priorityEmoji[alert.priority]} ${alert.network.toUpperCase()}*\n${alert.walletAddress.slice(0, 8)}...${alert.walletAddress.slice(-6)}`
          },
          {
            type: 'mrkdwn',
            text: `*Balance:* ${alert.balanceEth} ${nativeToken}\n*Threshold:* ${alert.thresholdEth} ${nativeToken}`
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Deficit:* ${alert.deficitEth} ${nativeToken}\n*Transfers Remaining:* ~${alert.estimatedTransfersRemaining}`
          },
          {
            type: 'mrkdwn',
            text: `*Priority:* ${alert.priority.toUpperCase()}\n*Time:* ${new Date(alert.timestamp).toLocaleTimeString()}`
          }
        ]
      }
    ];

    // Add pending transfer information if available
    if (alert.pendingTransfers) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Pending Transfers:* ${alert.pendingTransfers.count}\n*Total Amount:* ${alert.pendingTransfers.totalAmount} USDT`
          },
          {
            type: 'mrkdwn',
            text: `*Users Affected:* ${alert.pendingTransfers.userIds.length}\n*Watch IDs:* ${alert.pendingTransfers.watchIds.length}`
          }
        ]
      });
    }

    return blocks;
  }

  /**
   * Get native token symbol for a network
   */
  private getNativeTokenSymbol(network: string): string {
    switch (network) {
      case 'ethereum': return 'ETH';
      case 'bsc': return 'BNB';
      case 'polygon': return 'MATIC';
      case 'solana': return 'SOL';
      case 'tron': return 'TRX';
      case 'busd': return 'BNB'; // BUSD uses BSC
      default: return 'TOKEN';
    }
  }

  /**
   * Get the highest priority from alerts
   */
  private getHighestPriority(alerts: WalletBalanceAlert[]): string {
    const priorities = ['low', 'medium', 'high'];
    const highestPriority = alerts.reduce((highest, alert) => {
      const currentIndex = priorities.indexOf(alert.priority);
      const highestIndex = priorities.indexOf(highest);
      return currentIndex > highestIndex ? alert.priority : highest;
    }, 'low' as string);

    return highestPriority.toUpperCase();
  }

  /**
   * Store balance in history
   */
  private storeBalanceHistory(walletAddress: string, balance: bigint): void {
    const now = Date.now();
    const history = this.balanceHistory.get(walletAddress) || [];
    
    // Add new entry
    history.push({ balance, timestamp: now });
    
    // Keep only last 24 hours of data (288 entries for 5-minute intervals)
    const oneDayAgo = now - 86400000;
    const filteredHistory = history.filter(entry => entry.timestamp > oneDayAgo);
    
    this.balanceHistory.set(walletAddress, filteredHistory);
  }

  /**
   * Get balance history for a wallet
   */
  public getBalanceHistory(walletAddress: string, hours: number = 24): Array<{ balance: bigint; timestamp: number }> {
    const history = this.balanceHistory.get(walletAddress) || [];
    const cutoffTime = Date.now() - (hours * 3600000);
    return history.filter(entry => entry.timestamp > cutoffTime);
  }

  /**
   * Get balance statistics for a wallet
   */
  public getBalanceStats(walletAddress: string, hours: number = 24): {
    min: bigint;
    max: bigint;
    average: bigint;
    current: bigint;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    const history = this.getBalanceHistory(walletAddress, hours);
    
    if (history.length === 0) {
      return {
        min: BigInt(0),
        max: BigInt(0),
        average: BigInt(0),
        current: BigInt(0),
        trend: 'stable'
      };
    }

    const balances = history.map(entry => entry.balance);
    const min = balances.reduce((a, b) => a < b ? a : b);
    const max = balances.reduce((a, b) => a > b ? a : b);
    const sum = balances.reduce((a, b) => a + b, BigInt(0));
    const average = sum / BigInt(balances.length);
    const current = history[history.length - 1]?.balance || BigInt(0);

    // Determine trend (compare last 3 entries)
    const recentEntries = history.slice(-3);
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (recentEntries.length >= 2) {
      const first = recentEntries[0]?.balance || BigInt(0);
      const last = recentEntries[recentEntries.length - 1]?.balance || BigInt(0);
      const change = Number(last - first);
      
      if (change > 0) trend = 'increasing';
      else if (change < 0) trend = 'decreasing';
    }

    return { min, max, average, current, trend };
  }

  /**
   * Manually trigger a balance check
   */
  public async manualCheck(customConfig?: Partial<WalletBalanceMonitorConfig>): Promise<WalletBalanceAlert[]> {
    const finalConfig = { ...this.defaultConfig, ...customConfig };
    const alerts: WalletBalanceAlert[] = [];

    for (const network of finalConfig.enabledNetworks) {
      try {
        const threshold = finalConfig.thresholds.find(t => t.network === network);
        if (!threshold) continue;

        const wallets = await this.getNetworkWallets(network);
        
        for (const wallet of wallets) {
          try {
            const currentBalance = await this.getWalletBalance(network, wallet.address);
            const alert = this.checkForLowBalanceAlert(network, wallet.address, currentBalance, threshold, finalConfig);
            if (alert) {
              alerts.push(alert);
            }
          } catch (error) {
            console.error(`Error in manual check for ${wallet.address} on ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

      } catch (error) {
        console.error(`Error in manual check for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return alerts;
  }

  /**
   * Get monitoring status
   */
  public getStatus(): {
    isRunning: boolean;
    lastCheck: number;
    alertCount: number;
    enabledNetworks: string[];
    nextCheck: number;
  } {
    const isRunning = !!this.monitoringInterval;
    const lastCheck = Math.max(...Array.from(this.lastAlerts.values()), 0);
    const alertCount = Array.from(this.alertCount.values()).reduce((sum, count) => sum + count, 0);
    
    return {
      isRunning,
      lastCheck,
      alertCount,
      enabledNetworks: this.defaultConfig.enabledNetworks,
      nextCheck: isRunning ? lastCheck + this.defaultConfig.checkInterval : 0
    };
  }

  /**
   * Update monitoring configuration
   */
  public updateConfig(newConfig: Partial<WalletBalanceMonitorConfig>): void {
    Object.assign(this.defaultConfig, newConfig);
    console.log('⚙️  Wallet balance monitoring configuration updated');
  }

  /**
   * Clear alert history
   */
  public clearAlertHistory(): void {
    this.lastAlerts.clear();
    this.alertCount.clear();
    console.log('🗑️  Alert history cleared');
  }

  /**
   * Get estimated funding requirements
   */
  public async getFundingRequirements(network: string): Promise<{
    totalDeficit: bigint;
    totalDeficitEth: string;
    walletsNeedingFunding: number;
    recommendedFunding: bigint;
    recommendedFundingEth: string;
  }> {
    try {
      const threshold = this.defaultConfig.thresholds.find(t => t.network === network);
      if (!threshold) {
        throw new Error(`No threshold configured for network: ${network}`);
      }

      const wallets = await this.getNetworkWallets(network);
      let totalDeficit = BigInt(0);
      let walletsNeedingFunding = 0;

      for (const wallet of wallets) {
        try {
          const currentBalance = await this.getWalletBalance(network, wallet.address);
          if (currentBalance < threshold.lowThreshold) {
            const deficit = threshold.lowThreshold - currentBalance;
            totalDeficit += deficit;
            walletsNeedingFunding++;
          }
        } catch (error) {
          console.error(`Error checking balance for ${wallet.address}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Recommend funding with some buffer
      const recommendedFunding = totalDeficit + (totalDeficit * BigInt(20) / BigInt(100)); // 20% buffer

      return {
        totalDeficit,
        totalDeficitEth: ethers.formatEther(totalDeficit),
        walletsNeedingFunding,
        recommendedFunding,
        recommendedFundingEth: ethers.formatEther(recommendedFunding)
      };
    } catch (error) {
      throw new Error(`Failed to get funding requirements for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 