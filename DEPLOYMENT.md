# Wallet API Deployment Guide for Render

This guide covers deploying the wallet-api service to Render.com for production use.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Ensure your code is pushed to GitHub
3. **Environment Variables**: Prepare all required environment variables
4. **Database Setup**: PostgreSQL database connection ready

## Deployment Steps

### 1. Create Database

1. In Render Dashboard, click "New +" → "PostgreSQL"
2. Choose your database name: `wallet-api-db`
3. Select your region and plan
4. Note the database connection details (will be auto-provided as `DATABASE_URL`)

### 2. Create Web Service

1. In Render Dashboard, click "New +" → "Web Service"
2. Connect your GitHub repository
3. Select the `wallet-api` directory (if in a monorepo)
4. Configure the service:
   - **Name**: `wallet-api`
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your production branch)
   - **Build Command**: `npm install && npm run db:generate && npm run build`
   - **Start Command**: `npm run db:migrate && npm start`

### 3. Environment Variables

Set these environment variables in Render Dashboard:

#### Required (Set as secrets)
```
DATABASE_URL=<auto-provided-by-render-database>
JWT_SECRET=<secure-random-string>
API_KEY_SECRET=<secure-random-string>
MASTER_SEED_PHRASE=<24-word-mnemonic-phrase>
ETHEREUM_RPC_URL=<infura-or-alchemy-url>
WEBHOOK_SECRET=<webhook-secret-key>
SHARED_SECRET=<shared-secret-with-credo>
DEPOSIT_WEBHOOK_URL=<credo-webhook-endpoint>
```

#### Master Wallet Addresses (Set as secrets)
```
MASTER_WALLET_ETH=<ethereum-master-wallet>
MASTER_WALLET_BSC=<bsc-master-wallet>
MASTER_WALLET_POLYGON=<polygon-master-wallet>
MASTER_WALLET_SOLANA=<solana-master-wallet>
MASTER_WALLET_TRON=<tron-master-wallet>
```

#### Optional (Can be set as values)
```
NODE_ENV=production
PORT=3001
BSC_RPC_URL=https://bsc-dataseed.binance.org
POLYGON_RPC_URL=https://polygon-rpc.com
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TRON_RPC_URL=https://api.trongrid.io
WALLET_DERIVATION_PATH=m/44'/60'/0'/0
USDT_ETHEREUM_CONTRACT=0xdAC17F958D2ee523a2206206994597C13D831ec7
USDT_BSC_CONTRACT=0x55d398326f99059fF775485246999027B3197955
USDT_POLYGON_CONTRACT=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
USDT_SOLANA_MINT=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
USDT_TRON_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Database Migration

The database will be automatically migrated on deployment through the start command:
```bash
npm run db:migrate && npm start
```

### 5. Health Check

The service includes a health check endpoint at `/health` which Render will use to monitor service health.

## Security Considerations

### Critical Environment Variables

1. **MASTER_SEED_PHRASE**: This is the master mnemonic for generating all wallets. Keep it secure!
2. **JWT_SECRET**: Used for authentication token signing
3. **API_KEY_SECRET**: Used for API key validation
4. **SHARED_SECRET**: Used for webhook signature verification with credo
5. **Master Wallet Addresses**: These receive all auto-forwarded funds

### Network Security

1. **RPC Endpoints**: Use production-grade RPC providers (Infura, Alchemy, etc.)
2. **Rate Limiting**: Configured to prevent abuse
3. **CORS**: Properly configured for your domain
4. **Webhook Signatures**: All webhooks are signed using HMAC-SHA256

## Monitoring and Logging

### Health Monitoring
- Health check endpoint: `GET /health`
- Monitor response time and availability

### Logging
- Application logs are written to stdout (captured by Render)
- Set `LOG_LEVEL=info` for production
- Consider integrating Sentry for error tracking

### Database Monitoring
- Monitor database connections and query performance
- Set up alerts for database health

## Post-Deployment Verification

### 1. Health Check
```bash
curl https://your-wallet-api.onrender.com/health
```
Expected response: `{"status":"ok","timestamp":"..."}`

### 2. Database Connection
Check logs for successful database connection and migration.

### 3. Test Wallet Generation
Use the wallet generation endpoint to ensure all networks are working:
```bash
curl -X POST https://your-wallet-api.onrender.com/api/wallets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{"userId": "test-user-123"}'
```

### 4. Test Deposit Monitoring
Create a deposit watch and verify monitoring starts:
```bash
curl -X POST https://your-wallet-api.onrender.com/api/deposits/watch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "userId": "test-user-123",
    "network": "ethereum",
    "amount": "100",
    "webhookUrl": "https://your-credo-service.com/webhooks/wallet-api/deposit"
  }'
```

## Scaling Considerations

### Performance
- **Plan**: Start with Starter plan, upgrade to Standard/Pro as needed
- **Database**: Monitor database performance and upgrade if needed
- **Rate Limiting**: Adjust based on actual usage patterns

### Auto-Scaling
- Render automatically scales based on traffic
- Monitor response times and adjust plan accordingly

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check DATABASE_URL is correctly set
   - Verify database is running and accessible

2. **Wallet Generation Fails**
   - Check MASTER_SEED_PHRASE is valid 24-word mnemonic
   - Verify RPC endpoints are accessible

3. **Webhook Delivery Fails**
   - Check DEPOSIT_WEBHOOK_URL is correct
   - Verify SHARED_SECRET matches credo configuration
   - Check network connectivity to credo service

4. **Auto-Forwarding Fails**
   - Verify master wallet addresses are correct
   - Check master wallets have sufficient gas/fees
   - Monitor transaction gas prices

### Log Analysis
```bash
# View recent logs
render logs --service-id=<your-service-id>

# Follow logs in real-time
render logs --service-id=<your-service-id> --follow
```

## Maintenance

### Regular Updates
1. Keep dependencies updated
2. Monitor security advisories
3. Update RPC endpoints if needed
4. Rotate secrets periodically

### Backup Strategy
1. Database backups are handled by Render
2. Keep secure backups of environment variables
3. Document master wallet addresses securely

## Support

For deployment issues:
1. Check Render documentation
2. Review application logs
3. Verify environment variables
4. Test network connectivity
5. Monitor database performance

## Security Best Practices

1. **Never commit secrets** to version control
2. **Rotate keys regularly** (especially wallet private keys)
3. **Monitor unusual activity** in wallet transactions
4. **Use strong, unique passwords** for all accounts
5. **Enable 2FA** on Render and GitHub accounts
6. **Regularly audit** wallet balances and transactions
7. **Keep master wallets secure** and backed up offline 