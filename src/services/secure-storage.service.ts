import crypto from 'crypto';
import { config } from '../config';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class SecureStorageService {
  private static instance: SecureStorageService;
  private masterKey: Buffer;
  private algorithm = 'aes-256-gcm';

  private constructor() {
    // Derive master key from environment variables
    const keyMaterial = `${config.security.jwtSecret}-${config.security.apiKeySecret}-${process.env['MASTER_SEED_PHRASE'] || ''}`;
    this.masterKey = crypto.scryptSync(keyMaterial, 'salt', 32);
  }

  public static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  /**
   * Encrypt sensitive data (private keys, etc.)
   */
  public encrypt(data: string): EncryptedData {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.masterKey);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: '', // Not available in older Node.js crypto API
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  public decrypt(encryptedData: EncryptedData): string {
    try {
      const decipher = crypto.createDecipher(this.algorithm, this.masterKey);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt wallet private keys for storage
   */
  public encryptWalletKeys(walletInfo: { privateKey: string }): { encryptedPrivateKey: string } {
    const encrypted = this.encrypt(walletInfo.privateKey);
    return {
      encryptedPrivateKey: JSON.stringify(encrypted),
    };
  }

  /**
   * Decrypt wallet private keys for use
   */
  public decryptWalletKeys(encryptedPrivateKey: string): string {
    const encryptedData: EncryptedData = JSON.parse(encryptedPrivateKey);
    return this.decrypt(encryptedData);
  }

  /**
   * Generate a secure random key
   */
  public generateSecureKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash sensitive data for comparison (one-way)
   */
  public hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
} 