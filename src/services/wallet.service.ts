import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { WalletInfo, UserWallets, WalletGenerationError } from '../types';
import { config } from '../config';
import crypto from 'crypto';
import { DatabaseService } from './database.service';
import { QRCodeService } from './qr-code.service';

export class WalletService {
  private static instance: WalletService;
  private userWallets: Map<string, UserWallets> = new Map();
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
   * Generate wallets for all supported chains for a given user
   */
  public async generateWallets(userId: string): Promise<UserWallets> {
    try {
      // Check if wallets already exist for this user
      if (this.userWallets.has(userId)) {
        throw new WalletGenerationError('Wallets already exist for this user');
      }

      // Generate deterministic index from userId
      const index = this.generateIndexFromUserId(userId);

      // Generate wallets for each chain
      const ethereumWallet = await this.generateEthereumWallet(userId, index);
      const bscWallet = await this.generateBSCWallet(userId, index);
      const polygonWallet = await this.generatePolygonWallet(userId, index);
      const solanaWallet = await this.generateSolanaWallet(userId);
      const tonWallet = await this.generateTONWallet(userId);

      // Generate QR codes for all addresses
      const qrCodes = await this.qrCodeService.generateWalletQRCodes({
        ethereum: ethereumWallet.address,
        bsc: bscWallet.address,
        polygon: polygonWallet.address,
        solana: solanaWallet.address,
        ton: tonWallet.address,
      });

      // Add QR codes to wallet info
      ethereumWallet.qrCode = qrCodes.ethereum;
      bscWallet.qrCode = qrCodes.bsc;
      polygonWallet.qrCode = qrCodes.polygon;
      solanaWallet.qrCode = qrCodes.solana;
      tonWallet.qrCode = qrCodes.ton;

      const userWallets: UserWallets = {
        userId,
        ethereum: ethereumWallet,
        bsc: bscWallet,
        polygon: polygonWallet,
        solana: solanaWallet,
        ton: tonWallet,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store the wallets in memory and database
      this.userWallets.set(userId, userWallets);
      await this.databaseService.storeUserWallets(userWallets);

      return userWallets;
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate wallets: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate Ethereum wallet using HD derivation
   */
  private async generateEthereumWallet(_userId: string, index: number): Promise<WalletInfo> {
    try {
      const derivationPath = `${config.blockchain.derivationPath}/${index}`;
      const wallet = ethers.HDNodeWallet.fromPhrase(config.blockchain.masterSeedPhrase, derivationPath);
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        derivationPath,
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate Ethereum wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ethereum'
      );
    }
  }

  /**
   * Generate BSC wallet using HD derivation (same as Ethereum)
   */
  private async generateBSCWallet(_userId: string, index: number): Promise<WalletInfo> {
    try {
      const derivationPath = `${config.blockchain.derivationPath}/${index}`;
      const wallet = ethers.HDNodeWallet.fromPhrase(config.blockchain.masterSeedPhrase, derivationPath);
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        derivationPath,
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate BSC wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'bsc'
      );
    }
  }

  /**
   * Generate Polygon wallet using HD derivation (same as Ethereum)
   */
  private async generatePolygonWallet(_userId: string, index: number): Promise<WalletInfo> {
    try {
      const derivationPath = `${config.blockchain.derivationPath}/${index}`;
      const wallet = ethers.HDNodeWallet.fromPhrase(config.blockchain.masterSeedPhrase, derivationPath);
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        derivationPath,
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate Polygon wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'polygon'
      );
    }
  }

  /**
   * Generate Solana wallet using deterministic method based on SHA256(userId)
   */
  private async generateSolanaWallet(userId: string): Promise<WalletInfo> {
    try {
      // Generate deterministic seed from userId
      const hash = crypto.createHash('sha256').update(userId).digest();
      const keypair = Keypair.fromSeed(hash.slice(0, 32));
      
      return {
        address: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
        derivationPath: 'solana-deterministic',
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate Solana wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'solana'
      );
    }
  }

  /**
   * Generate TON wallet using deterministic method based on SHA256(userId)
   */
  private async generateTONWallet(userId: string): Promise<WalletInfo> {
    try {
      // Generate deterministic seed from userId
      const hash = crypto.createHash('sha256').update(userId).digest();
      
      // For TON, we'll use a simplified approach
      // In production, you'd use the TON SDK for proper wallet generation
      const tonAddress = this.generateTONAddress(hash);
      
      return {
        address: tonAddress,
        privateKey: hash.toString('hex'),
        derivationPath: 'ton-deterministic',
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate TON wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ton'
      );
    }
  }

  /**
   * Generate deterministic index from userId
   */
  private generateIndexFromUserId(userId: string): number {
    const hash = crypto.createHash('sha256').update(userId).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Generate TON address from hash (simplified implementation)
   */
  private generateTONAddress(hash: Buffer): string {
    // This is a simplified TON address generation
    // In production, use proper TON SDK methods
    const addressBytes = hash.slice(0, 32);
    return `EQ${addressBytes.toString('base64url')}`;
  }

  /**
   * Get existing wallets for a user
   */
  public async getUserWallets(userId: string): Promise<UserWallets | null> {
    // First check memory cache
    const cachedWallets = this.userWallets.get(userId);
    if (cachedWallets) {
      return cachedWallets;
    }

    // If not in cache, try database
    const dbWallets = await this.databaseService.getUserWallets(userId);
    if (dbWallets) {
      // Cache the result
      this.userWallets.set(userId, dbWallets);
      return dbWallets;
    }

    return null;
  }

  /**
   * Get wallet addresses only (for API response)
   */
  public async getWalletAddresses(userId: string): Promise<{ ethereum: string; bsc: string; polygon: string; solana: string; ton: string } | null> {
    const wallets = await this.getUserWallets(userId);
    if (!wallets) return null;

    return {
      ethereum: wallets.ethereum.address,
      bsc: wallets.bsc.address,
      polygon: wallets.polygon.address,
      solana: wallets.solana.address,
      ton: wallets.ton.address,
    };
  }

  /**
   * Validate wallet generation request
   */
  public validateWalletRequest(userId: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new WalletGenerationError('Invalid userId provided');
    }

    if (userId.trim().length === 0) {
      throw new WalletGenerationError('UserId cannot be empty');
    }

    // Check if wallets already exist
    if (this.userWallets.has(userId)) {
      throw new WalletGenerationError('Wallets already exist for this user');
    }
  }

  /**
   * Clear all stored wallets (for testing purposes)
   */
  public clearWallets(): void {
    this.userWallets.clear();
  }
} 