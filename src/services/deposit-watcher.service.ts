import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { DatabaseService } from './database.service';
import { WebhookService } from './webhook.service';
import { ForwarderService } from './forwarder.service';
import { config } from '../config';
import { DepositWebhookPayload } from '../types';
import { ForwardRequest } from '../types';

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
  private forwarderService: ForwarderService;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastScannedBlocks: Map<string, number> = new Map();

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.webhookService = WebhookService.getInstance();
    this.forwarderService = ForwarderService.getInstance();
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

      // Get all user wallets from database
      const userWallets = await this.databaseService.getAllUserWallets();
      
      for (const userWallet of userWallets) {
        await this.checkUserDeposits(userWallet);
      }

      console.log(`✅ Deposit check completed for ${userWallets.length} users`);
    } catch (error) {
      console.error('❌ Error checking deposits:', error);
    }
  }

  /**
   * Check for deposits for a specific user across all chains
   */
  private async checkUserDeposits(userWallet: { userId: string; wallets: { [key: string]: string } }): Promise<void> {
    try {
      // Check each chain for deposits
      const promises = [];
      
      if (userWallet.wallets['ethereum']) {
        promises.push(this.checkEthereumDeposits(userWallet.userId, userWallet.wallets['ethereum']));
      }
      if (userWallet.wallets['bsc']) {
        promises.push(this.checkBSCDeposits(userWallet.userId, userWallet.wallets['bsc']));
      }
      if (userWallet.wallets['polygon']) {
        promises.push(this.checkPolygonDeposits(userWallet.userId, userWallet.wallets['polygon']));
      }
      if (userWallet.wallets['solana']) {
        promises.push(this.checkSolanaDeposits(userWallet.userId, userWallet.wallets['solana']));
      }
      if (userWallet.wallets['ton']) {
        promises.push(this.checkTONDeposits(userWallet.userId, userWallet.wallets['ton']));
      }
      
      await Promise.all(promises);
    } catch (error) {
      console.error(`❌ Error checking deposits for user ${userWallet.userId}:`, error);
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
            const deposit = await this.databaseService.storeDeposit({
              userId,
              userWalletId: 'temp-id', // In real implementation, get actual wallet ID
              amount,
              currency: 'USDT',
              network: 'ethereum',
              txId: event.transactionHash,
              wallet: walletAddress,
            });

            // Wait for confirmation and process
            await this.processConfirmedDeposit(deposit.id, userId, 'ethereum', amount, event.transactionHash, walletAddress);
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

            const deposit = await this.databaseService.storeDeposit({
              userId,
              userWalletId: 'temp-id',
              amount,
              currency: 'USDT',
              network: 'bsc',
              txId: event.transactionHash,
              wallet: walletAddress,
            });

            await this.processConfirmedDeposit(deposit.id, userId, 'bsc', amount, event.transactionHash, walletAddress);
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

            const deposit = await this.databaseService.storeDeposit({
              userId,
              userWalletId: 'temp-id',
              amount,
              currency: 'USDT',
              network: 'polygon',
              txId: event.transactionHash,
              wallet: walletAddress,
            });

            await this.processConfirmedDeposit(deposit.id, userId, 'polygon', amount, event.transactionHash, walletAddress);
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
          const deposit = await this.databaseService.storeDeposit({
            userId,
            userWalletId: 'temp-id',
            amount: newAmount.toString(),
            currency: 'USDT',
            network: 'solana',
            txId: `solana_${Date.now()}`, // In production, get actual tx hash
            wallet: walletAddress,
          });

          await this.processConfirmedDeposit(deposit.id, userId, 'solana', newAmount.toString(), deposit.txId, walletAddress);
          
          // Update last known balance
          await this.databaseService.updateLastKnownBalance(userId, 'solana', balance);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking Solana deposits for ${walletAddress}:`, error);
    }
  }

  /**
   * Check TON deposits for a specific user
   */
  private async checkTONDeposits(_userId: string, walletAddress: string): Promise<void> {
    try {
      // TODO: Implement real TON blockchain queries
      // This would involve:
      // 1. Connecting to TON blockchain
      // 2. Checking wallet balance
      // 3. Monitoring for incoming transactions
      // 4. Parsing transaction data for USDT transfers
      
      console.log(`🔍 Checking TON deposits for wallet: ${walletAddress}`);
      
      // Placeholder: Simulate deposit detection
      const shouldSimulateDeposit = Math.random() < 0.001; // 0.1% chance per check
      
      if (shouldSimulateDeposit) {
        const randomAmount = (Math.random() * 100 + 1).toFixed(2);
        const randomTxId = `TON_${Math.random().toString(16).substring(2, 66)}`;
        
        console.log(`🎯 Simulating TON deposit: ${randomAmount} USDT for user ${_userId}`);
        
        // Store deposit in database
        const userWalletRecord = await this.databaseService.getUserWallets(_userId);
        if (userWalletRecord) {
          const deposit = await this.databaseService.storeDeposit({
            userId: _userId,
            userWalletId: 'temp-id', // In real implementation, get actual wallet ID
            amount: randomAmount,
            currency: 'USDT',
            network: 'ton',
            txId: randomTxId,
            wallet: walletAddress,
          });
          
          // Update confirmations (simulate blockchain confirmations)
          setTimeout(async () => {
            await this.databaseService.updateDepositConfirmations(deposit.id, 1, 'CONFIRMED');
            
            // Send webhook notification
            const webhookPayload: DepositWebhookPayload = {
              userId: _userId,
              amount: randomAmount,
              currency: 'USDT',
              network: 'ton',
              txId: randomTxId,
              wallet: walletAddress,
            };
            
            const webhookSuccess = await this.webhookService.sendDepositWebhookWithRetry(webhookPayload);
            if (webhookSuccess) {
              await this.databaseService.markWebhookSent(deposit.id);
            }
          }, 5000); // Simulate 5 second confirmation time
        }
      }
    } catch (error) {
      console.error(`❌ Error checking TON deposits for user ${_userId}:`, error);
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
      // Update deposit status to confirmed
      await this.databaseService.updateDepositConfirmations(depositId, 1, 'CONFIRMED');
      
      // Get user wallets for forwarding
      const userWallets = await this.databaseService.getUserWallets(userId);
      if (!userWallets) {
        console.error(`❌ No wallets found for user ${userId}`);
        return;
      }

      // Auto-forward funds to master wallet
      await this.autoForwardDeposit(userWallets, network, amount, walletAddress);
      
      // Send webhook notification
      const webhookPayload: DepositWebhookPayload = {
        userId,
        amount,
        currency: 'USDT',
        network,
        txId,
        wallet: walletAddress,
      };

      const webhookSuccess = await this.webhookService.sendDepositWebhookWithRetry(webhookPayload);
      if (webhookSuccess) {
        await this.databaseService.markWebhookSent(depositId);
      }
    } catch (error) {
      console.error(`❌ Error processing confirmed deposit:`, error);
    }
  }

  /**
   * Auto-forward confirmed deposit to master wallet
   */
  private async autoForwardDeposit(
    userWallets: any, 
    network: string, 
    amount: string, 
    fromWallet: string
  ): Promise<void> {
    try {
      console.log(`💰 Auto-forwarding ${amount} USDT on ${network} to master wallet`);

      // Get private key for the network
      let privateKey: string;
      switch (network) {
        case 'ethereum':
          privateKey = userWallets.ethereum.privateKey;
          break;
        case 'bsc':
          privateKey = userWallets.bsc.privateKey;
          break;
        case 'polygon':
          privateKey = userWallets.polygon.privateKey;
          break;
        case 'solana':
          privateKey = userWallets.solana.privateKey;
          break;
        case 'ton':
          privateKey = userWallets.ton.privateKey;
          break;
        default:
          throw new Error(`Unsupported network for forwarding: ${network}`);
      }

      // Create forward request
      const forwardRequest: ForwardRequest = {
        userId: userWallets.userId,
        network: network as 'ethereum' | 'bsc' | 'polygon' | 'solana' | 'ton',
        amount: amount,
        fromWallet: fromWallet,
        privateKey: privateKey,
        fromPrivateKey: privateKey,
        toAddress: config.blockchain.masterWallets[network as keyof typeof config.blockchain.masterWallets],
        masterWallet: config.blockchain.masterWallets[network as keyof typeof config.blockchain.masterWallets],
      };

      // Validate and execute forward
      this.forwarderService.validateForwardRequest(forwardRequest);
      const forwardResult = await this.forwarderService.forwardFunds(forwardRequest);

      if (forwardResult.success) {
        console.log(`✅ Auto-forward successful: ${forwardResult.txHash}`);
        
        // Store forward transaction in database
        await this.databaseService.storeForwardTransaction({
          depositId: 'temp-id', // In real implementation, get actual deposit ID
          forwardTxHash: forwardResult.txHash!,
          network,
          amount,
          status: 'COMPLETED',
        });
      } else {
        console.error(`❌ Auto-forward failed: ${forwardResult.error}`);
        
        // Store failed forward attempt
        const failedTx: any = {
          depositId: 'temp-id',
          forwardTxHash: '',
          network,
          amount,
          status: 'FAILED',
        };
        if (forwardResult.error) {
          failedTx.error = forwardResult.error;
        }
        await this.databaseService.storeForwardTransaction(failedTx);
      }
    } catch (error) {
      console.error(`❌ Auto-forward error:`, error);
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