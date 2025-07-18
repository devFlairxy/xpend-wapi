import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { WalletInfo, WalletGenerationError, SupportedNetwork } from '../types';
import { config } from '../config';
import crypto from 'crypto';
import { DatabaseService } from './database.service';
import { QRCodeService } from './qr-code.service';

export class WalletService {
  private static instance: WalletService;
  private databaseService: DatabaseService;
  private qrCodeService: QRCodeService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.qrCodeService = QRCodeService.getInstance();
  }

  public static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  /**
   * Generate a disposable wallet for a specific user and network
   */
  public async generateDisposableWallet(userId: string, network: string): Promise<WalletInfo> {
    try {
      // Validate network
      const supportedNetworks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'];
      if (!supportedNetworks.includes(network)) {
        throw new WalletGenerationError(
          `Unsupported network: ${network}. Supported networks: ${supportedNetworks.join(', ')}`,
          network
        );
      }

      // Check if wallet already exists for this user and network
      const existingWallet = await this.databaseService.getDisposableWallet(userId, network);
      // If wallet exists and is not used, return it
      if (existingWallet && !existingWallet.isUsed) {
        return existingWallet;
      }

      // Generate a new wallet (deterministic for first, random for subsequent)
      let walletInfo: WalletInfo | null = null;
      let tries = 0;
      const maxTries = 10;
      let index: number;
      do {
        if (tries === 0) {
          // First wallet: deterministic index
          index = this.generateIndexFromUserIdAndNetwork(userId, network);
        } else {
          // Subsequent wallets: random index in a high range to avoid collisions
          index = Math.floor(Math.random() * 1_000_000) + 1_000_000; // 1,000,000 - 1,999,999
        }

        // Generate wallet based on network
        switch (network) {
          case 'ethereum':
          case 'bsc':
          case 'polygon':
          case 'busd':
            walletInfo = await this.generateEVMWallet(userId, network, index);
            break;
          case 'solana':
            walletInfo = await this.generateSolanaWallet(userId, network, index);
            break;
          case 'tron':
            walletInfo = await this.generateTronWallet(userId, network, index);
            break;
          default:
            throw new WalletGenerationError(`Unsupported network: ${network}`, network);
        }

        // Check for address collision
        const addressExists = await this.databaseService.walletAddressExists(walletInfo.address);
        if (!addressExists) {
          break;
        }
        walletInfo = null;
        tries++;
      } while (tries < maxTries);

      if (!walletInfo) {
        throw new WalletGenerationError('Failed to generate a unique wallet address after multiple attempts', network);
      }

      // Generate QR code
      const qrCode = await this.qrCodeService.generateQRCode(walletInfo.address);
      walletInfo.qrCode = qrCode;

      // Store wallet in database
      await this.databaseService.storeDisposableWallet(walletInfo);

      return walletInfo;
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate ${network} wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        network
      );
    }
  }

  /**
   * Generate EVM wallet (Ethereum, BSC, Polygon, BUSD)
   */
  private async generateEVMWallet(userId: string, network: string, index: number): Promise<WalletInfo> {
    try {
      const derivationPath = `${config.blockchain.derivationPath}/${index}`;
      const wallet = ethers.HDNodeWallet.fromPhrase(config.blockchain.masterSeedPhrase, derivationPath);
      
      return {
        id: `evm_${userId}_${network}_${index}`, // Generate unique ID
        userId,
        network: network as SupportedNetwork,
        address: wallet.address,
        privateKey: wallet.privateKey,
        derivationPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate ${network} wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        network
      );
    }
  }

  /**
   * Generate Solana wallet using deterministic method
   */
  private async generateSolanaWallet(userId: string, network: string, index: number): Promise<WalletInfo> {
    try {
      // Generate deterministic seed from userId and network
      const seedData = `${userId}-${network}`;
      const hash = crypto.createHash('sha256').update(seedData).digest();
      const keypair = Keypair.fromSeed(hash.slice(0, 32));
      
      return {
        id: `solana_${userId}_${network}_${index}`, // Generate unique ID
        userId,
        network: network as SupportedNetwork,
        address: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
        derivationPath: 'solana-deterministic',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate ${network} wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        network
      );
    }
  }

  /**
   * Generate Tron wallet using deterministic HD wallet
   */
  private async generateTronWallet(userId: string, network: string, index: number): Promise<WalletInfo> {
    try {
      const seedPhrase = config.blockchain.masterSeedPhrase;
      if (!seedPhrase) {
        throw new Error('Master seed phrase not configured');
      }

      // Generate HD wallet using the same pattern as Ethereum
      const derivationPath = `m/44'/195'/0'/0/${index}`; // Tron uses coin type 195
      const wallet = ethers.HDNodeWallet.fromPhrase(seedPhrase, derivationPath);

      // Convert to Tron address format
      const tronAddress = this.convertToTronAddress(wallet.address);

      return {
        id: `tron_${userId}_${network}_${index}`, // Generate unique ID
        userId,
        network: network as SupportedNetwork,
        address: tronAddress,
        privateKey: wallet.privateKey,
        derivationPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate ${network} wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        network
      );
    }
  }

  /**
   * Generate deterministic index from userId and network
   */
  private generateIndexFromUserIdAndNetwork(userId: string, network: string): number {
    const seedData = `${userId}-${network}`;
    const hash = crypto.createHash('sha256').update(seedData).digest();
    // Use modulo to ensure the index is within a reasonable range (0 to 999999)
    return hash.readUInt32BE(0) % 1000000;
  }

  /**
   * Convert Ethereum address to Tron address format
   */
  private convertToTronAddress(ethAddress: string): string {
    try {
      // Remove 0x prefix and convert to Buffer
      const addressBytes = Buffer.from(ethAddress.slice(2), 'hex');
      
      // Add Tron address prefix (0x41)
      const tronBytes = Buffer.concat([Buffer.from([0x41]), addressBytes]);
      
      // Calculate double SHA256 checksum
      const hash1 = crypto.createHash('sha256').update(tronBytes).digest();
      const hash2 = crypto.createHash('sha256').update(hash1).digest();
      const checksum = hash2.slice(0, 4);
      
      // Combine address + checksum and encode as base58
      const fullAddress = Buffer.concat([tronBytes, checksum]);
      return this.base58Encode(fullAddress);
    } catch (error) {
      throw new Error(`Failed to convert to Tron address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Base58 encoding for Tron addresses
   */
  private base58Encode(buffer: Buffer): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + buffer.toString('hex'));
    let result = '';
    
    while (num > 0) {
      const remainder = num % 58n;
      result = alphabet[Number(remainder)] + result;
      num = num / 58n;
    }
    
    // Add leading zeros
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
      result = '1' + result;
    }
    
    return result;
  }

  /**
   * Get existing disposable wallet for a user and network
   */
  public async getDisposableWallet(userId: string, network: string): Promise<WalletInfo | null> {
    try {
      return await this.databaseService.getDisposableWallet(userId, network);
    } catch (error) {
      console.error('Error getting disposable wallet:', error);
      return null;
    }
  }

  /**
   * Get wallet address for a specific user and network
   */
  public async getWalletAddress(userId: string, network: string): Promise<string | null> {
    try {
      const wallet = await this.getDisposableWallet(userId, network);
      return wallet ? wallet.address : null;
    } catch (error) {
      console.error('Error getting wallet address:', error);
      return null;
    }
  }

  /**
   * Get wallet information for a specific user and network
   */
  public async getNetworkWallet(userId: string, network: string): Promise<{ address: string; qrCode?: string } | null> {
    try {
      const wallet = await this.getDisposableWallet(userId, network);
      if (!wallet) return null;

      const result: { address: string; qrCode?: string } = {
        address: wallet.address,
      };
      
      if (wallet.qrCode) {
        result.qrCode = wallet.qrCode;
      }
      
      return result;
    } catch (error) {
      console.error('Error getting network wallet:', error);
      return null;
    }
  }

  /**
   * Mark a wallet as used (for disposable wallet tracking)
   */
  public async markWalletAsUsed(userId: string, network: string): Promise<void> {
    try {
      await this.databaseService.markWalletAsUsed(userId, network);
    } catch (error) {
      console.error('Error marking wallet as used:', error);
    }
  }

  /**
   * Validate wallet generation request
   */
  public validateWalletRequest(userId: string, network: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new WalletGenerationError('Invalid userId provided');
    }

    if (!network || typeof network !== 'string') {
      throw new WalletGenerationError('Invalid network provided');
    }

    if (userId.trim().length === 0) {
      throw new WalletGenerationError('UserId cannot be empty');
    }

    const supportedNetworks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'];
    if (!supportedNetworks.includes(network)) {
      throw new WalletGenerationError(`Unsupported network: ${network}. Supported networks: ${supportedNetworks.join(', ')}`);
    }
  }
} 