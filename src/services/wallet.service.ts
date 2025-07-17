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
      // Generate deterministic index from userId
      const index = this.generateIndexFromUserId(userId);

      // Generate wallets for each chain
      const ethereumWallet = await this.generateEthereumWallet(userId, index);
      const bscWallet = await this.generateBSCWallet(userId, index);
      const polygonWallet = await this.generatePolygonWallet(userId, index);
      const solanaWallet = await this.generateSolanaWallet(userId);
      const tronWallet = await this.generateTronWallet(userId, index);

      // Generate QR codes for all addresses
      const qrCodes = await this.qrCodeService.generateWalletQRCodes({
        ethereum: ethereumWallet.address,
        bsc: bscWallet.address,
        polygon: polygonWallet.address,
        solana: solanaWallet.address,
        tron: tronWallet.address,
      });

      // Add QR codes to wallet info
      ethereumWallet.qrCode = qrCodes.ethereum;
      bscWallet.qrCode = qrCodes.bsc;
      polygonWallet.qrCode = qrCodes.polygon;
      solanaWallet.qrCode = qrCodes.solana;
      tronWallet.qrCode = qrCodes.tron;

      const wallets: UserWallets = {
        userId,
        ethereum: { ...ethereumWallet, qrCode: qrCodes.ethereum },
        bsc: { ...bscWallet, qrCode: qrCodes.bsc },
        polygon: { ...polygonWallet, qrCode: qrCodes.polygon },
        solana: { ...solanaWallet, qrCode: qrCodes.solana },
        tron: { ...tronWallet, qrCode: qrCodes.tron },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store the wallets in memory and database
      this.userWallets.set(userId, wallets);
      await this.databaseService.storeUserWallets(wallets);

      return wallets;
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
   * Generate Tron wallet using deterministic HD wallet
   */
  private async generateTronWallet(_userId: string, index: number): Promise<WalletInfo> {
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
        address: tronAddress,
        privateKey: wallet.privateKey,
        derivationPath,
      };
    } catch (error) {
      throw new WalletGenerationError(
        `Failed to generate Tron wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'tron'
      );
    }
  }

  /**
   * Generate deterministic index from userId
   */
  private generateIndexFromUserId(userId: string): number {
    const hash = crypto.createHash('sha256').update(userId).digest();
    // Use modulo to ensure the index is within a reasonable range (0 to 999999)
    // This prevents BIP44 derivation path errors while maintaining deterministic generation
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
  public async getWalletAddresses(userId: string): Promise<{ ethereum: string; bsc: string; polygon: string; solana: string; tron: string } | null> {
    const wallets = await this.getUserWallets(userId);
    if (!wallets) return null;

    return {
      ethereum: wallets.ethereum.address,
      bsc: wallets.bsc.address,
      polygon: wallets.polygon.address,
      solana: wallets.solana.address,
      tron: wallets.tron.address,
    };
  }

  /**
   * Get wallet information for a specific network
   */
  public async getNetworkWallet(userId: string, network: string): Promise<{ address: string; qrCode?: string } | null> {
    const wallets = await this.getUserWallets(userId);
    if (!wallets) return null;

    // Validate network
    const supportedNetworks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron'];
    if (!supportedNetworks.includes(network)) {
      throw new WalletGenerationError(`Unsupported network: ${network}. Supported networks: ${supportedNetworks.join(', ')}`);
    }

    const walletInfo = wallets[network as keyof typeof wallets];
    if (!walletInfo || typeof walletInfo === 'string' || walletInfo instanceof Date) {
      throw new WalletGenerationError(`No wallet found for network: ${network}`);
    }

    const result: { address: string; qrCode?: string } = {
      address: walletInfo.address,
    };
    
    if (walletInfo.qrCode) {
      result.qrCode = walletInfo.qrCode;
    }
    
    return result;
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

    // Note: Existing wallet check is now handled in the controller
  }

  /**
   * Clear all stored wallets (for testing purposes)
   */
  public clearWallets(): void {
    this.userWallets.clear();
  }
} 