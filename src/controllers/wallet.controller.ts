import { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { DepositDetectionService } from '../services/deposit-detection.service';
import { WalletGenerationRequest, WalletGenerationResponse, ApiResponse, NetworkWalletResponse, SupportedNetwork } from '../types';
import { body, validationResult, param } from 'express-validator';

export class WalletController {
  private walletService: WalletService;
  private depositDetectionService: DepositDetectionService;

  constructor() {
    this.walletService = WalletService.getInstance();
    this.depositDetectionService = DepositDetectionService.getInstance();
  }

  /**
   * POST /api/deposit-wallets
   * Generate wallets for all supported chains for a given user
   */
  public generateWallets = async (req: Request, res: Response): Promise<void> => {
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

      const { userId }: WalletGenerationRequest = req.body;

      // Check if user already has wallets first
      let userWallets = await this.walletService.getUserWallets(userId);
      let isNewWallet = false;
      
      if (!userWallets) {
        // Validate wallet generation request
        this.walletService.validateWalletRequest(userId);
        
        // Generate wallets for all chains
        userWallets = await this.walletService.generateWallets(userId);
        isNewWallet = true;
      }

      // Return only the addresses for security
      const walletAddresses: WalletGenerationResponse = {
        ethereum: userWallets.ethereum.address,
        bsc: userWallets.bsc.address,
        polygon: userWallets.polygon.address,
        solana: userWallets.solana.address,
        tron: userWallets.tron.address,
      };

      const response: ApiResponse<WalletGenerationResponse> = {
        success: true,
        data: walletAddresses,
        message: isNewWallet ? 'Wallets generated successfully' : 'Wallets retrieved successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Wallet generation error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * GET /api/deposit-wallets/:userId
   * Get existing wallet addresses for a user
   */
  public getWalletAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid userId provided',
        };
        res.status(400).json(response);
        return;
      }

      const walletAddresses = await this.walletService.getWalletAddresses(userId);

      if (!walletAddresses) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No wallets found for this user',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse<WalletGenerationResponse> = {
        success: true,
        data: walletAddresses,
        message: 'Wallets retrieved successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get wallet addresses error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * GET /api/deposit-wallets/:userId/:network
   * Get wallet information for a specific network
   */
  public getNetworkWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request parameters
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

      const { userId, network } = req.params;

      if (!userId || typeof userId !== 'string') {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid userId provided',
        };
        res.status(400).json(response);
        return;
      }

      if (!network || typeof network !== 'string') {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid network provided',
        };
        res.status(400).json(response);
        return;
      }

      const walletInfo = await this.walletService.getNetworkWallet(userId, network);

      if (!walletInfo) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No wallets found for this user',
        };
        res.status(404).json(response);
        return;
      }

      const responseData: NetworkWalletResponse = {
        network: network as SupportedNetwork,
        address: walletInfo.address,
        ...(walletInfo.qrCode && { qrCode: walletInfo.qrCode }),
      };

      const response: ApiResponse<NetworkWalletResponse> = {
        success: true,
        data: responseData,
        message: `Wallet for ${network} retrieved successfully`,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get network wallet error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * GET /api/deposit-wallets/:userId/qr-codes
   * Get QR codes for user wallets
   */
  public getWalletQRCodes = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid userId provided',
        };
        res.status(400).json(response);
        return;
      }

      const userWallets = await this.walletService.getUserWallets(userId);

      if (!userWallets) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No wallets found for this user',
        };
        res.status(404).json(response);
        return;
      }

      const qrCodes = {
        ethereum: userWallets.ethereum.qrCode,
        bsc: userWallets.bsc.qrCode,
        polygon: userWallets.polygon.qrCode,
        solana: userWallets.solana.qrCode,
        tron: userWallets.tron.qrCode,
      };

      const response: ApiResponse<typeof qrCodes> = {
        success: true,
        data: qrCodes,
        message: 'QR codes retrieved successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get QR codes error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * POST /api/deposits/check
   * Manually trigger deposit check
   */
  public manualDepositCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      await this.depositDetectionService.manualDepositCheck();

      const response: ApiResponse<null> = {
        success: true,
        message: 'Manual deposit check completed',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Manual deposit check error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * GET /api/deposits/status
   * Get deposit monitoring status
   */
  public getDepositStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const isMonitoring = this.depositDetectionService.isMonitoringActive();

      const response: ApiResponse<{ monitoring: boolean }> = {
        success: true,
        data: { monitoring: isMonitoring },
        message: isMonitoring ? 'Deposit monitoring is active' : 'Deposit monitoring is inactive',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get deposit status error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Validation middleware for wallet generation
   */
  public static validateWalletGeneration = [
    body('userId')
      .isString()
      .withMessage('userId must be a string')
      .notEmpty()
      .withMessage('userId cannot be empty')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('userId must be between 1 and 100 characters'),
  ];

  /**
   * Validation middleware for network wallet endpoint
   */
  public static validateNetworkWallet = [
    param('userId')
      .isString()
      .withMessage('userId must be a string')
      .notEmpty()
      .withMessage('userId cannot be empty')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('userId must be between 1 and 100 characters'),
    param('network')
      .isString()
      .withMessage('network must be a string')
      .isIn(['ethereum', 'bsc', 'polygon', 'solana', 'tron'])
      .withMessage('network must be one of: ethereum, bsc, polygon, solana, tron'),
  ];
} 