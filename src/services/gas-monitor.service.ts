import { GasFeeService } from './gas-fee.service';
import { SlackService } from './slack.service';
import { ethers } from 'ethers';

export interface GasThreshold {
  network: string;
  lowThreshold: bigint; // in wei
  mediumThreshold: bigint; // in wei
  highThreshold: bigint; // in wei
  priority: 'low' | 'medium' | 'high';
}

export interface GasAlert {
  network: string;
  currentGasPrice: bigint;
  threshold: bigint;
  gasPriceGwei: string;
  thresholdGwei: string;
  savings: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
}

export interface GasMonitorConfig {
  checkInterval: number; // milliseconds
  alertCooldown: number; // milliseconds
  enabledNetworks: string[];
  thresholds: GasThreshold[];
  slackChannel: string;
  enableNotifications: boolean;
  maxAlertsPerHour: number;
  gasPriceHistory: boolean;
}

export class GasMonitorService {
  private static instance: GasMonitorService;
  private gasFeeService: GasFeeService;
  private slackService: SlackService;
  private monitoringInterval?: NodeJS.Timeout | undefined;
  private lastAlerts: Map<string, number> = new Map();
  private gasPriceHistory: Map<string, Array<{ price: bigint; timestamp: number }>> = new Map();
  private alertCount: Map<string, number> = new Map();
  private lastResetTime: number = Date.now();

  private readonly defaultConfig: GasMonitorConfig = {
    checkInterval: 300000, // 5 minutes
    alertCooldown: 1800000, // 30 minutes
    enabledNetworks: ['ethereum', 'bsc', 'polygon'],
    thresholds: [
      {
        network: 'ethereum',
        lowThreshold: ethers.parseUnits('15', 'gwei'), // 15 gwei
        mediumThreshold: ethers.parseUnits('25', 'gwei'), // 25 gwei
        highThreshold: ethers.parseUnits('50', 'gwei'), // 50 gwei
        priority: 'medium'
      },
      {
        network: 'bsc',
        lowThreshold: ethers.parseUnits('3', 'gwei'), // 3 gwei
        mediumThreshold: ethers.parseUnits('5', 'gwei'), // 5 gwei
        highThreshold: ethers.parseUnits('10', 'gwei'), // 10 gwei
        priority: 'low'
      },
      {
        network: 'polygon',
        lowThreshold: ethers.parseUnits('20', 'gwei'), // 20 gwei
        mediumThreshold: ethers.parseUnits('30', 'gwei'), // 30 gwei
        highThreshold: ethers.parseUnits('60', 'gwei'), // 60 gwei
        priority: 'medium'
      }
    ],
    slackChannel: '#gas-alerts',
    enableNotifications: true,
    maxAlertsPerHour: 10,
    gasPriceHistory: true
  };

  private constructor() {
    this.gasFeeService = GasFeeService.getInstance();
    this.slackService = SlackService.getInstance();
  }

  public static getInstance(): GasMonitorService {
    if (!GasMonitorService.instance) {
      GasMonitorService.instance = new GasMonitorService();
    }
    return GasMonitorService.instance;
  }

