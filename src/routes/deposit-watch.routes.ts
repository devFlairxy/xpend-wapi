import { Router } from 'express';
import { DepositWatchController } from '../controllers/deposit-watch.controller';

const router = Router();
const depositWatchController = new DepositWatchController();

/**
 * POST /api/deposit-watch
 * Start watching a user's wallet for deposits
 */
router.post(
  '/',
  DepositWatchController.validateStartDepositWatch,
  depositWatchController.startDepositWatch
);

/**
 * DELETE /api/deposit-watch/:watchId
 * Stop watching a specific deposit
 */
router.delete(
  '/:watchId',
  DepositWatchController.validateStopDepositWatch,
  depositWatchController.stopDepositWatch
);

/**
 * GET /api/deposit-watch/user/:userId
 * Get all active deposit watches for a user
 */
router.get(
  '/user/:userId',
  DepositWatchController.validateGetUserWatches,
  depositWatchController.getUserDepositWatches
);

/**
 * POST /api/deposit-watch/:watchId/complete
 * Manually complete a deposit check (for testing)
 */
router.post(
  '/:watchId/complete',
  DepositWatchController.validateManualComplete,
  depositWatchController.manuallyCompleteDeposit
);

/**
 * GET /api/deposit-watch/stats
 * Get monitoring statistics
 */
router.get(
  '/stats',
  depositWatchController.getMonitoringStats
);

export default router; 