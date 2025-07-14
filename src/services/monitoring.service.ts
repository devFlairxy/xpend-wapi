import * as Sentry from '@sentry/node';
import { config } from '../config';

export interface MonitoringMetrics {
  walletGenerationCount: number;
  depositDetectionCount: number;
  webhookDeliveryCount: number;
  forwardTransactionCount: number;
  errorCount: number;
  averageResponseTime: number;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private metrics: MonitoringMetrics = {
    walletGenerationCount: 0,
    depositDetectionCount: 0,
    webhookDeliveryCount: 0,
    forwardTransactionCount: 0,
    errorCount: 0,
    averageResponseTime: 0,
  };

  private constructor() {
    this.initializeSentry();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Initialize Sentry monitoring
   */
  private initializeSentry(): void {
    if (process.env['SENTRY_DSN']) {
      Sentry.init({
        dsn: process.env['SENTRY_DSN'],
        environment: config.server.nodeEnv,
        tracesSampleRate: config.server.nodeEnv === 'production' ? 0.1 : 1.0,
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Express({ app: require('express') }),
        ],
      });
    }
  }

  /**
   * Capture and report errors
   */
  public captureError(error: Error, context?: Record<string, any>): void {
    console.error('🚨 Error captured:', error.message);
    
    if (process.env['SENTRY_DSN']) {
      Sentry.captureException(error, {
        tags: context || {},
        level: 'error',
      });
    }

    this.metrics.errorCount++;
  }

  /**
   * Capture performance metrics
   */
  public capturePerformance(operation: string, duration: number, tags?: Record<string, any>): void {
    if (process.env['SENTRY_DSN']) {
      Sentry.addBreadcrumb({
        category: 'performance',
        message: `${operation} took ${duration}ms`,
        level: 'info',
        data: tags || {},
      });
    }

    // Update average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime + duration) / 2;
  }

  /**
   * Track wallet generation
   */
  public trackWalletGeneration(userId: string, success: boolean): void {
    this.metrics.walletGenerationCount++;
    
    if (process.env['SENTRY_DSN']) {
      Sentry.addBreadcrumb({
        category: 'wallet',
        message: `Wallet generation ${success ? 'succeeded' : 'failed'} for user ${userId}`,
        level: success ? 'info' : 'error',
      });
    }
  }

  /**
   * Track deposit detection
   */
  public trackDepositDetection(network: string, amount: string, success: boolean): void {
    this.metrics.depositDetectionCount++;
    
    if (process.env['SENTRY_DSN']) {
      Sentry.addBreadcrumb({
        category: 'deposit',
        message: `Deposit detection ${success ? 'succeeded' : 'failed'} on ${network}: ${amount} USDT`,
        level: success ? 'info' : 'error',
      });
    }
  }

  /**
   * Track webhook delivery
   */
  public trackWebhookDelivery(url: string, statusCode: number): void {
    this.metrics.webhookDeliveryCount++;
    
    if (process.env['SENTRY_DSN']) {
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: `Webhook delivery to ${url}: ${statusCode}`,
        level: statusCode >= 200 && statusCode < 300 ? 'info' : 'error',
      });
    }
  }

  /**
   * Track forward transaction
   */
  public trackForwardTransaction(network: string, amount: string, success: boolean): void {
    this.metrics.forwardTransactionCount++;
    
    if (process.env['SENTRY_DSN']) {
      Sentry.addBreadcrumb({
        category: 'forward',
        message: `Forward transaction ${success ? 'succeeded' : 'failed'} on ${network}: ${amount} USDT`,
        level: success ? 'info' : 'error',
      });
    }
  }

  /**
   * Set user context for Sentry
   */
  public setUserContext(userId: string, userData?: Record<string, any>): void {
    if (process.env['SENTRY_DSN']) {
      Sentry.setUser({
        id: userId,
        ...userData,
      });
    }
  }

  /**
   * Set transaction context for Sentry
   */
  public setTransactionContext(operation: string, data?: Record<string, any>): void {
    if (process.env['SENTRY_DSN']) {
      Sentry.setContext('transaction', {
        operation,
        ...data,
      });
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  public resetMetrics(): void {
    this.metrics = {
      walletGenerationCount: 0,
      depositDetectionCount: 0,
      webhookDeliveryCount: 0,
      forwardTransactionCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * Flush Sentry events
   */
  public async flush(): Promise<void> {
    if (process.env['SENTRY_DSN']) {
      await Sentry.flush(2000);
    }
  }
} 