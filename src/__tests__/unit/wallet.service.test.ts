import { WalletService } from '../../services/wallet.service';
import { SecureStorageService } from '../../services/secure-storage.service';
import { DatabaseService } from '../../services/database.service';
import { QRCodeService } from '../../services/qr-code.service';
import { WalletGenerationError } from '../../types';

// Mock dependencies
jest.mock('../../services/database.service');
jest.mock('../../services/qr-code.service');
jest.mock('../../services/secure-storage.service');

describe('WalletService', () => {
  let walletService: WalletService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockQrCodeService: jest.Mocked<QRCodeService>;
  let mockSecureStorage: jest.Mocked<SecureStorageService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instance
    (WalletService as any).instance = null;
    
    walletService = WalletService.getInstance();
    
    // Get mocked instances
    mockDatabaseService = DatabaseService.getInstance() as jest.Mocked<DatabaseService>;
    mockQrCodeService = QRCodeService.getInstance() as jest.Mocked<QRCodeService>;
    mockSecureStorage = SecureStorageService.getInstance() as jest.Mocked<SecureStorageService>;
  });

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = WalletService.getInstance();
      const instance2 = WalletService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('generateWallets', () => {
    const testUserId = 'test-user-123';
    const mockQrCodes = {
      ethereum: 'data:image/png;base64,ethereum-qr',
      bsc: 'data:image/png;base64,bsc-qr',
      polygon: 'data:image/png;base64,polygon-qr',
      solana: 'data:image/png;base64,solana-qr',
      ton: 'data:image/png;base64,ton-qr',
    };

    beforeEach(() => {
      mockQrCodeService.generateWalletQRCodes.mockResolvedValue(mockQrCodes);
      mockDatabaseService.storeUserWallets.mockResolvedValue();
      mockSecureStorage.encryptWalletKeys.mockReturnValue({ encryptedPrivateKey: 'encrypted-key' });
    });

    it('should generate wallets for all chains successfully', async () => {
      const result = await walletService.generateWallets(testUserId);

      expect(result.userId).toBe(testUserId);
      expect(result.ethereum.address).toBeDefined();
      expect(result.bsc.address).toBeDefined();
      expect(result.polygon.address).toBeDefined();
      expect(result.solana.address).toBeDefined();
      expect(result.ton.address).toBeDefined();
      expect(result.ethereum.qrCode).toBe(mockQrCodes.ethereum);
      expect(result.bsc.qrCode).toBe(mockQrCodes.bsc);
      expect(result.polygon.qrCode).toBe(mockQrCodes.polygon);
      expect(result.solana.qrCode).toBe(mockQrCodes.solana);
      expect(result.ton.qrCode).toBe(mockQrCodes.ton);
    });

    it('should encrypt private keys before storage', async () => {
      await walletService.generateWallets(testUserId);

      expect(mockSecureStorage.encryptWalletKeys).toHaveBeenCalledTimes(5);
    });

    it('should store wallets in database', async () => {
      await walletService.generateWallets(testUserId);

      expect(mockDatabaseService.storeUserWallets).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          ethereum: expect.any(Object),
          bsc: expect.any(Object),
          polygon: expect.any(Object),
          solana: expect.any(Object),
          ton: expect.any(Object),
        })
      );
    });

    it('should generate QR codes for all addresses', async () => {
      await walletService.generateWallets(testUserId);

      expect(mockQrCodeService.generateWalletQRCodes).toHaveBeenCalledWith({
        ethereum: expect.any(String),
        bsc: expect.any(String),
        polygon: expect.any(String),
        solana: expect.any(String),
        ton: expect.any(String),
      });
    });

    it('should throw error if wallets already exist for user', async () => {
      // First generation
      await walletService.generateWallets(testUserId);

      // Second generation should fail
      await expect(walletService.generateWallets(testUserId)).rejects.toThrow(
        WalletGenerationError
      );
    });

    it('should throw error if QR code generation fails', async () => {
      mockQrCodeService.generateWalletQRCodes.mockRejectedValue(new Error('QR generation failed'));

      await expect(walletService.generateWallets(testUserId)).rejects.toThrow(
        WalletGenerationError
      );
    });

    it('should throw error if database storage fails', async () => {
      mockDatabaseService.storeUserWallets.mockRejectedValue(new Error('Database error'));

      await expect(walletService.generateWallets(testUserId)).rejects.toThrow(
        WalletGenerationError
      );
    });
  });

  describe('getUserWallets', () => {
    const testUserId = 'test-user-123';
    const mockUserWallets = {
      userId: testUserId,
      ethereum: { address: '0x123', privateKey: 'encrypted-key', derivationPath: 'm/44/60/0/0' },
      bsc: { address: '0x456', privateKey: 'encrypted-key', derivationPath: 'm/44/60/0/0' },
      polygon: { address: '0x789', privateKey: 'encrypted-key', derivationPath: 'm/44/60/0/0' },
      solana: { address: 'solana-addr', privateKey: 'encrypted-key', derivationPath: 'solana-deterministic' },
      ton: { address: 'ton-addr', privateKey: 'encrypted-key', derivationPath: 'ton-deterministic' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockDatabaseService.getUserWallets.mockResolvedValue(mockUserWallets);
    });

    it('should return user wallets from database', async () => {
      const result = await walletService.getUserWallets(testUserId);

      expect(result).toEqual(mockUserWallets);
      expect(mockDatabaseService.getUserWallets).toHaveBeenCalledWith(testUserId);
    });

    it('should return null if no wallets found', async () => {
      mockDatabaseService.getUserWallets.mockResolvedValue(null);

      const result = await walletService.getUserWallets(testUserId);

      expect(result).toBeNull();
    });
  });

  describe('getWalletAddresses', () => {
    const testUserId = 'test-user-123';
    const mockUserWallets = {
      userId: testUserId,
      ethereum: { address: '0x123', privateKey: 'encrypted-key', derivationPath: 'm/44/60/0/0' },
      bsc: { address: '0x456', privateKey: 'encrypted-key', derivationPath: 'm/44/60/0/0' },
      polygon: { address: '0x789', privateKey: 'encrypted-key', derivationPath: 'm/44/60/0/0' },
      solana: { address: 'solana-addr', privateKey: 'encrypted-key', derivationPath: 'solana-deterministic' },
      ton: { address: 'ton-addr', privateKey: 'encrypted-key', derivationPath: 'ton-deterministic' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockDatabaseService.getUserWallets.mockResolvedValue(mockUserWallets);
    });

    it('should return wallet addresses only', async () => {
      const result = await walletService.getWalletAddresses(testUserId);

      expect(result).toEqual({
        ethereum: '0x123',
        bsc: '0x456',
        polygon: '0x789',
        solana: 'solana-addr',
        ton: 'ton-addr',
      });
    });

    it('should return null if no wallets found', async () => {
      mockDatabaseService.getUserWallets.mockResolvedValue(null);

      const result = await walletService.getWalletAddresses(testUserId);

      expect(result).toBeNull();
    });
  });

  describe('validateWalletRequest', () => {
    it('should not throw error for valid userId', () => {
      expect(() => walletService.validateWalletRequest('valid-user-id')).not.toThrow();
    });

    it('should throw error for empty userId', () => {
      expect(() => walletService.validateWalletRequest('')).toThrow();
    });

    it('should throw error for undefined userId', () => {
      expect(() => walletService.validateWalletRequest(undefined as any)).toThrow();
    });
  });

  describe('clearWallets', () => {
    it('should clear in-memory wallets', async () => {
      // Generate wallets first
      await walletService.generateWallets('test-user');
      
      // Clear wallets
      walletService.clearWallets();
      
      // Try to generate again - should succeed
      await expect(walletService.generateWallets('test-user')).resolves.toBeDefined();
    });
  });
}); 