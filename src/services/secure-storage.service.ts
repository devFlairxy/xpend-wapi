import crypto from 'crypto';
import { config } from '../config';

/**
 * Secure Storage Service for Private Keys
 * 
 * This service provides encryption/decryption for private keys using:
 * - AES-256-GCM encryption (authenticated encryption)
 * - Environment-based encryption keys
 * - Secure random IV generation
 * - Key derivation from master secret
 */
export class SecureStorageService {
  private static instance: SecureStorageService;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits (AES-256)
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly saltLength = 32; // 256 bits
  private readonly iterations = 100000; // PBKDF2 iterations
  private readonly minKeyLength = 64; // Minimum key length (32 bytes = 64 hex chars)
  private readonly recommendedKeyLength = 124; // Recommended key length (62 bytes = 124 hex chars)

  private constructor() {}

  public static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  /**
   * Encrypt a private key for secure storage
   */
  public encryptPrivateKey(privateKey: string, walletId: string): string {
    try {
      // Generate a unique salt for this wallet using wallet ID
      const salt = crypto.pbkdf2Sync(walletId, 'wallet-salt', 1000, this.saltLength, 'sha256');
      
      // Derive encryption key from master secret and wallet ID
      const masterSecret = this.getMasterSecret();
      const derivedKey = crypto.pbkdf2Sync(
        masterSecret,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher with AES-256-GCM (authenticated encryption)
      const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);

      // Encrypt the private key
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine all components: salt + iv + tag + encrypted
      const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);
      
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Failed to encrypt private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a private key from secure storage
   */
  public decryptPrivateKey(encryptedData: string, walletId: string): string {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.subarray(0, this.saltLength);
      const iv = combined.subarray(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.subarray(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = combined.subarray(this.saltLength + this.ivLength + this.tagLength);

      // Verify salt matches wallet ID (security check)
      const expectedSalt = crypto.pbkdf2Sync(walletId, 'wallet-salt', 1000, this.saltLength, 'sha256');
      if (!salt.equals(expectedSalt)) {
        throw new Error('Invalid wallet ID for decryption');
      }

      // Derive the same key
      const masterSecret = this.getMasterSecret();
      const derivedKey = crypto.pbkdf2Sync(
        masterSecret,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      // Create decipher with AES-256-GCM
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get master secret for key derivation
   * Uses environment variable or generates from master seed phrase
   */
  private getMasterSecret(): string {
    // First try to use dedicated encryption key
    const encryptionKey = process.env['WALLET_ENCRYPTION_KEY'];
    if (encryptionKey) {
      return encryptionKey;
    }

    // Fallback to master seed phrase (less secure but functional)
    const masterSeedPhrase = config.blockchain.masterSeedPhrase;
    if (!masterSeedPhrase) {
      throw new Error('WALLET_ENCRYPTION_KEY or MASTER_SEED_PHRASE must be configured');
    }

    // Derive encryption key from seed phrase
    return crypto.createHash('sha256').update(masterSeedPhrase).digest('hex');
  }

  /**
   * Generate a secure random private key
   */
  public generateSecurePrivateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate encryption configuration
   */
  public validateConfiguration(): void {
    const masterSecret = this.getMasterSecret();
    if (!masterSecret || masterSecret.length < this.minKeyLength / 2) {
      throw new Error(`Invalid encryption configuration: master secret too short. Minimum ${this.minKeyLength / 2} bytes required`);
    }
    
    // Check if using recommended key length
    const encryptionKey = process.env['WALLET_ENCRYPTION_KEY'];
    if (encryptionKey && encryptionKey.length < this.recommendedKeyLength) {
      console.warn(`⚠️ Warning: Encryption key length (${encryptionKey.length}) is below recommended length (${this.recommendedKeyLength})`);
    }
  }

  /**
   * Test encryption/decryption (for validation)
   */
  public testEncryption(): boolean {
    try {
      const testKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const walletId = 'test-wallet';
      
      const encrypted = this.encryptPrivateKey(testKey, walletId);
      const decrypted = this.decryptPrivateKey(encrypted, walletId);
      
      return testKey === decrypted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get encryption info for debugging (without exposing keys)
   */
  public getEncryptionInfo(): {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
    saltLength: number;
    iterations: number;
    minKeyLength: number;
    recommendedKeyLength: number;
    hasEncryptionKey: boolean;
    hasMasterSeed: boolean;
    encryptionKeyLength?: number;
  } {
    const encryptionKey = process.env['WALLET_ENCRYPTION_KEY'];
    const info: any = {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      saltLength: this.saltLength,
      iterations: this.iterations,
      minKeyLength: this.minKeyLength,
      recommendedKeyLength: this.recommendedKeyLength,
      hasEncryptionKey: !!encryptionKey,
      hasMasterSeed: !!config.blockchain.masterSeedPhrase,
    };
    
    if (encryptionKey) {
      info.encryptionKeyLength = encryptionKey.length;
    }
    
    return info;
  }
} 