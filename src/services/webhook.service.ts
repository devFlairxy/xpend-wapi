import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import { DepositWebhookPayload } from '../types';

export class WebhookService {
  private static instance: WebhookService;

  private constructor() {}

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: string): string {
    const hmac = crypto.createHmac('sha256', config.webhook.sharedSecret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Send webhook to custom URL with custom payload
   */
  public async sendWebhook(
    url: string, 
    payload: any, 
    secret?: string
  ): Promise<{ success: boolean; statusCode?: number; response?: string; error?: string }> {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = secret ? this.generateSignatureWithSecret(payloadString, secret) : this.generateSignature(payloadString);

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-API-Signature': signature,
          'User-Agent': 'USDT-Deposit-Backend/1.0.0',
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`✅ Webhook sent successfully to ${url}`);
        return {
          success: true,
          statusCode: response.status,
          response: response.data,
        };
      } else {
        console.error(`❌ Webhook failed with status ${response.status} for ${url}`);
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      console.error(`❌ Webhook error for ${url}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate HMAC-SHA256 signature with custom secret
   */
  private generateSignatureWithSecret(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Send deposit webhook notification
   */
  public async sendDepositWebhook(depositData: DepositWebhookPayload): Promise<boolean> {
    try {
      if (!config.webhook.depositUrl) {
        console.warn('DEPOSIT_WEBHOOK_URL not configured, skipping webhook');
        return false;
      }

      const payload = JSON.stringify(depositData);
      const signature = this.generateSignature(payload);

      const response = await axios.post(config.webhook.depositUrl, depositData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
          'User-Agent': 'USDT-Deposit-Backend/1.0.0',
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`✅ Webhook sent successfully for deposit ${depositData.txId}`);
        return true;
      } else {
        console.error(`❌ Webhook failed with status ${response.status} for deposit ${depositData.txId}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Webhook error for deposit ${depositData.txId}:`, error);
      return false;
    }
  }

  /**
   * Send deposit webhook with retry logic
   */
  public async sendDepositWebhookWithRetry(
    depositData: DepositWebhookPayload, 
    maxRetries: number = 3
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const success = await this.sendDepositWebhook(depositData);
        if (success) {
          return true;
        }

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`🔄 Retrying webhook in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`❌ Webhook attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Validate webhook signature (for incoming webhooks)
   */
  public validateWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = this.generateSignature(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Test webhook connectivity
   */
  public async testWebhookConnection(): Promise<boolean> {
    try {
      if (!config.webhook.depositUrl) {
        console.warn('DEPOSIT_WEBHOOK_URL not configured');
        return false;
      }

      const testPayload: DepositWebhookPayload = {
        userId: 'test-user',
        amount: '0',
        currency: 'USDT',
        network: 'test',
        txId: 'test-tx-id',
        wallet: 'test-wallet',
      };

      const success = await this.sendDepositWebhook(testPayload);
      return success;
    } catch (error) {
      console.error('❌ Webhook connection test failed:', error);
      return false;
    }
  }
} 