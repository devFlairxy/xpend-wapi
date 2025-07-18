import dotenv from 'dotenv';
import { ChainConfig } from '../types';

dotenv.config();

export const config = {
  server: {
    port: process.env['PORT'] || 3000,
    nodeEnv: process.env['NODE_ENV'] || 'development',
  },
  security: {
    jwtSecret: process.env['JWT_SECRET'] || 'default-jwt-secret',
    apiKeySecret: process.env['API_KEY_SECRET'] || 'default-api-key-secret',
  },
  blockchain: {
    masterSeedPhrase: process.env['MASTER_SEED_PHRASE'] || '',
    derivationPath: process.env['WALLET_DERIVATION_PATH'] || "m/44'/60'/0'/0",
    masterWallets: {
      ethereum: process.env['MASTER_WALLET_ETH'] || '',
      bsc: process.env['MASTER_WALLET_BSC'] || '',
      polygon: process.env['MASTER_WALLET_POLYGON'] || '',
      solana: process.env['MASTER_WALLET_SOLANA'] || '',
      tron: process.env['MASTER_WALLET_TRON'] || '',
      busd: process.env['MASTER_WALLET_BUSD'] || '', // Add BUSD master wallet
    },
    // Dedicated gas fee wallets - separate from deposit receiving wallets
    gasFeeWallets: {
      ethereum: process.env['GAS_FEE_WALLET_ETH'] || '',
      bsc: process.env['GAS_FEE_WALLET_BSC'] || '',
      polygon: process.env['GAS_FEE_WALLET_POLYGON'] || '',
      solana: process.env['GAS_FEE_WALLET_SOLANA'] || '',
      tron: process.env['GAS_FEE_WALLET_TRON'] || '',
      busd: process.env['GAS_FEE_WALLET_BUSD'] || '', // BUSD uses BSC gas fee wallet
    },
    // Gas fee wallet private keys (encrypted in production)
    gasFeeWalletKeys: {
      ethereum: process.env['GAS_FEE_WALLET_KEY_ETH'] || '',
      bsc: process.env['GAS_FEE_WALLET_KEY_BSC'] || '',
      polygon: process.env['GAS_FEE_WALLET_KEY_POLYGON'] || '',
      solana: process.env['GAS_FEE_WALLET_KEY_SOLANA'] || '',
      tron: process.env['GAS_FEE_WALLET_KEY_TRON'] || '',
      busd: process.env['GAS_FEE_WALLET_KEY_BUSD'] || '', // BUSD uses BSC gas fee wallet key
    },
  },
  chains: {
    ethereum: {
      name: 'Ethereum',
      rpcUrl: process.env['ETHEREUM_RPC_URL'] || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
      chainId: 1,
      usdtContract: process.env['USDT_ETHEREUM_CONTRACT'] || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    } as ChainConfig,
    bsc: {
      name: 'Binance Smart Chain',
      rpcUrl: process.env['BSC_RPC_URL'] || 'https://bsc-dataseed.binance.org',
      chainId: 56,
      usdtContract: process.env['USDT_BSC_CONTRACT'] || '0x55d398326f99059fF775485246999027B3197955',
    } as ChainConfig,
    busd: {
      name: 'Binance USD',
      rpcUrl: process.env['BSC_RPC_URL'] || 'https://bsc-dataseed.binance.org', // BUSD runs on BSC
      chainId: 56,
      usdtContract: process.env['BUSD_BSC_CONTRACT'] || '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD contract
    } as ChainConfig,
    polygon: {
      name: 'Polygon',
      rpcUrl: process.env['POLYGON_RPC_URL'] || 'https://polygon-rpc.com',
      chainId: 137,
      usdtContract: process.env['USDT_POLYGON_CONTRACT'] || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    } as ChainConfig,
    solana: {
      name: 'Solana',
      rpcUrl: process.env['SOLANA_RPC_URL'] || 'https://api.mainnet-beta.solana.com',
      chainId: 0, // Solana doesn't use chainId like EVM chains
      usdtContract: process.env['USDT_SOLANA_MINT'] || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    } as ChainConfig,
    tron: {
      name: 'Tron',
      rpcUrl: process.env['TRON_RPC_URL'] || 'https://api.trongrid.io',
      chainId: 728126428, // Tron mainnet
      usdtContract: process.env['USDT_TRON_CONTRACT'] || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    } as ChainConfig,
  },
  webhook: {
    secret: process.env['WEBHOOK_SECRET'] || 'default-webhook-secret',
    url: process.env['WEBHOOK_URL'] || '',
    depositUrl: process.env['DEPOSIT_WEBHOOK_URL'] || '',
    sharedSecret: process.env['SHARED_SECRET'] || 'default-shared-secret',
  },
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
    file: process.env['LOG_FILE'] || 'logs/app.log',
  },
  rateLimit: {
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'),
    maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
  },
};

export const validateConfig = (): void => {
  const requiredEnvVars = [
    'MASTER_SEED_PHRASE',
    'JWT_SECRET',
    'API_KEY_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  if (!config.blockchain.masterSeedPhrase) {
    throw new Error('MASTER_SEED_PHRASE is required for wallet generation');
  }
}; 