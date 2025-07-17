import { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { WalletGenerationRequest, WalletGenerationResponse, ApiResponse, NetworkWalletResponse, SupportedNetwork } from '../types';
import { body, validationResult, param } from 'express-validator';

export class WalletController {
  private walletService: WalletService;

  constructor() {
    this.walletService = WalletService.getInstance();
  }

  /**
   * POST /api/deposit-wallets
   * Generate a disposable wallet for a specific user and network
   */
  public generateDisposableWallet = async (req: Request, res: Response): Promise<void> => {
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

      const { userId, network }: WalletGenerationRequest = req.body;

      // Validate wallet generation request
      this.walletService.validateWalletRequest(userId, network);
      
      // Generate or get existing wallet for the specific network
      const walletInfo = await this.walletService.generateDisposableWallet(userId, network);

      // Return only the address and QR code for security
      const responseData: WalletGenerationResponse = {
        network: network as SupportedNetwork,
        address: walletInfo.address,
        ...(walletInfo.qrCode && { qrCode: walletInfo.qrCode }),
      };

      const response: ApiResponse<WalletGenerationResponse> = {
        success: true,
        data: responseData,
        message: 'Disposable wallet generated successfully',
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
   * GET /api/deposit-wallets/:userId/:network
   * Get existing wallet address for a specific user and network
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
          error: 'No wallet found for this user and network',
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
   * GET /api/deposit-wallets/:userId/:network/qr
   * Get QR code for a specific wallet
   */
  public getWalletQRCode = async (req: Request, res: Response): Promise<void> => {
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

      if (!userId || !network) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid userId or network provided',
        };
        res.status(400).json(response);
        return;
      }

      const walletInfo = await this.walletService.getNetworkWallet(userId, network);

      if (!walletInfo) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No wallet found for this user and network',
        };
        res.status(404).json(response);
        return;
      }

      if (!walletInfo.qrCode) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'QR code not available for this wallet',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse<{ qrCode: string }> = {
        success: true,
        data: { qrCode: walletInfo.qrCode },
        message: `QR code for ${network} wallet retrieved successfully`,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get wallet QR code error:', error);
      
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      res.status(500).json(response);
    }
  };

  /**
   * POST /api/deposit-wallets/:userId/:network/check
   * Manually check for deposits on a specific wallet
   */
  public manualDepositCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, network } = req.params;

      if (!userId || !network) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid userId or network provided',
        };
        res.status(400).json(response);
        return;
      }

      // For now, return a placeholder response since DepositDetectionService doesn't have these methods
      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Manual deposit check not implemented yet' },
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
   * GET /api/deposit-wallets/:userId/:network/status
   * Get deposit status for a specific wallet
   */
  public getDepositStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, network } = req.params;

      if (!userId || !network) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Invalid userId or network provided',
        };
        res.status(400).json(response);
        return;
      }

      // For now, return a placeholder response since DepositDetectionService doesn't have these methods
      const response: ApiResponse<{ status: string }> = {
        success: true,
        data: { status: 'Deposit status not implemented yet' },
        message: 'Deposit status retrieved successfully',
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

  // Validation middleware
  public static validateWalletGeneration = [
    body('userId')
      .isString()
      .notEmpty()
      .withMessage('userId must be a non-empty string'),
    body('network')
      .isString()
      .isIn(['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'])
      .withMessage('network must be one of: ethereum, bsc, polygon, solana, tron, busd'),
  ];

  public static validateNetworkWallet = [
    param('userId')
      .isString()
      .notEmpty()
      .withMessage('userId must be a non-empty string'),
    param('network')
      .isString()
      .isIn(['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'])
      .withMessage('network must be one of: ethereum, bsc, polygon, solana, tron, busd'),
  ];
} 