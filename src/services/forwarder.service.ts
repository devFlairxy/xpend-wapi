import { ethers } from 'ethers';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer, getMint } from '@solana/spl-token';
import { config } from '../config';
import { ForwardRequest, ForwardResult } from '../types';
import TronWeb from 'tronweb';
import { GasFeeService } from './gas-fee.service';
import { GasFeeWalletService } from './gas-fee-wallet.service';
import { SlackService } from './slack.service';

// USDT ABI for EVM chains
const USDT_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Solana USDT mint address (mainnet)
const SOLANA_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export class ForwarderService {
  private static instance: ForwarderService;
  private maxRetries: number = 3;
  private baseDelay: number = 1000; // 1 second
  private gasFeeService: GasFeeService;
  private gasFeeWalletService: GasFeeWalletService;
  private slackService: SlackService;

  private constructor() {
    this.gasFeeService = GasFeeService.getInstance();
    this.gasFeeWalletService = GasFeeWalletService.getInstance();
    this.slackService = SlackService.getInstance();
  }

  public static getInstance(): ForwarderService {
    if (!ForwarderService.instance) {
      ForwarderService.instance = new ForwarderService();
    }
    return ForwarderService.instance;
  }

  /**
   * Forward funds to master wallet with retry logic
   */
  public async forwardFunds(request: ForwardRequest): Promise<ForwardResult> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Forwarding ${request.amount} USDT on ${request.network} (attempt ${attempt}/${this.maxRetries})`);
        
        const result = await this.executeForward(request, attempt);
        
        if (result.success) {
          console.log(`✅ Forward successful: ${result.txHash}`);
          return result;
        }
        
        lastError = result.error || 'Unknown error';
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Forward attempt ${attempt} failed:`, lastError);
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: `Forward failed after ${this.maxRetries} attempts. Last error: ${lastError}`,
      retries: this.maxRetries,
    };
  }

  /**
   * Execute the actual forward transaction
   */
  private async executeForward(request: ForwardRequest, attempt: number): Promise<ForwardResult> {
    const masterWallet = config.blockchain.masterWallets[request.network as keyof typeof config.blockchain.masterWallets];
    
    if (!masterWallet) {
      throw new Error(`Master wallet not configured for network: ${request.network}`);
    }

    switch (request.network) {
      case 'ethereum':
      case 'bsc':
      case 'polygon':
        return await this.forwardEthereumChains(request);
      case 'solana':
        return await this.forwardSolana(request, masterWallet, attempt);
      case 'tron':
        return await this.forwardTron(request, masterWallet, attempt);
      case 'busd':
        return await this.forwardEthereumChains(request); // BUSD uses same logic as BSC, just different contract
      default:
        throw new Error(`Unsupported network: ${request.network}`);
    }
  }

  /**
   * Forward USDT on Ethereum chains (Ethereum, BSC, Polygon) and BUSD
   */
  private async forwardEthereumChains(request: ForwardRequest): Promise<ForwardResult> {
    try {
      const { network, amount, privateKey, masterWallet } = request;
      
      // Get network configuration
      const networkConfig = config.chains[network as keyof typeof config.chains];
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }
      
      // Get dedicated gas fee wallet for this network
      const gasFeeWallet = await this.gasFeeWalletService.getGasFeeWallet(network);
      console.log(`💰 Using gas fee wallet: ${gasFeeWallet.address} (balance: ${gasFeeWallet.balance})`);
      
      // Create provider and wallets
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const depositWallet = new ethers.Wallet(privateKey, provider);
      const gasFeeWalletInstance = new ethers.Wallet(gasFeeWallet.privateKey, provider);
      
      // Create contract instance (USDT for most networks, BUSD for BUSD network)
      const contractAddress = network === 'busd' 
        ? config.chains.busd.usdtContract 
        : networkConfig.usdtContract;
      
      const contract = new ethers.Contract(
        contractAddress,
        USDT_ABI,
        depositWallet // Use deposit wallet for USDT transfer
      );
      
      // Convert amount to token decimals (6 for most USDT, 18 for BSC USDT and BUSD)
      const decimals = network === 'bsc' || network === 'busd' ? 18 : 6;
      const tokenAmount = ethers.parseUnits(amount, decimals);
      
      // Get enhanced gas estimate with safety buffers
      const gasEstimate = await this.gasFeeService.getTransactionGasEstimate(
        network,
        amount,
        depositWallet.address,
        masterWallet
      );
      
      console.log(`📊 Gas estimate for ${network}: ${this.gasFeeService.formatGasEstimate(gasEstimate)}`);
      
      // Validate gas fee wallet has sufficient balance for gas fees
      const balanceValidation = await this.gasFeeService.validateGasBalance(
        network,
        gasFeeWallet.address,
        amount,
        true // Include buffer
      );
      
      if (!balanceValidation.hasSufficientBalance) {
        // Send critical Slack notification before throwing error
        await this.sendGasFeeWalletLowBalanceAlert(
          network,
          gasFeeWallet.address,
          balanceValidation.currentBalance,
          balanceValidation.requiredBalance,
          balanceValidation.deficit,
          request.amount,
          request.userId || 'unknown'
        );

        throw new Error(
          `Insufficient balance in gas fee wallet. Required: ${ethers.formatEther(balanceValidation.requiredBalance)} ETH, ` +
          `Available: ${ethers.formatEther(balanceValidation.currentBalance)} ETH, ` +
          `Deficit: ${ethers.formatEther(balanceValidation.deficit)} ETH`
        );
      }
      
      // Check if deposit wallet has sufficient native tokens for gas fees
      const depositWalletBalance = await provider.getBalance(depositWallet.address);
      const requiredGasFee = gasEstimate.safeEstimatedFee;
      
      if (depositWalletBalance < requiredGasFee) {
        // Transfer gas fees from gas fee wallet to deposit wallet
        console.log(`🔄 Transferring gas fees from gas fee wallet to deposit wallet...`);
        const gasFeeTransfer = await gasFeeWalletInstance.sendTransaction({
          to: depositWallet.address,
          value: requiredGasFee,
          gasLimit: 21000, // Standard ETH transfer gas limit
        });
        
        const gasFeeReceipt = await gasFeeTransfer.wait();
        if (gasFeeReceipt) {
          console.log(`✅ Gas fee transfer successful: ${gasFeeReceipt.hash}`);
        }
        
        // Wait a moment for the balance to be available
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Get transfer function and build transaction with safe gas limit
      const transferFunction = contract['transfer'];
      if (!transferFunction) {
        throw new Error('Token transfer function not found');
      }
      
      const tx = await transferFunction.populateTransaction(masterWallet, tokenAmount, {
        gasLimit: gasEstimate.safeGasLimit,
        gasPrice: gasEstimate.gasPrice,
      });
      
      // Send transaction using deposit wallet (now funded with gas fees)
      const response = await depositWallet.sendTransaction(tx);
      const receipt = await response.wait();
      
      if (!receipt) {
        throw new Error('Transaction failed - no receipt received');
      }
      
      const tokenName = network === 'busd' ? 'BUSD' : 'USDT';
      console.log(`✅ ${network.toUpperCase()} ${tokenName} transfer successful: ${receipt.hash}`);
      console.log(`💸 Gas fees provided by: ${gasFeeWallet.address}`);
      
      return {
        success: true,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed?.toString() || '0',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Forward USDT on Solana
   */
  private async forwardSolana(
    request: ForwardRequest, 
    masterWallet: string, 
    attempt: number
  ): Promise<ForwardResult> {
    try {
      const connection = new Connection(config.chains.solana.rpcUrl);
      const fromKeypair = this.createSolanaKeypair(request.privateKey);
      
      // Get USDT mint address
      const mintAddress = new PublicKey(SOLANA_USDT_MINT);
      
      // Get USDT token account for the sender
      const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        fromKeypair,
        mintAddress,
        fromKeypair.publicKey
      );
      
      // Get USDT token account for the receiver (master wallet)
      const receiverTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        fromKeypair, // Payer for creating account if needed
        mintAddress,
        new PublicKey(masterWallet)
      );
      
      // Get USDT mint info for decimals
      const mintInfo = await getMint(connection, mintAddress);
      
      // Convert amount to proper decimals (USDT on Solana has 6 decimals)
      const decimals = Number(mintInfo.decimals);
      const usdtAmount = BigInt(parseFloat(request.amount) * Math.pow(10, decimals));
      
      // Create and send transfer transaction
      const signature = await transfer(
        connection,
        fromKeypair,
        senderTokenAccount.address,
        receiverTokenAccount.address,
        fromKeypair,
        usdtAmount
      );
      
      // Wait for confirmation
      await connection.confirmTransaction(signature);
      
      return {
        success: true,
        txHash: signature,
        retries: attempt - 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        retries: attempt - 1,
      };
    }
  }

  /**
   * Forward USDT on Tron (TRC20 USDT)
   */
  private async forwardTron(
    request: ForwardRequest, 
    masterWallet: string, 
    attempt: number
  ): Promise<ForwardResult> {
    try {
      // Initialize TronWeb
      const TronWebConstructor = (TronWeb as any).TronWeb || (TronWeb as any).default.TronWeb;
      const tronWeb = new TronWebConstructor(
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        config.chains.tron.rpcUrl,
        request.privateKey
      );
      
      // Tron USDT contract address (TRC20)
      const usdtContractAddress = config.chains.tron.usdtContract;
      
      // Get USDT contract instance
      const contract = await tronWeb.contract().at(usdtContractAddress);
      
      // Convert amount to USDT decimals (6 decimals for TRC20 USDT)
      const usdtAmount = Math.floor(parseFloat(request.amount) * 1000000); // 6 decimals
      
      // Execute transfer
      const transaction = await contract.transfer(masterWallet, usdtAmount).send({
        feeLimit: 10000000, // 10 TRX fee limit
      });
      
      if (!transaction) {
        throw new Error('Transaction failed - no transaction hash received');
      }
      
      console.log(`✅ Tron USDT transfer successful: ${transaction}`);
      
      return {
        success: true,
        txHash: transaction,
        retries: attempt - 1,
      };
    } catch (error) {
      console.error(`❌ Tron forwarding error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        retries: attempt - 1,
      };
    }
  }

  /**
   * Create Solana keypair from private key
   */
  private createSolanaKeypair(privateKey: string): Keypair {
    try {
      // Try to parse as base64 first
      const secretKey = Buffer.from(privateKey, 'base64');
      return Keypair.fromSecretKey(secretKey);
    } catch {
      // If base64 fails, try as hex string
      const secretKey = Buffer.from(privateKey, 'hex');
      return Keypair.fromSecretKey(secretKey);
    }
  }

  /**
   * Get gas estimate for Ethereum chain USDT transfer
   */
  public async getGasEstimate(network: string, amount: string): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimatedFee: bigint;
  }> {
    try {
      const gasEstimate = await this.gasFeeService.getGasEstimate(network, amount);
      
      return {
        gasLimit: gasEstimate.gasLimit,
        gasPrice: gasEstimate.gasPrice,
        estimatedFee: gasEstimate.estimatedFee,
      };
    } catch (error) {
      throw new Error(`Failed to estimate gas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate forward request with enhanced gas fee validation
   */
  public async validateForwardRequest(request: ForwardRequest): Promise<void> {
    if (!request.network || !request.amount || !request.privateKey || !request.masterWallet) {
      throw new Error('Missing required fields in forward request');
    }

    if (parseFloat(request.amount) <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const supportedNetworks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'];
    if (!supportedNetworks.includes(request.network)) {
      throw new Error(`Unsupported network: ${request.network}`);
    }

    // Validate master wallet is configured
    const masterWallet = config.blockchain.masterWallets[request.network as keyof typeof config.blockchain.masterWallets];
    if (!masterWallet) {
      throw new Error(`Master wallet not configured for network: ${request.network}`);
    }

    // For EVM chains, validate gas balance
    if (['ethereum', 'bsc', 'polygon', 'busd'].includes(request.network)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.chains[request.network as keyof typeof config.chains].rpcUrl);
        const wallet = new ethers.Wallet(request.privateKey, provider);
        
        const balanceValidation = await this.gasFeeService.validateGasBalance(
          request.network,
          wallet.address,
          request.amount,
          true // Include buffer
        );
        
        if (!balanceValidation.hasSufficientBalance) {
          // Send critical Slack notification before throwing error
          await this.sendGasFeeWalletLowBalanceAlert(
            request.network,
            wallet.address,
            balanceValidation.currentBalance,
            balanceValidation.requiredBalance,
            balanceValidation.deficit,
            request.amount,
            request.userId || 'unknown'
          );

          throw new Error(
            `Insufficient balance for gas fees. Required: ${ethers.formatEther(balanceValidation.requiredBalance)} ETH, ` +
            `Available: ${ethers.formatEther(balanceValidation.currentBalance)} ETH, ` +
            `Deficit: ${ethers.formatEther(balanceValidation.deficit)} ETH`
          );
        }
      } catch (error) {
        // If gas validation fails, log warning but don't fail the request
        console.warn(`Gas balance validation failed for ${request.network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Get comprehensive gas estimate with safety buffers
   */
  public async getEnhancedGasEstimate(
    network: string,
    amount: string,
    fromAddress?: string,
    toAddress?: string
  ) {
    return await this.gasFeeService.getGasEstimate(network, amount, fromAddress, toAddress);
  }

  /**
   * Validate wallet gas balance
   */
  public async validateWalletGasBalance(
    network: string,
    walletAddress: string,
    amount: string
  ) {
    return await this.gasFeeService.validateGasBalance(network, walletAddress, amount, true);
  }

  /**
   * Get network gas price recommendations
   */
  public async getNetworkGasPrice(network: string) {
    return await this.gasFeeService.getNetworkGasPrice(network);
  }

  /**
   * Send critical Slack alert for insufficient gas fee wallet balance
   */
  private async sendGasFeeWalletLowBalanceAlert(
    network: string,
    walletAddress: string,
    currentBalance: bigint,
    requiredBalance: bigint,
    deficit: bigint,
    transferAmount: string,
    userId: string
  ): Promise<void> {
    try {
      const message = {
        channel: '#gas-fee-alerts',
        text: `🚨 CRITICAL: Gas Fee Wallet Insufficient Balance - ${network.toUpperCase()}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 CRITICAL: Gas Fee Wallet Insufficient Balance - ${network.toUpperCase()}`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Network:* ${network.toUpperCase()}`
              },
              {
                type: 'mrkdwn',
                text: `*Wallet Address:* \`${walletAddress}\``
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Current Balance:* ${ethers.formatEther(currentBalance)} ${getNativeToken(network)}`
              },
              {
                type: 'mrkdwn',
                text: `*Required Balance:* ${ethers.formatEther(requiredBalance)} ${getNativeToken(network)}`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Deficit:* ${ethers.formatEther(deficit)} ${getNativeToken(network)}`
              },
              {
                type: 'mrkdwn',
                text: `*Transfer Amount:* ${transferAmount} USDT`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*User ID:* ${userId}`
              },
              {
                type: 'mrkdwn',
                text: `*Time:* ${new Date().toISOString()}`
              }
            ]
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⚠️ *IMMEDIATE ACTION REQUIRED:*\n• Fund the gas fee wallet immediately\n• Transfer operations are blocked\n• Check wallet balance and add funds'
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'This is a critical alert that requires immediate attention to prevent service disruption.'
              }
            ]
          }
        ]
      };

      await this.slackService.sendMessage(message);
      console.log(`📤 Sent critical gas fee wallet balance alert to Slack for ${network}`);
    } catch (error) {
      console.error(`❌ Failed to send gas fee wallet balance alert to Slack: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't throw error - we don't want Slack notification failure to break the main flow
    }
  }
}

/**
 * Get native token symbol for a network
 */
function getNativeToken(network: string): string {
  switch (network) {
    case 'ethereum': return 'ETH';
    case 'bsc': return 'BNB';
    case 'polygon': return 'MATIC';
    case 'solana': return 'SOL';
    case 'tron': return 'TRX';
    case 'busd': return 'BNB'; // BUSD runs on BSC
    default: return 'TOKEN';
  }
} 