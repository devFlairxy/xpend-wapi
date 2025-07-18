import axios from 'axios';

export interface SlackMessage {
  channel: string;
  text: string;
  blocks?: any[];
  attachments?: any[];
}

export interface SlackAlert {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  timestamp?: number;
}

export class SlackService {
  private static instance: SlackService;
  private webhookUrl: string;
  private isEnabled: boolean;

  private constructor() {
    this.webhookUrl = process.env['SLACK_WEBHOOK_URL'] || '';
    this.isEnabled = !!this.webhookUrl && this.webhookUrl.length > 0;
  }

  public static getInstance(): SlackService {
    if (!SlackService.instance) {
      SlackService.instance = new SlackService();
    }
    return SlackService.instance;
  }

  /**
   * Send a message to Slack
   */
  public async sendMessage(message: SlackMessage): Promise<boolean> {
    if (!this.isEnabled) {
      console.warn('⚠️  Slack notifications are disabled. Set SLACK_WEBHOOK_URL to enable.');
      return false;
    }

    try {
      const payload = {
        channel: message.channel,
        text: message.text,
        ...(message.blocks && { blocks: message.blocks }),
        ...(message.attachments && { attachments: message.attachments })
      };

      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      if (response.status === 200) {
        console.log(`✅ Slack message sent to ${message.channel}`);
        return true;
      } else {
        console.error(`❌ Failed to send Slack message: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error sending Slack message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Send a simple text alert
   */
  public async sendAlert(alert: SlackAlert): Promise<boolean> {
    const colorMap = {
      info: '#36a64f',
      warning: '#ff8c00',
      error: '#ff0000',
      success: '#36a64f'
    };

    const attachment = {
      color: colorMap[alert.type],
      title: alert.title,
      text: alert.message,
      ...(alert.fields && { fields: alert.fields }),
      ...(alert.timestamp && { ts: alert.timestamp })
    };

    const message: SlackMessage = {
      channel: '#alerts',
      text: `${alert.title}: ${alert.message}`,
      attachments: [attachment]
    };

    return this.sendMessage(message);
  }

  /**
   * Send a gas price alert
   */
  public async sendGasAlert(network: string, currentPrice: string, threshold: string, savings: string): Promise<boolean> {
    const alert: SlackAlert = {
      type: 'info',
      title: '🎯 Low Gas Price Alert',
      message: `Gas prices are low on ${network.toUpperCase()}`,
      fields: [
        { title: 'Network', value: network.toUpperCase(), short: true },
        { title: 'Current Price', value: `${currentPrice} gwei`, short: true },
        { title: 'Threshold', value: `${threshold} gwei`, short: true },
        { title: 'Potential Savings', value: `${savings} gwei`, short: true }
      ],
      timestamp: Math.floor(Date.now() / 1000)
    };

    return this.sendAlert(alert);
  }

  /**
   * Send a system notification
   */
  public async sendSystemNotification(title: string, message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<boolean> {
    const alert: SlackAlert = {
      type,
      title,
      message,
      timestamp: Math.floor(Date.now() / 1000)
    };

    return this.sendAlert(alert);
  }

  /**
   * Send a startup notification
   */
  public async sendStartupNotification(): Promise<boolean> {
    const message: SlackMessage = {
      channel: '#system',
      text: '🚀 Wallet API Service Started',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 Wallet API Service Started',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Environment:* ${process.env['NODE_ENV'] || 'development'}\n*Timestamp:* ${new Date().toISOString()}`
          }
        }
      ]
    };

    return this.sendMessage(message);
  }

  /**
   * Send a critical alert
   */
  public async sendCriticalAlert(title: string, message: string, error?: Error): Promise<boolean> {
    const alert: SlackAlert = {
      type: 'error',
      title: `🚨 ${title}`,
      message: error ? `${message}\n\nError: ${error.message}` : message,
      timestamp: Math.floor(Date.now() / 1000)
    };

    return this.sendAlert(alert);
  }

  /**
   * Check if Slack is enabled
   */
  public isSlackEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get Slack configuration status
   */
  public getStatus(): {
    enabled: boolean;
    webhookConfigured: boolean;
    lastTest?: number;
  } {
    return {
      enabled: this.isEnabled,
      webhookConfigured: this.webhookUrl.length > 0
    };
  }

  /**
   * Test Slack connectivity
   */
  public async testConnection(): Promise<boolean> {
    if (!this.isEnabled) {
      console.warn('⚠️  Slack is not enabled');
      return false;
    }

    try {
      const testMessage: SlackMessage = {
        channel: '#test',
        text: '🧪 Slack connectivity test',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'This is a test message to verify Slack connectivity.'
            }
          }
        ]
      };

      const success = await this.sendMessage(testMessage);
      if (success) {
        console.log('✅ Slack connectivity test successful');
      }
      return success;
    } catch (error) {
      console.error(`❌ Slack connectivity test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
} 