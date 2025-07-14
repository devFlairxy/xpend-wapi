import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Security middleware configuration
 */
export const securityMiddleware = {
  /**
   * CORS configuration
   */
  cors: cors({
    origin: process.env['NODE_ENV'] === 'production' 
      ? ['https://your-frontend-domain.com'] 
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  }),

  /**
   * Helmet security headers
   */
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),

  /**
   * Rate limiting
   */
  rateLimit: rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  /**
   * API key validation middleware
   */
  validateApiKey: (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key is required',
      });
      return;
    }

    // In production, validate against a database or secure storage
    if (apiKey !== config.security.apiKeySecret) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

    next();
  },

  /**
   * Request logging middleware
   */
  requestLogger: (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });

    next();
  },

  /**
   * Error handling middleware
   */
  errorHandler: (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('Error:', err);

    res.status(500).json({
      success: false,
      error: process.env['NODE_ENV'] === 'production' 
        ? 'Internal server error' 
        : err.message,
    });
  },

  /**
   * 404 handler
   */
  notFoundHandler: (_req: Request, res: Response): void => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
    });
  },
}; 