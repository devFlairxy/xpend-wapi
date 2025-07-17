import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { DepositWatchService } from '../services/deposit-watch.service';
import { DepositWatchRequest, ApiResponse, DepositWatchResponse } from '../types';

export class DepositWatchController {
  private depositWatchService: DepositWatchService;

  constructor() {
    this.depositWatchService = DepositWatchService.getInstance();
  }

  /**
   * POST /api/deposit-watch
   * Start watching a user's wallet for deposits
   */
  public startDepositWatch = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const response: ApiResponse<null> = {
          success: false,
          error: 'Validation failed',
          message: firstError?.msg || 'Validation error',
        };
        res.status(400).json(response);
        return;
      }

      const watchRequest: DepositWatchRequest = req.body;

      // Start the deposit watch
      const depositWatch = await this.depositWatchService.startDepositWatch(watchRequest);

      const response: ApiResponse<DepositWatchResponse> = {
        success: true,
        data: depositWatch,
        message: 'Deposit watch started successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Start deposit watch error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * DELETE /api/deposit-watch/:watchId
   * Stop watching a specific deposit
   */
  public stopDepositWatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const response: ApiResponse<null> = {
          success: false,
          error: 'Validation failed',
          message: firstError?.msg || 'Validation error',
        };
        res.status(400).json(response);
        return;
      }

      const { watchId } = req.params;

      if (!watchId) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Watch ID is required',
        };
        res.status(400).json(response);
        return;
      }

      await this.depositWatchService.stopDepositWatch(watchId);

      const response: ApiResponse<null> = {
        success: true,
        message: 'Deposit watch stopped successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Stop deposit watch error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * GET /api/deposit-watch/user/:userId
   * Get all active deposit watches for a user
   */
  public getUserDepositWatches = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const response: ApiResponse<null> = {
          success: false,
          error: 'Validation failed',
          message: firstError?.msg || 'Validation error',
        };
        res.status(400).json(response);
        return;
      }

      const { userId } = req.params;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'User ID is required',
        };
        res.status(400).json(response);
        return;
      }

      const watches = await this.depositWatchService.getUserDepositWatches(userId);

      const response: ApiResponse<DepositWatchResponse[]> = {
        success: true,
        data: watches,
        message: `Found ${watches.length} active deposit watches`,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get user deposit watches error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * POST /api/deposit-watch/:watchId/complete
   * Manually complete a deposit check (for testing)
   */
  public manuallyCompleteDeposit = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const response: ApiResponse<null> = {
          success: false,
          error: 'Validation failed',
          message: firstError?.msg || 'Validation error',
        };
        res.status(400).json(response);
        return;
      }

      const { watchId } = req.params;
      const { actualAmount } = req.body;

      if (!watchId) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Watch ID is required',
        };
        res.status(400).json(response);
        return;
      }

      await this.depositWatchService.manuallyCompleteDeposit(watchId, actualAmount);

      const response: ApiResponse<null> = {
        success: true,
        message: '✅ Deposit check completed manually - monitoring stopped',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Manual deposit completion error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * GET /api/deposit-watch/stats
   * Get monitoring statistics
   */
  public getMonitoringStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.depositWatchService.getMonitoringStats();

      const response: ApiResponse<typeof stats> = {
        success: true,
        data: stats,
        message: 'Monitoring statistics retrieved successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get monitoring stats error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Validation middleware for starting deposit watch
   */
  public static validateStartDepositWatch = [
    body('userId')
      .isString()
      .withMessage('userId must be a string')
      .notEmpty()
      .withMessage('userId cannot be empty')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('userId must be between 1 and 100 characters'),
    body('network')
      .isString()
      .withMessage('network must be a string')
      .isIn(['ethereum', 'bsc', 'polygon', 'solana', 'tron'])
      .withMessage('network must be one of: ethereum, bsc, polygon, solana, tron'),
    body('expectedAmount')
      .isString()
      .withMessage('expectedAmount must be a string')
      .notEmpty()
      .withMessage('expectedAmount cannot be empty')
      .matches(/^\d+(\.\d+)?$/)
      .withMessage('expectedAmount must be a valid number'),
    body('webhookUrl')
      .optional()
      .isURL()
      .withMessage('webhookUrl must be a valid URL'),
  ];

  /**
   * Validation middleware for stopping deposit watch
   */
  public static validateStopDepositWatch = [
    param('watchId')
      .isString()
      .withMessage('watchId must be a string')
      .notEmpty()
      .withMessage('watchId cannot be empty')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('watchId must be valid'),
  ];

  /**
   * Validation middleware for getting user deposit watches
   */
  public static validateGetUserWatches = [
    param('userId')
      .isString()
      .withMessage('userId must be a string')
      .notEmpty()
      .withMessage('userId cannot be empty')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('userId must be between 1 and 100 characters'),
  ];

  /**
   * Validation middleware for manually completing deposit
   */
  public static validateManualComplete = [
    param('watchId')
      .isString()
      .withMessage('watchId must be a string')
      .notEmpty()
      .withMessage('watchId cannot be empty')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('watchId must be valid'),
    body('actualAmount')
      .optional()
      .isString()
      .withMessage('actualAmount must be a string')
      .matches(/^\d+(\.\d+)?$/)
      .withMessage('actualAmount must be a valid number'),
  ];
} 