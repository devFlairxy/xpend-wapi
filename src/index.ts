import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import { config, validateConfig } from './config';
import { securityMiddleware } from './middleware/security';
import walletRoutes from './routes/wallet.routes';
import depositWatchRoutes from './routes/deposit-watch.routes';
import { DepositWatchService } from './services/deposit-watch.service';

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(securityMiddleware.cors);
    this.app.use(securityMiddleware.helmet);
    this.app.use(securityMiddleware.rateLimit);
    
    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Compression
    this.app.use(compression());
    
    // Logging
    this.app.use(morgan('combined'));
    this.app.use(securityMiddleware.requestLogger);
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.status(200).json({
        success: true,
        message: 'USDT Deposit Backend is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });

    // API routes with API key validation
    this.app.use('/api', securityMiddleware.validateApiKey, walletRoutes);
    this.app.use('/api/deposit-watch', securityMiddleware.validateApiKey, depositWatchRoutes);
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(securityMiddleware.notFoundHandler);
    
    // Global error handler
    this.app.use(securityMiddleware.errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();

      const port = config.server.port;
      
      this.app.listen(port, () => {
        console.log(`🚀 USDT Deposit Backend server running on port ${port}`);
        console.log(`📊 Environment: ${config.server.nodeEnv}`);
        console.log(`🔗 Health check: http://localhost:${port}/health`);
        console.log(`💳 Wallet API: http://localhost:${port}/api/deposit-wallets`);
        console.log(`⏰ Deposit Watch API: http://localhost:${port}/api/deposit-watch`);
      });

      // Initialize deposit watch service (user-initiated monitoring only)
      DepositWatchService.getInstance();
      console.log('⏰ Deposit watch service started (user-initiated monitoring only)');
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the application
const app = new App();
app.start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

export default app; 