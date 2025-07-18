import { ethers } from 'ethers';
import { config } from '../config';

// USDT ABI for gas estimation
const USDT_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint | undefined;
  maxPriorityFeePerGas?: bigint | undefined;
  estimatedFee: bigint;
  safeGasLimit: bigint;
  safeEstimatedFee: bigint;
  network: string;
  timestamp: number;
}

export interface GasFeeConfig {
  gasLimitBuffer: number; // Percentage buffer for gas limit (default: 20%)
  gasPriceBuffer: number; // Percentage buffer for gas price (default: 10%)
  maxGasLimit: bigint; // Maximum gas limit to prevent excessive fees
  minGasLimit: bigint; // Minimum gas limit
  maxGasPrice: bigint; // Maximum gas price to prevent excessive fees
  minGasPrice: bigint; // Minimum gas price
  priorityFeeMultiplier: number; // Multiplier for priority fee (default: 1.5)
}

export class GasFeeService {
  private static instance: GasFeeService;
  private cache: Map<string, { estimate: GasEstimate; timestamp: number }> = new Map();
  private readonly cacheExpiry = 30000; // 30 seconds cache
  private readonly defaultConfig: GasFeeConfig = {
    gasLimitBuffer: 20, // 20% buffer
    gasPriceBuffer: 10, // 10% buffer
    maxGasLimit: BigInt(500000), // 500k gas limit
    minGasLimit: BigInt(21000), // 21k gas limit
    maxGasPrice: BigInt(1000000000000), // 1000 gwei
    minGasPrice: BigInt(1000000000), // 1 gwei
    priorityFeeMultiplier: 1.5,
  };

  private constructor() {}

  public static getInstance(): GasFeeService {
    if (!GasFeeService.instance) {
      GasFeeService.instance = new GasFeeService();
    }
    return GasFeeService.instance;
  }

  /**
   * Get comprehensive gas estimate with safety buffers
   */
  public async getGasEstimate(
    network: string,
    amount: string,
    fromAddress?: string,
    toAddress?: string,
    customConfig?: Partial<GasFeeConfig>
  ): Promise<GasEstimate> {
    const configKey = `${network}-${amount}-${fromAddress}-${toAddress}`;
    const cached = this.cache.get(configKey);
    
    // Check cache
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.estimate;
    }

    const finalConfig = { ...this.defaultConfig, ...customConfig };
    
    try {
      const provider = new ethers.JsonRpcProvider(config.chains[network as keyof typeof config.chains].rpcUrl);
      
      // Get current fee data
      const feeData = await provider.getFeeData();
      
      // Get network-specific configuration
      const networkConfig = config.chains[network as keyof typeof config.chains];
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Create contract instance for gas estimation
      const contractAddress = network === 'busd' 
        ? config.chains.busd.usdtContract 
        : networkConfig.usdtContract;
      
      const contract = new ethers.Contract(contractAddress, USDT_ABI, provider);
      
      // Validate amount
      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        throw new Error(`Invalid amount: ${amount}. Must be a positive number.`);
      }
      
      // Convert amount to token decimals
      const decimals = network === 'bsc' || network === 'busd' ? 18 : 6;
      const tokenAmount = ethers.parseUnits(amount, decimals);
      
      // Use provided addresses or fallback to master wallet
      const targetAddress = toAddress || config.blockchain.masterWallets[network as keyof typeof config.blockchain.masterWallets];
      if (!targetAddress) {
        throw new Error(`No target address provided and master wallet not configured for network: ${network}`);
      }

      // Estimate gas for USDT transfer
      const transferFunction = contract['transfer'];
      if (!transferFunction) {
        throw new Error('USDT transfer function not found');
      }

      // Estimate gas with proper error handling
      let gasLimit: bigint;
      try {
        gasLimit = await transferFunction.estimateGas(targetAddress, tokenAmount);
      } catch (error) {
        // If estimation fails, use network-specific fallback values
        gasLimit = this.getFallbackGasLimit(network);
        console.warn(`Gas estimation failed for ${network}, using fallback: ${gasLimit}`);
      }

      // Apply gas limit constraints and buffer
      gasLimit = this.applyGasLimitConstraints(gasLimit, finalConfig);
      const safeGasLimit = this.addBuffer(gasLimit, finalConfig.gasLimitBuffer);

      // Calculate gas price with buffer
      const gasPrice = this.calculateOptimalGasPrice(feeData, finalConfig);
      
      // Calculate estimated fees
      const estimatedFee = gasLimit * gasPrice;
      const safeEstimatedFee = safeGasLimit * gasPrice;

             const estimate: GasEstimate = {
         gasLimit,
         gasPrice,
         maxFeePerGas: feeData.maxFeePerGas || undefined,
         maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || undefined,
         estimatedFee,
         safeGasLimit,
         safeEstimatedFee,
         network,
         timestamp: Date.now(),
       };

      // Cache the result
      this.cache.set(configKey, { estimate, timestamp: Date.now() });

