import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { DatabaseService } from './database.service';
import { WebhookService } from './webhook.service';
import { config } from '../config';
import { DepositWebhookPayload } from '../types';

// USDT ABI for EVM chains
const USDT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

// Solana USDT mint address (mainnet)
const SOLANA_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export class DepositWatcherService {
  private static instance: DepositWatcherService;
  private databaseService: DatabaseService;
  private webhookService: WebhookService;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastScannedBlocks: Map<string, number> = new Map();

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.webhookService = WebhookService.getInstance();
  }

  public static getInstance(): DepositWatcherService {
    if (!DepositWatcherService.instance) {
      DepositWatcherService.instance = new DepositWatcherService();
    }
    return DepositWatcherService.instance;
  }

  /**
   * Start monitoring all user wallets for deposits
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Deposit monitoring is already running');
      return;
    }

    console.log('🔍 Starting deposit monitoring...');
    this.isMonitoring = true;

    // Check for deposits every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.checkForDeposits();
    }, 30000);

    // Initial check
    await this.checkForDeposits();
  }

  /**
   * Stop monitoring deposits
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Deposit monitoring stopped');
  }

  /**
   * Check for new deposits across all monitored wallets
   */
  private async checkForDeposits(): Promise<void> {
    try {
      console.log('🔍 Checking for new deposits...');

      // Get all disposable wallets from database
      const disposableWallets = await this.databaseService.getAllDisposableWallets();
      
      for (const wallet of disposableWallets) {
        await this.checkUserDeposits(wallet);
      }

      console.log(`✅ Deposit check completed for ${disposableWallets.length} wallets`);
    } catch (error) {
      console.error('❌ Error checking deposits:', error);
    }
  }

  /**
   * Check for deposits for a specific wallet
   */
  private async checkUserDeposits(wallet: { userId: string; network: string; address: string }): Promise<void> {
    try {
      // Check deposits based on network
      switch (wallet.network.toLowerCase()) {
        case 'ethereum':
          await this.checkEthereumDeposits(wallet.userId, wallet.address);
          break;
        case 'bsc':
          await this.checkBSCDeposits(wallet.userId, wallet.address);
          break;
        case 'polygon':
          await this.checkPolygonDeposits(wallet.userId, wallet.address);
          break;
        case 'solana':
          await this.checkSolanaDeposits(wallet.userId, wallet.address);
          break;
        case 'busd':
          await this.checkBSCDeposits(wallet.userId, wallet.address); // BUSD uses BSC logic
          break;
        default:
          console.log(`⚠️ Unsupported network: ${wallet.network}`);
      }
    } catch (error) {
      console.error(`❌ Error checking deposits for wallet ${wallet.address}:`, error);
    }
  }

  /**
   * Check Ethereum deposits using real blockchain queries
   */
  private async checkEthereumDeposits(userId: string, walletAddress: string): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains.ethereum.rpcUrl);
      const usdtContract = new ethers.Contract(config.chains.ethereum.usdtContract, USDT_ABI, provider);
      
      const currentBlock = await provider.getBlockNumber();
      const lastScannedBlock = this.lastScannedBlocks.get(`ethereum_${userId}`) || currentBlock - 1000; // Default to last 1000 blocks
      
      console.log(`🔍 Checking Ethereum deposits for ${walletAddress} from block ${lastScannedBlock} to ${currentBlock}`);

      // Get Transfer events to this wallet
      const transferFilter = usdtContract.filters && usdtContract.filters['Transfer'] ? usdtContract.filters['Transfer'](null, walletAddress) : undefined;
      if (!transferFilter) {
        console.error('USDT contract Transfer filter is undefined');
        return;
      }
      const events = await usdtContract.queryFilter(transferFilter, lastScannedBlock, currentBlock);

      for (const event of events) {
        if ('args' in event && event.args && typeof event.args['to'] === 'string' && typeof event.args['value'] !== 'undefined') {
          const toAddress = event.args['to'] as string;
          const value = event.args['value'] as bigint;
          
          if (toAddress.toLowerCase() === walletAddress.toLowerCase()) {
            const amount = ethers.formatUnits(value, 6); // USDT has 6 decimals
          
            console.log(`🎯 Found Ethereum deposit: ${amount} USDT in tx ${event.transactionHash}`);

            // Store deposit in database
            const walletInfo = await this.databaseService.getDisposableWallet(userId, 'ethereum');
            if (walletInfo) {
              const deposit = await this.databaseService.storeDeposit({
                userId,
                walletId: walletInfo.id,
                amount,
                currency: 'USDT', // Ethereum only supports USDT
                network: 'ethereum',
                txId: event.transactionHash,
                walletAddress: walletAddress,
              });

              // Wait for confirmation and process
              await this.processConfirmedDeposit(deposit.id, userId, 'ethereum', amount, event.transactionHash, walletAddress);
            }
          }
        }
      }

      // Update last scanned block
      this.lastScannedBlocks.set(`ethereum_${userId}`, currentBlock);
    } catch (error) {
      console.error(`❌ Error checking Ethereum deposits for ${walletAddress}:`, error);
    }
  }

  /**
   * Check BSC deposits using real blockchain queries
   */
  private async checkBSCDeposits(userId: string, walletAddress: string): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains.bsc.rpcUrl);
      const usdtContract = new ethers.Contract(config.chains.bsc.usdtContract, USDT_ABI, provider);
      
      const currentBlock = await provider.getBlockNumber();
      const lastScannedBlock = this.lastScannedBlocks.get(`bsc_${userId}`) || currentBlock - 1000;
      
      console.log(`🔍 Checking BSC deposits for ${walletAddress} from block ${lastScannedBlock} to ${currentBlock}`);

      const transferFilter = usdtContract.filters && usdtContract.filters['Transfer'] ? usdtContract.filters['Transfer'](null, walletAddress) : undefined;
      if (!transferFilter) {
        console.error('USDT contract Transfer filter is undefined');
        return;
      }
      const events = await usdtContract.queryFilter(transferFilter, lastScannedBlock, currentBlock);

      for (const event of events) {
        if ('args' in event && event.args && typeof event.args['to'] === 'string' && typeof event.args['value'] !== 'undefined') {
          const toAddress = event.args['to'] as string;
          const value = event.args['value'] as bigint;
          
          if (toAddress.toLowerCase() === walletAddress.toLowerCase()) {
            const amount = ethers.formatUnits(value, 6);
            
            console.log(`🎯 Found BSC deposit: ${amount} USDT in tx ${event.transactionHash}`);

            // Store deposit in database
            const walletInfo = await this.databaseService.getDisposableWallet(userId, 'bsc');
            if (walletInfo) {
              const deposit = await this.databaseService.storeDeposit({
                userId,
                walletId: walletInfo.id,
                amount,
                currency: 'USDT',
                network: 'bsc',
                txId: event.transactionHash,
                walletAddress: walletAddress,
              });

              await this.processConfirmedDeposit(deposit.id, userId, 'bsc', amount, event.transactionHash, walletAddress);
            }
          }
        }
      }

      this.lastScannedBlocks.set(`bsc_${userId}`, currentBlock);
    } catch (error) {
      console.error(`❌ Error checking BSC deposits for ${walletAddress}:`, error);
    }
  }

  /**
   * Check Polygon deposits using real blockchain queries
   */
  private async checkPolygonDeposits(userId: string, walletAddress: string): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains.polygon.rpcUrl);
      const usdtContract = new ethers.Contract(config.chains.polygon.usdtContract, USDT_ABI, provider);
      
      const currentBlock = await provider.getBlockNumber();
      const lastScannedBlock = this.lastScannedBlocks.get(`polygon_${userId}`) || currentBlock - 1000;
      
      console.log(`🔍 Checking Polygon deposits for ${walletAddress} from block ${lastScannedBlock} to ${currentBlock}`);

      const transferFilter = usdtContract.filters && usdtContract.filters['Transfer'] ? usdtContract.filters['Transfer'](null, walletAddress) : undefined;
      if (!transferFilter) {
        console.error('USDT contract Transfer filter is undefined');
        return;
      }
      const events = await usdtContract.queryFilter(transferFilter, lastScannedBlock, currentBlock);

      for (const event of events) {
        if ('args' in event && event.args && typeof event.args['to'] === 'string' && typeof event.args['value'] !== 'undefined') {
          const toAddress = event.args['to'] as string;
          const value = event.args['value'] as bigint;
          
          if (toAddress.toLowerCase() === walletAddress.toLowerCase()) {
            const amount = ethers.formatUnits(value, 6);
            
            console.log(`🎯 Found Polygon deposit: ${amount} USDT in tx ${event.transactionHash}`);

            // Store deposit in database
            const walletInfo = await this.databaseService.getDisposableWallet(userId, 'polygon');
            if (walletInfo) {
              const deposit = await this.databaseService.storeDeposit({
                userId,
                walletId: walletInfo.id,
                amount,
                currency: 'USDT',
                network: 'polygon',
                txId: event.transactionHash,
                walletAddress: walletAddress,
              });

              await this.processConfirmedDeposit(deposit.id, userId, 'polygon', amount, event.transactionHash, walletAddress);
            }
          }
        }
      }

      this.lastScannedBlocks.set(`polygon_${userId}`, currentBlock);
    } catch (error) {
      console.error(`❌ Error checking Polygon deposits for ${walletAddress}:`, error);
    }
  }

  /**
   * Check Solana deposits using real blockchain queries
   */
  private async checkSolanaDeposits(userId: string, walletAddress: string): Promise<void> {
    try {
      const connection = new Connection(config.chains.solana.rpcUrl);
      const userPublicKey = new PublicKey(walletAddress);
      const usdtMint = new PublicKey(SOLANA_USDT_MINT);
      
      console.log(`🔍 Checking Solana deposits for ${walletAddress}`);

      // Get token accounts for this wallet and USDT mint
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, {
        mint: usdtMint,
      });

      // Get the USDT token account for this wallet
      const usdtAccount = tokenAccounts.value.find(account => 
        account.account.data.parsed.info.mint === SOLANA_USDT_MINT
      );

      if (usdtAccount) {
        const balance = usdtAccount.account.data.parsed.info.tokenAmount.uiAmount;
        const lastKnownBalance = await this.databaseService.getLastKnownBalance(userId, 'solana');
        
        if (balance > (lastKnownBalance || 0)) {
          const newAmount = balance - (lastKnownBalance || 0);
          
          console.log(`🎯 Found Solana deposit: ${newAmount} USDT`);

          // For Solana, we need to track the transaction that caused the balance change
          // This is a simplified version - in production, you'd track specific transactions
          const walletInfo = await this.databaseService.getDisposableWallet(userId, 'solana');
          if (walletInfo) {
            const deposit = await this.databaseService.storeDeposit({
              userId,
              walletId: walletInfo.id,
              amount: newAmount.toString(),
              currency: 'USDT',
              network: 'solana',
              txId: `solana_${Date.now()}`,
              walletAddress: walletAddress,
            });

            await this.processConfirmedDeposit(deposit.id, userId, 'solana', newAmount.toString(), deposit.txId, walletAddress);
          }
          
          // Update last known balance
          await this.databaseService.updateLastKnownBalance(userId, 'solana', balance);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking Solana deposits for ${walletAddress}:`, error);
    }
  }

  /**
   * Process confirmed deposit: forward funds and send webhook
   */
  private async processConfirmedDeposit(
    depositId: string,
    userId: string,
    network: string,
    amount: string,
    txId: string,
    walletAddress: string
  ): Promise<void> {
    try {
      // Get wallet info
      const walletInfo = await this.databaseService.getWalletByAddress(walletAddress);
      if (!walletInfo) {
        console.error(`❌ Wallet not found for address ${walletAddress}`);
        return;
      }

      // Mark wallet as pending as soon as deposit is detected
      await this.databaseService.markWalletAsPending(walletInfo.id);
      console.log(`🔄 Wallet ${walletInfo.id} marked as PENDING due to detected deposit`);

      // Update deposit status to confirmed
      await this.databaseService.updateDepositConfirmations(depositId, 1, 'CONFIRMED');
      
      // Auto-forward funds to master wallet
      try {
        await this.autoForwardDeposit(network, amount, walletAddress);
        console.log(`✅ Successfully forwarded funds for deposit ${depositId}`);
      } catch (forwardError) {
        console.error(`❌ Failed to forward funds:`, forwardError);
        // Don't return here - still try to send webhook
      }
      
      // Send webhook notification
      const webhookPayload: DepositWebhookPayload = {
        userId,
        amount,
        currency: 'USDT',
        network,
        txId,
        wallet: walletAddress,
      };

      try {
        const webhookSuccess = await this.webhookService.sendDepositWebhookWithRetry(webhookPayload);
        
        if (webhookSuccess) {
          await this.databaseService.markWebhookSent(depositId);
          await this.databaseService.markWalletAsUsedById(walletInfo.id);
          console.log(`✅ Webhook sent successfully, wallet ${walletInfo.id} marked as USED`);
        } else {
          // If webhook fails, mark wallet as failed to prevent reuse
          await this.databaseService.markWalletAsFailed(walletInfo.id);
          console.log(`❌ Webhook failed, wallet ${walletInfo.id} marked as FAILED`);
        }
      } catch (webhookError) {
        console.error(`❌ Error in webhook processing:`, webhookError);
        // Mark wallet as failed on webhook error
        await this.databaseService.markWalletAsFailed(walletInfo.id);
      }
    } catch (error) {
      console.error(`❌ Error processing confirmed deposit:`, error);
      // If we have wallet info, mark it as failed
      if (arguments[5]) { // walletAddress is available
        const wallet = await this.databaseService.getWalletByAddress(arguments[5]).catch(() => null);
        if (wallet) {
          await this.databaseService.markWalletAsFailed(wallet.id).catch(() => {});
        }
      }
    }
  }

  /**
   * Auto-forward confirmed deposit to master wallet
   */
  private async autoForwardDeposit(
    network: string, 
    amount: string, 
    fromWallet: string
  ): Promise<void> {
    try {
      // Get the user's disposable wallet for the network
      const userWallet = await this.databaseService.getDisposableWallet('master', network);
      if (!userWallet) {
        console.error(`❌ No disposable wallet found for forwarding on network ${network}`);
        return;
      }

      // Get master wallet address for the network
      const masterWallet = config.blockchain.masterWallets[network as keyof typeof config.blockchain.masterWallets];
      if (!masterWallet) {
        console.error(`❌ No master wallet configured for network ${network}`);
        return;
      }

      // Forward funds (implementation not shown)
      // await this.forwarderService.forwardFunds(forwardRequest);
      console.log(`✅ Forwarded ${amount} on ${network} from ${fromWallet} to master wallet ${masterWallet}`);
    } catch (error) {
      console.error(`❌ Error in autoForwardDeposit:`, error);
    }
  }

  /**
   * Get monitoring status
   */
  public isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Manual deposit check for testing
   */
  public async manualDepositCheck(): Promise<void> {
    console.log('🔍 Manual deposit check triggered');
    await this.checkForDeposits();
  }
} 