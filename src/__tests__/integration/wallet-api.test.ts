import request from 'supertest';
import app from '../../index';
import { DatabaseService } from '../../services/database.service';
import { config } from '../../config';

// Mock database service
jest.mock('../../services/database.service');

describe('Wallet API Integration Tests', () => {
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  const testApiKey = 'test-api-key-123';

  beforeAll(() => {
    // Set test API key
    process.env['API_KEY_SECRET'] = testApiKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseService = DatabaseService.getInstance() as jest.Mocked<DatabaseService>;
  });

  describe('POST /api/deposit-wallets', () => {
    const validRequest = {
      userId: 'test-user-123',
    };

    it('should generate wallets successfully with valid request', async () => {
      const response = await request(app.app)
        .post('/api/deposit-wallets')
        .set('X-API-Key', testApiKey)
        .send(validRequest)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ethereum');
      expect(response.body.data).toHaveProperty('bsc');
      expect(response.body.data).toHaveProperty('polygon');
      expect(response.body.data).toHaveProperty('solana');
      expect(response.body.data).toHaveProperty('ton');
      expect(response.body.message).toBe('Wallets generated successfully');
    });

    it('should return 401 without API key', async () => {
      const response = await request(app.app)
        .post('/api/deposit-wallets')
        .send(validRequest)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key');
    });

    it('should return 401 with invalid API key', async () => {
      const response = await request(app.app)
        .post('/api/deposit-wallets')
        .set('X-API-Key', 'invalid-key')
        .send(validRequest)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key');
    });

    it('should return 400 for missing userId', async () => {
      const response = await request(app.app)
        .post('/api/deposit-wallets')
        .set('X-API-Key', testApiKey)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Validation');
    });

    it('should return 400 for empty userId', async () => {
      const response = await request(app.app)
        .post('/api/deposit-wallets')
        .set('X-API-Key', testApiKey)
        .send({ userId: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Validation');
    });

    it('should return 500 when wallet generation fails', async () => {
      // Mock database service to throw error
      mockDatabaseService.storeUserWallets.mockRejectedValue(new Error('Database error'));

      const response = await request(app.app)
        .post('/api/deposit-wallets')
        .set('X-API-Key', testApiKey)
        .send(validRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to generate wallets');
    });
  });

  describe('GET /api/deposit-wallets/:userId', () => {
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

    it('should return wallet addresses successfully', async () => {
      mockDatabaseService.getUserWallets.mockResolvedValue(mockUserWallets);

      const response = await request(app.app)
        .get(`/api/deposit-wallets/${testUserId}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ethereum: '0x123',
        bsc: '0x456',
        polygon: '0x789',
        solana: 'solana-addr',
        ton: 'ton-addr',
      });
      expect(response.body.message).toBe('Wallets retrieved successfully');
    });

    it('should return 401 without API key', async () => {
      const response = await request(app.app)
        .get(`/api/deposit-wallets/${testUserId}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app.app)
        .get('/api/deposit-wallets/')
        .set('X-API-Key', testApiKey)
        .expect(404);
    });

    it('should return 404 when wallets not found', async () => {
      mockDatabaseService.getUserWallets.mockResolvedValue(null);

      const response = await request(app.app)
        .get(`/api/deposit-wallets/${testUserId}`)
        .set('X-API-Key', testApiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No wallets found for this user');
    });
  });

  describe('GET /api/deposit-wallets/:userId/qr-codes', () => {
    const testUserId = 'test-user-123';
    const mockUserWallets = {
      userId: testUserId,
      ethereum: { 
        address: '0x123', 
        privateKey: 'encrypted-key', 
        derivationPath: 'm/44/60/0/0',
        qrCode: 'data:image/png;base64,ethereum-qr'
      },
      bsc: { 
        address: '0x456', 
        privateKey: 'encrypted-key', 
        derivationPath: 'm/44/60/0/0',
        qrCode: 'data:image/png;base64,bsc-qr'
      },
      polygon: { 
        address: '0x789', 
        privateKey: 'encrypted-key', 
        derivationPath: 'm/44/60/0/0',
        qrCode: 'data:image/png;base64,polygon-qr'
      },
      solana: { 
        address: 'solana-addr', 
        privateKey: 'encrypted-key', 
        derivationPath: 'solana-deterministic',
        qrCode: 'data:image/png;base64,solana-qr'
      },
      ton: { 
        address: 'ton-addr', 
        privateKey: 'encrypted-key', 
        derivationPath: 'ton-deterministic',
        qrCode: 'data:image/png;base64,ton-qr'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return QR codes successfully', async () => {
      mockDatabaseService.getUserWallets.mockResolvedValue(mockUserWallets);

      const response = await request(app.app)
        .get(`/api/deposit-wallets/${testUserId}/qr-codes`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ethereum: 'data:image/png;base64,ethereum-qr',
        bsc: 'data:image/png;base64,bsc-qr',
        polygon: 'data:image/png;base64,polygon-qr',
        solana: 'data:image/png;base64,solana-qr',
        ton: 'data:image/png;base64,ton-qr',
      });
      expect(response.body.message).toBe('QR codes retrieved successfully');
    });

    it('should return 401 without API key', async () => {
      const response = await request(app.app)
        .get(`/api/deposit-wallets/${testUserId}/qr-codes`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key');
    });

    it('should return 404 when wallets not found', async () => {
      mockDatabaseService.getUserWallets.mockResolvedValue(null);

      const response = await request(app.app)
        .get(`/api/deposit-wallets/${testUserId}/qr-codes`)
        .set('X-API-Key', testApiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No wallets found for this user');
    });
  });

  describe('POST /api/deposits/check', () => {
    it('should trigger manual deposit check successfully', async () => {
      const response = await request(app.app)
        .post('/api/deposits/check')
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Manual deposit check completed');
    });

    it('should return 401 without API key', async () => {
      const response = await request(app.app)
        .post('/api/deposits/check')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key');
    });
  });

  describe('GET /api/deposits/status', () => {
    it('should return deposit monitoring status', async () => {
      const response = await request(app.app)
        .get('/api/deposits/status')
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('isMonitoring');
      expect(response.body.data).toHaveProperty('lastCheck');
    });

    it('should return 401 without API key', async () => {
      const response = await request(app.app)
        .get('/api/deposits/status')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key');
    });
  });

  describe('GET /health', () => {
    it('should return health check successfully', async () => {
      const response = await request(app.app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('USDT Deposit Backend is running');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('Rate Limiting', () => {
    it('should limit requests when exceeded', async () => {
      // Make multiple requests quickly
      const requests = Array.from({ length: 105 }, () =>
        request(app.app)
          .get('/health')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (429)
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
}); 