  /**
   * Start gas fee monitoring
   */
  public async startMonitoring(customConfig?: Partial<GasMonitorConfig>): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...customConfig };
    
    console.log('🚀 Starting Gas Fee Monitoring Service...');
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
    await this.checkGasPrices(finalConfig);

    // Set up monitoring interval
    this.monitoringInterval = setInterval(async () => {
      await this.checkGasPrices(finalConfig);
    }, finalConfig.checkInterval);

    console.log('✅ Gas Fee Monitoring Service started successfully');
  }

  /**
   * Stop gas fee monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('⏹️  Gas Fee Monitoring Service stopped');
    }
  }

  /**
   * Check gas prices across all enabled networks
   */
  private async checkGasPrices(config: GasMonitorConfig): Promise<void> {
    console.log(`\n⛽ Checking gas prices at ${new Date().toISOString()}`);

    // Reset alert count if an hour has passed
    const now = Date.now();
    if (now - this.lastResetTime > 3600000) { // 1 hour
      this.alertCount.clear();
      this.lastResetTime = now;
    }

    const alerts: GasAlert[] = [];

    for (const network of config.enabledNetworks) {
      try {
        const threshold = config.thresholds.find(t => t.network === network);
        if (!threshold) {
          console.warn(`⚠️  No threshold configured for network: ${network}`);
          continue;
        }

        // Get current gas prices
        const gasPrices = await this.gasFeeService.getNetworkGasPrice(network);
        const currentGasPrice = gasPrices.standard; // Use standard price for monitoring

        // Store in history if enabled
        if (config.gasPriceHistory) {
          this.storeGasPriceHistory(network, currentGasPrice);
        }

        // Check for low gas price alerts
        const alert = this.checkForLowGasAlert(network, currentGasPrice, threshold, config);
        if (alert) {
          alerts.push(alert);
        }

        // Log current prices
        console.log(`   ${network.toUpperCase()}: ${ethers.formatUnits(currentGasPrice, 'gwei')} gwei`);

      } catch (error) {
        console.error(`❌ Error checking gas prices for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Send alerts if any and notifications are enabled
    if (alerts.length > 0 && config.enableNotifications) {
      await this.sendGasAlerts(alerts, config);
    }

    console.log(`   Check completed. Alerts: ${alerts.length}`);
  }

  /**
   * Check if current gas price is low enough to trigger an alert
   */
  private checkForLowGasAlert(
    network: string,
    currentGasPrice: bigint,
    threshold: GasThreshold,
    config: GasMonitorConfig
  ): GasAlert | null {
    const alertKey = `${network}-low-gas`;
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

    // Determine priority based on how low the gas price is
    let priority: 'low' | 'medium' | 'high' = 'low';
    let thresholdToUse = threshold.lowThreshold;

    if (currentGasPrice <= threshold.lowThreshold) {
      priority = 'high';
      thresholdToUse = threshold.lowThreshold;
    } else if (currentGasPrice <= threshold.mediumThreshold) {
      priority = 'medium';
      thresholdToUse = threshold.mediumThreshold;
    } else if (currentGasPrice <= threshold.highThreshold) {
      priority = 'low';
      thresholdToUse = threshold.highThreshold;
    } else {
      return null; // Gas price is not low enough
    }

    // Calculate savings
    const savings = thresholdToUse - currentGasPrice;
    const savingsGwei = ethers.formatUnits(savings, 'gwei');

    const alert: GasAlert = {
      network,
      currentGasPrice,
      threshold: thresholdToUse,
      gasPriceGwei: ethers.formatUnits(currentGasPrice, 'gwei'),
      thresholdGwei: ethers.formatUnits(thresholdToUse, 'gwei'),
      savings: savingsGwei,
      timestamp: now,
      priority
    };

    // Update tracking
    this.lastAlerts.set(alertKey, now);
    this.alertCount.set(alertKey, alertCount + 1);

    return alert;
  }

  /**
   * Send gas alerts to Slack
   */
  private async sendGasAlerts(alerts: GasAlert[], config: GasMonitorConfig): Promise<void> {
    try {
      const alertBlocks = alerts.map(alert => this.createSlackAlertBlock(alert));
      
      const message = {
        channel: config.slackChannel,
        text: `🎯 Low Gas Price Alert - ${alerts.length} network(s)`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🎯 Low Gas Price Alert - ${alerts.length} network(s)`,
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
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '💡 *Tip:* Consider executing transfers now to save on gas fees!'
              }
            ]
          }
        ]
      };

      await this.slackService.sendMessage(message);
      console.log(`📤 Sent ${alerts.length} gas alert(s) to Slack`);

    } catch (error) {
      console.error(`❌ Failed to send gas alerts to Slack: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Slack block for a single gas alert
   */
  private createSlackAlertBlock(alert: GasAlert): any[] {
    const priorityEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🔴'
    };

    return [
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*${priorityEmoji[alert.priority]} ${alert.network.toUpperCase()}*\n${alert.gasPriceGwei} gwei`
          },
          {
            type: 'mrkdwn',
            text: `*Threshold:* ${alert.thresholdGwei} gwei\n*Savings:* ${alert.savings} gwei`
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Priority:* ${alert.priority.toUpperCase()} | *Time:* ${new Date(alert.timestamp).toLocaleTimeString()}`
          }
        ]
      }
    ];
  }

  /**
   * Get the highest priority from alerts
   */
  private getHighestPriority(alerts: GasAlert[]): string {
    const priorities = ['low', 'medium', 'high'];
    const highestPriority = alerts.reduce((highest, alert) => {
      const currentIndex = priorities.indexOf(alert.priority);
      const highestIndex = priorities.indexOf(highest);
      return currentIndex > highestIndex ? alert.priority : highest;
    }, 'low' as string);

    return highestPriority.toUpperCase();
  }

  /**
   * Store gas price in history
   */
  private storeGasPriceHistory(network: string, gasPrice: bigint): void {
    const now = Date.now();
    const history = this.gasPriceHistory.get(network) || [];
    
    // Add new entry
    history.push({ price: gasPrice, timestamp: now });
    
    // Keep only last 24 hours of data (288 entries for 5-minute intervals)
    const oneDayAgo = now - 86400000;
    const filteredHistory = history.filter(entry => entry.timestamp > oneDayAgo);
    
    this.gasPriceHistory.set(network, filteredHistory);
  }

  /**
   * Get gas price history for a network
   */
  public getGasPriceHistory(network: string, hours: number = 24): Array<{ price: bigint; timestamp: number }> {
    const history = this.gasPriceHistory.get(network) || [];
    const cutoffTime = Date.now() - (hours * 3600000);
    return history.filter(entry => entry.timestamp > cutoffTime);
  }

  /**
   * Get gas price statistics
   */
  public getGasPriceStats(network: string, hours: number = 24): {
    min: bigint;
    max: bigint;
    average: bigint;
    current: bigint;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    const history = this.getGasPriceHistory(network, hours);
    
    if (history.length === 0) {
      return {
        min: BigInt(0),
        max: BigInt(0),
        average: BigInt(0),
        current: BigInt(0),
        trend: 'stable'
      };
    }

    const prices = history.map(entry => entry.price);
    const min = prices.reduce((a, b) => a < b ? a : b);
    const max = prices.reduce((a, b) => a > b ? a : b);
    const sum = prices.reduce((a, b) => a + b, BigInt(0));
    const average = sum / BigInt(prices.length);
    const current = history[history.length - 1]?.price || BigInt(0);

    // Determine trend (compare last 3 entries)
    const recentEntries = history.slice(-3);
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (recentEntries.length >= 2) {
      const first = recentEntries[0]?.price || BigInt(0);
      const last = recentEntries[recentEntries.length - 1]?.price || BigInt(0);
      const change = Number(last - first);
      
      if (change > 0) trend = 'increasing';
      else if (change < 0) trend = 'decreasing';
    }

    return { min, max, average, current, trend };
  }

  /**
   * Manually trigger a gas price check
   */
  public async manualCheck(customConfig?: Partial<GasMonitorConfig>): Promise<GasAlert[]> {
    const finalConfig = { ...this.defaultConfig, ...customConfig };
    const alerts: GasAlert[] = [];

    for (const network of finalConfig.enabledNetworks) {
      try {
        const threshold = finalConfig.thresholds.find(t => t.network === network);
        if (!threshold) continue;

        const gasPrices = await this.gasFeeService.getNetworkGasPrice(network);
        const currentGasPrice = gasPrices.standard;

        const alert = this.checkForLowGasAlert(network, currentGasPrice, threshold, finalConfig);
        if (alert) {
          alerts.push(alert);
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
  public updateConfig(newConfig: Partial<GasMonitorConfig>): void {
    Object.assign(this.defaultConfig, newConfig);
    console.log('⚙️  Gas monitoring configuration updated');
  }

  /**
   * Clear alert history
   */
  public clearAlertHistory(): void {
    this.lastAlerts.clear();
    this.alertCount.clear();
    console.log('🗑️  Alert history cleared');
  }
} 