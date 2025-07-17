import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';

const router = Router();
const walletController = new WalletController();

/**
 * POST /api/deposit-wallets
 * Generate wallets for all supported chains for a given user
 */
router.post(
  '/deposit-wallets',
  WalletController.validateWalletGeneration,
  walletController.generateWallets
);

/**
 * GET /api/deposit-wallets/:userId
 * Get existing wallet addresses for a user
 */
router.get(
  '/deposit-wallets/:userId',
  walletController.getWalletAddresses
);

/**
 * GET /api/deposit-wallets/:userId/:network
 * Get wallet information for a specific network
 */
router.get(
  '/deposit-wallets/:userId/:network',
  WalletController.validateNetworkWallet,
  walletController.getNetworkWallet
);

/**
 * GET /api/deposit-wallets/:userId/qr-codes
 * Get QR codes for user wallets
 */
router.get(
  '/deposit-wallets/:userId/qr-codes',
  walletController.getWalletQRCodes
);

/**
 * POST /api/deposits/check
 * Manually trigger deposit check
 */
router.post(
  '/deposits/check',
  walletController.manualDepositCheck
);

/**
 * GET /api/deposits/status
 * Get deposit monitoring status
 */
router.get(
  '/deposits/status',
  walletController.getDepositStatus
);

export default router; 