import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';

const router = Router();
const walletController = new WalletController();

/**
 * POST /api/deposit-wallets
 * Generate a disposable wallet for a specific user and network
 */
router.post(
  '/deposit-wallets',
  WalletController.validateWalletGeneration,
  walletController.generateDisposableWallet
);

/**
 * GET /api/deposit-wallets/:userId/:network
 * Get existing wallet address for a specific user and network
 */
router.get(
  '/deposit-wallets/:userId/:network',
  WalletController.validateNetworkWallet,
  walletController.getNetworkWallet
);

/**
 * GET /api/deposit-wallets/:userId/:network/qr
 * Get QR code for a specific wallet
 */
router.get(
  '/deposit-wallets/:userId/:network/qr',
  WalletController.validateNetworkWallet,
  walletController.getWalletQRCode
);

/**
 * POST /api/deposit-wallets/:userId/:network/check
 * Manually check for deposits on a specific wallet
 */
router.post(
  '/deposit-wallets/:userId/:network/check',
  WalletController.validateNetworkWallet,
  walletController.manualDepositCheck
);

/**
 * GET /api/deposit-wallets/:userId/:network/status
 * Get deposit status for a specific wallet
 */
router.get(
  '/deposit-wallets/:userId/:network/status',
  WalletController.validateNetworkWallet,
  walletController.getDepositStatus
);

export default router; 