      return estimate;
    } catch (error) {
      throw new Error(`Failed to estimate gas for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get gas estimate for transaction execution (with additional safety)
   */
  public async getTransactionGasEstimate(
    network: string,
    amount: string,
    fromAddress: string,
    toAddress: string
  ): Promise<GasEstimate> {
    // Use higher buffer for actual transactions
    const transactionConfig: Partial<GasFeeConfig> = {
      gasLimitBuffer: 30, // 30% buffer for transactions
      gasPriceBuffer: 15, // 15% buffer for gas price
    };

    return this.getGasEstimate(network, amount, fromAddress, toAddress, transactionConfig);
  }

  /**
   * Validate if wallet has sufficient balance for gas fees
   */
  public async validateGasBalance(
    network: string,
    walletAddress: string,
    amount: string,
    includeBuffer: boolean = true
  ): Promise<{
    hasSufficientBalance: boolean;
    requiredBalance: bigint;
    currentBalance: bigint;
    deficit: bigint;
  }> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains[network as keyof typeof config.chains].rpcUrl);
      
      // Validate wallet address
      if (!ethers.isAddress(walletAddress)) {
        throw new Error(`Invalid wallet address: ${walletAddress}`);
      }
      
      // Get current balance
      const currentBalance = await provider.getBalance(walletAddress);
      
      // Get gas estimate
      const gasEstimate = await this.getGasEstimate(network, amount, walletAddress);
      const requiredBalance = includeBuffer ? gasEstimate.safeEstimatedFee : gasEstimate.estimatedFee;
      
      const deficit = requiredBalance > currentBalance ? requiredBalance - currentBalance : BigInt(0);
      
      return {
        hasSufficientBalance: currentBalance >= requiredBalance,
        requiredBalance,
        currentBalance,
        deficit,
      };
    } catch (error) {
      throw new Error(`Failed to validate gas balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get network-specific gas price recommendations
   */
  public async getNetworkGasPrice(network: string): Promise<{
    slow: bigint;
    standard: bigint;
    fast: bigint;
    instant: bigint;
  }> {
    try {
      const provider = new ethers.JsonRpcProvider(config.chains[network as keyof typeof config.chains].rpcUrl);
      const feeData = await provider.getFeeData();
      
      const baseGasPrice = feeData.gasPrice || BigInt(20000000000); // 20 gwei default
      
      return {
        slow: this.addBuffer(baseGasPrice, -20), // 20% below base
        standard: baseGasPrice,
        fast: this.addBuffer(baseGasPrice, 20), // 20% above base
        instant: this.addBuffer(baseGasPrice, 50), // 50% above base
      };
    } catch (error) {
      throw new Error(`Failed to get gas price for ${network}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear gas estimate cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      age: now - value.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Apply gas limit constraints
   */
  private applyGasLimitConstraints(gasLimit: bigint, config: GasFeeConfig): bigint {
    if (gasLimit < config.minGasLimit) {
      return config.minGasLimit;
    }
    if (gasLimit > config.maxGasLimit) {
      return config.maxGasLimit;
    }
    return gasLimit;
  }

  /**
   * Calculate optimal gas price with buffer
   */
  private calculateOptimalGasPrice(feeData: ethers.FeeData, config: GasFeeConfig): bigint {
    let gasPrice = feeData.gasPrice || BigInt(20000000000); // 20 gwei default
    
    // Apply buffer
    gasPrice = this.addBuffer(gasPrice, config.gasPriceBuffer);
    
    // Apply constraints
    if (gasPrice < config.minGasPrice) {
      gasPrice = config.minGasPrice;
    }
    if (gasPrice > config.maxGasPrice) {
      gasPrice = config.maxGasPrice;
    }
    
    return gasPrice;
  }

  /**
   * Add percentage buffer to a value
   */
  private addBuffer(value: bigint, percentage: number): bigint {
    const multiplier = BigInt(100 + percentage);
    return (value * multiplier) / BigInt(100);
  }

  /**
   * Get fallback gas limits for different networks
   */
  private getFallbackGasLimit(network: string): bigint {
    const fallbackLimits: { [key: string]: bigint } = {
      ethereum: BigInt(65000), // USDT transfer on Ethereum
      bsc: BigInt(50000), // USDT transfer on BSC
      polygon: BigInt(60000), // USDT transfer on Polygon
      busd: BigInt(50000), // BUSD transfer on BSC
    };

    return fallbackLimits[network] || BigInt(65000); // Default fallback
  }

  /**
   * Format gas estimate for logging
   */
  public formatGasEstimate(estimate: GasEstimate): string {
    return `
Gas Estimate for ${estimate.network}:
  Gas Limit: ${estimate.gasLimit.toString()} (Safe: ${estimate.safeGasLimit.toString()})
  Gas Price: ${ethers.formatUnits(estimate.gasPrice, 'gwei')} gwei
  Estimated Fee: ${ethers.formatEther(estimate.estimatedFee)} ETH
  Safe Estimated Fee: ${ethers.formatEther(estimate.safeEstimatedFee)} ETH
  Timestamp: ${new Date(estimate.timestamp).toISOString()}
    `.trim();
  }
} 