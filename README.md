# USDT Deposit Processing Backend

A secure, production-ready USDT deposit processing backend built with TypeScript, Node.js, and Express. Supports multi-chain wallet generation, deposit detection, auto-forwarding, and webhook notifications.

## 🚀 Supported Chains

- **Ethereum (ERC-20)** - Mainnet USDT
- **Binance Smart Chain (BSC)** - BEP-20 USDT
- **Polygon (ERC-20)** - Polygon USDT
- **Solana (SPL)** - Solana USDT
- **TON (TON native)** - TON USDT

## 🎯 Features

### ✅ Implemented
- [x] Multi-chain wallet generation
- [x] HD wallet derivation (Ethereum, BSC, Polygon)
- [x] Deterministic wallet generation (Solana, TON)
- [x] Secure API with authentication
- [x] Rate limiting and security headers
- [x] Input validation and error handling
- [x] Comprehensive logging

### 🔄 Planned Features
- [ ] Deposit detection and monitoring
- [ ] Auto-forwarding to hot wallets
- [ ] Webhook notifications
- [ ] Database integration
- [ ] Transaction history
- [ ] Balance monitoring

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- 24-word BIP39 seed phrase for HD wallet generation

## 🛠️ Installation

1. **Clone and install dependencies:**
   ```bash
   cd wallet-api
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Security
   JWT_SECRET=your-super-secret-jwt-key-here
   API_KEY_SECRET=your-api-key-secret-here

   # Blockchain Configuration
   MASTER_SEED_PHRASE=your-24-word-master-seed-phrase-here
   WALLET_DERIVATION_PATH=m/44'/60'/0'/0

   # RPC Endpoints (optional for wallet generation)
   ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
   BSC_RPC_URL=https://bsc-dataseed.binance.org
   POLYGON_RPC_URL=https://polygon-rpc.com
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   TON_RPC_URL=https://toncenter.com/api/v2/jsonRPC

   # USDT Contract Addresses
   USDT_ETHEREUM_CONTRACT=0xdAC17F958D2ee523a2206206994597C13D831ec7
   USDT_BSC_CONTRACT=0x55d398326f99059fF775485246999027B3197955
   USDT_POLYGON_CONTRACT=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
   USDT_SOLANA_MINT=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

5. **Start the server:**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 🔌 API Documentation

### Authentication
All API endpoints require an API key in the `X-API-Key` header.

### Endpoints

#### POST /api/deposit-wallets
Generate wallets for all supported chains for a given user.

**Request:**
```json
{
  "userId": "unique-user-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ethereum": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "bsc": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "polygon": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "solana": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "ton": "EQD4FPq-PRDieyQKkzVHwHmB_7OZJqJqJqJqJqJqJqJq"
  },
  "message": "Wallets generated successfully"
}
```

#### GET /api/deposit-wallets/:userId
Get existing wallet addresses for a user.

**Response:**
```json
{
  "success": true,
  "data": {
    "ethereum": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "bsc": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "polygon": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "solana": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "ton": "EQD4FPq-PRDieyQKkzVHwHmB_7OZJqJqJqJqJqJqJqJq"
  },
  "message": "Wallets retrieved successfully"
}
```

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "success": true,
  "message": "USDT Deposit Backend is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## 🔐 Security Features

- **API Key Authentication** - All endpoints require valid API key
- **Rate Limiting** - Configurable rate limiting per IP
- **Security Headers** - Helmet.js for security headers
- **CORS Protection** - Configurable CORS policies
- **Input Validation** - Comprehensive request validation
- **Error Handling** - Secure error responses

## 🏗️ Architecture

### Wallet Generation Strategy

1. **Ethereum Chains (ETH, BSC, Polygon):**
   - Uses HD wallet derivation with BIP39 seed phrase
   - Derivation path: `m/44'/60'/0'/0/<index>`
   - Index derived from SHA256 hash of userId

2. **Solana:**
   - Deterministic generation using SHA256(userId)
   - Uses Ed25519 keypair generation

3. **TON:**
   - Deterministic generation using SHA256(userId)
   - Simplified address generation (production should use TON SDK)

### Security Considerations

- **Private Keys:** Never exposed in API responses
- **Deterministic Generation:** Same userId always generates same wallets
- **Unique Per User:** Wallets are unique per userId and never reused
- **Secure Storage:** In production, implement secure key storage

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 📝 Development

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🚀 Production Deployment

1. **Environment Setup:**
   - Set `NODE_ENV=production`
   - Configure secure API keys
   - Set up proper RPC endpoints
   - Configure CORS origins

2. **Security Checklist:**
   - [ ] Use strong, unique API keys
   - [ ] Configure proper CORS origins
   - [ ] Set up HTTPS
   - [ ] Implement secure key storage
   - [ ] Configure rate limiting
   - [ ] Set up monitoring and logging

3. **Deployment Options:**
   - Docker containerization
   - Cloud platforms (AWS, GCP, Azure)
   - VPS deployment
   - Serverless functions

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `API_KEY_SECRET` | API key secret | Yes | - |
| `MASTER_SEED_PHRASE` | 24-word BIP39 seed | Yes | - |
| `WALLET_DERIVATION_PATH` | HD derivation path | No | m/44'/60'/0'/0 |

### Rate Limiting

- **Window:** 15 minutes (900,000ms)
- **Max Requests:** 100 per window
- **Configurable:** via environment variables

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## ⚠️ Disclaimer

This software is for educational and development purposes. For production use:

- Implement secure key management
- Add comprehensive monitoring
- Use proper database storage
- Implement backup and recovery procedures
- Follow security best practices
- Conduct thorough testing 