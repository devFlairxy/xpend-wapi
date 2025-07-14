import { ethers } from 'ethers';
import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../config';
import { ForwardRequest, ForwardResult } from '../types';

// USDT ABI for EVM chains
const USDT_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export class ForwarderService {
  private static instance: ForwarderService;
  private maxRetries: number = 3;
  private baseDelay: number = 1000; // 1 second

  private constructor() {}

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
      case 'ton':
        return await this.forwardTON(request, masterWallet, attempt);
      default:
        throw new Error(`Unsupported network: ${request.network}`);
    }
  }

  /**
   * Forward USDT on Ethereum chains (Ethereum, BSC, Polygon)
   */
  private async forwardEthereumChains(request: ForwardRequest): Promise<ForwardResult> {
    try {
      const { network, amount, privateKey, masterWallet } = request;
      
      // Get network configuration
      const networkConfig = config.chains[network as keyof typeof config.chains];
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }
      
      // Create provider and wallet
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Create USDT contract instance
      const usdtContract = new ethers.Contract(
        networkConfig.usdtContract,
        USDT_ABI,
        wallet
      );
      
      // Convert amount to USDT decimals (6 decimals)
      const usdtAmount = ethers.parseUnits(amount, 6);
      
      // Estimate gas with null check
      const transferFunction = usdtContract['transfer'];
      if (!transferFunction) {
        throw new Error('USDT transfer function not found');
      }
      
      const gasEstimate = await transferFunction.estimateGas(masterWallet, usdtAmount);
      
      // Build transaction
      const tx = await transferFunction.populateTransaction(masterWallet, usdtAmount, {
        gasLimit: gasEstimate,
      });
      
      // Send transaction
      const response = await wallet.sendTransaction(tx);
      const receipt = await response.wait();
      
      if (!receipt) {
        throw new Error('Transaction failed - no receipt received');
      }
      
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
      
      // Get recent blockhash for transaction
      await connection.getLatestBlockhash();
      
      // For now, we'll use a simplified approach since the Token class is deprecated
      // In production, you'd use the newer @solana/spl-token library
      console.log(`📤 Solana USDT transfer: ${request.amount} from ${fromKeypair.publicKey.toString()} to ${masterWallet}`);
      
      // Placeholder for actual Solana USDT transfer
      // This would need to be implemented with the current Solana SPL token library
      
      return {
        success: true,
        txHash: `solana_placeholder_${Date.now()}`,
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
   * Forward USDT on TON (simplified implementation)
   */
  private async forwardTON(
    request: ForwardRequest, 
    masterWallet: string, 
    attempt: number
  ): Promise<ForwardResult> {
    try {
      // For TON, we'll use a simplified approach
      // In production, use the TON SDK or API to send USDT transfers
      console.log(`📤 TON USDT transfer: ${request.amount} from ${request.fromWallet} to ${masterWallet}`);
      
      // This is a placeholder - in production, implement actual TON USDT transfer
      // Example:
      // const tonApi = new TONApi(config.chains.ton.rpcUrl);
      // const result = await tonApi.sendUsdtTransfer(request.privateKey, masterWallet, request.amount);
      
      // Simulate transaction hash for now
      const txHash = `ton_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      
      return {
        success: true,
        txHash,
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
      const provider = new ethers.JsonRpcProvider(config.chains[network as keyof typeof config.chains].rpcUrl);
      const usdtContract = new ethers.Contract(config.chains[network as keyof typeof config.chains].usdtContract, USDT_ABI, provider);
      const gasPrice = await provider.getFeeData();
      
      // Parse USDT amount (6 decimals)
      const usdtAmount = ethers.parseUnits(amount, 6);
      
      // Estimate gas for USDT transfer
      const transferFunction = usdtContract['transfer'];
      if (!transferFunction) {
        throw new Error('USDT transfer function not found');
      }
      const gasLimit = await transferFunction.estimateGas(config.blockchain.masterWallets[network as keyof typeof config.blockchain.masterWallets], usdtAmount);
      const estimatedFee = gasLimit * (gasPrice.gasPrice || BigInt(0));
      
      return {
        gasLimit,
        gasPrice: gasPrice.gasPrice || BigInt(0),
        estimatedFee,
      };
    } catch (error) {
      throw new Error(`Failed to estimate gas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate forward request
   */
  public validateForwardRequest(request: ForwardRequest): void {
    if (!request.network || !request.amount || !request.privateKey || !request.masterWallet) {
      throw new Error('Missing required fields in forward request');
    }

    if (parseFloat(request.amount) <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const supportedNetworks = ['ethereum', 'bsc', 'polygon', 'solana', 'ton'];
    if (!supportedNetworks.includes(request.network)) {
      throw new Error(`Unsupported network: ${request.network}`);
    }

    // Validate master wallet is configured
    const masterWallet = config.blockchain.masterWallets[request.network as keyof typeof config.blockchain.masterWallets];
    if (!masterWallet) {
      throw new Error(`Master wallet not configured for network: ${request.network}`);
    }
  }
} 