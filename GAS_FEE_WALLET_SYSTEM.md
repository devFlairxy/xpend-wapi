# Gas Fee Wallet System

## Overview

The Gas Fee Wallet System separates the wallets that receive deposits from the wallets that pay for gas fees during forwarding operations. This provides better security, operational efficiency, and scalability.

## Architecture

### Before (Old System)
```
Deposit Wallet (Disposable)
├── Receives USDT/BUSD deposits
├── Pays gas fees for forwarding
└── Single point of failure
```

### After (New System)
```
Deposit Wallet (Disposable)     Gas Fee Wallet (Dedicated)
├── Receives USDT/BUSD deposits ├── Holds native tokens (ETH/BNB/MATIC)
├── Transfers tokens to master  ├── Provides gas fees for forwarding
└── No native tokens needed     └── Centralized gas fee management
```

## Key Benefits

### 1. **Security**
- **Separation of Concerns**: Deposit wallets only hold tokens, gas fee wallets only hold native tokens
- **Reduced Attack Surface**: Compromising a deposit wallet doesn't expose gas fee funds
- **Isolated Risk**: Gas fee wallet compromise doesn't affect deposit wallets

### 2. **Operational Efficiency**
- **Centralized Gas Management**: Single wallet per network for gas fees
- **Easier Funding**: Only need to fund one wallet per network for gas fees
- **Simplified Monitoring**: Monitor gas fee balances in one place per network

### 3. **Scalability**
- **Unlimited Deposit Wallets**: Generate as many disposable wallets as needed
- **Shared Gas Infrastructure**: All forwarding operations use the same gas fee wallet
- **Cost Optimization**: Bulk gas fee purchases and management

## Configuration

### Environment Variables

Add these environment variables to your `.env` file:

```bash
# Gas Fee Wallet Addresses
GAS_FEE_WALLET_ETH=0x...     # Ethereum gas fee wallet address
GAS_FEE_WALLET_BSC=0x...     # BSC gas fee wallet address  
GAS_FEE_WALLET_POLYGON=0x... # Polygon gas fee wallet address
GAS_FEE_WALLET_SOLANA=...    # Solana gas fee wallet address
GAS_FEE_WALLET_TRON=...      # Tron gas fee wallet address
GAS_FEE_WALLET_BUSD=0x...    # BUSD gas fee wallet address (uses BSC)

# Gas Fee Wallet Private Keys (Encrypted)
GAS_FEE_WALLET_KEY_ETH=...   # Encrypted Ethereum private key
GAS_FEE_WALLET_KEY_BSC=...   # Encrypted BSC private key
GAS_FEE_WALLET_KEY_POLYGON=... # Encrypted Polygon private key
GAS_FEE_WALLET_KEY_SOLANA=...  # Encrypted Solana private key
GAS_FEE_WALLET_KEY_TRON=...    # Encrypted Tron private key
GAS_FEE_WALLET_KEY_BUSD=...    # Encrypted BUSD private key (uses BSC)
```

### Private Key Encryption

Gas fee wallet private keys are encrypted using the same `SecureStorageService` as disposable wallets:

```typescript
// Encryption key format: `gas-fee-{network}`
const privateKey = secureStorage.decryptPrivateKey(encryptedKey, `gas-fee-${network}`);
```

## How It Works

### 1. **Deposit Detection**
```typescript
// Deposit wallet receives USDT/BUSD
const depositWallet = await walletService.generateDisposableWallet(userId, network);
// depositWallet.address receives tokens
```

### 2. **Forwarding Process**
```typescript
// When forwarding is triggered:
const gasFeeWallet = await gasFeeWalletService.getGasFeeWallet(network);

// Check if deposit wallet has gas fees
const depositWalletBalance = await provider.getBalance(depositWallet.address);
const requiredGasFee = gasEstimate.safeEstimatedFee;

if (depositWalletBalance < requiredGasFee) {
  // Transfer gas fees from gas fee wallet to deposit wallet
  await gasFeeWalletInstance.sendTransaction({
    to: depositWallet.address,
    value: requiredGasFee,
    gasLimit: 21000,
  });
}

// Now deposit wallet can forward tokens to master wallet
await depositWallet.sendTransaction(forwardTransaction);
```

### 3. **Balance Monitoring**
```typescript
// Monitor gas fee wallet balances
const gasFeeWallets = await gasFeeWalletService.getAllGasFeeWalletStatuses();
// Send alerts when balances are low
```

## Services

### GasFeeWalletService

Manages dedicated gas fee wallets for each network.

```typescript
const gasFeeWalletService = GasFeeWalletService.getInstance();

// Get gas fee wallet for a network
const wallet = await gasFeeWalletService.getGasFeeWallet('ethereum');

// Validate balance
const validation = await gasFeeWalletService.validateGasFeeWalletBalance(
  'ethereum', 
  '0.001'
);

// Check if configured
const isConfigured = gasFeeWalletService.isGasFeeWalletConfigured('ethereum');
```

### Updated ForwarderService

Uses gas fee wallets to provide gas fees for forwarding operations.

```typescript
const forwarderService = ForwarderService.getInstance();

// Forwarding now automatically uses gas fee wallets
const result = await forwarderService.forwardFunds(forwardRequest);
```

### Updated WalletBalanceMonitorService

Monitors gas fee wallet balances instead of disposable wallet balances.

```typescript
const monitorService = WalletBalanceMonitorService.getInstance();

// Start monitoring gas fee wallets
await monitorService.startMonitoring({
  enabledNetworks: ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'],
  slackChannel: '#gas-fee-alerts',
  thresholds: [
    {
      network: 'ethereum',
      lowThreshold: ethers.parseEther('0.05'),    // 0.05 ETH
      criticalThreshold: ethers.parseEther('0.02'), // 0.02 ETH
      priority: 'high'
    }
  ]
});
```

#### Key Features:
- **Multi-Network Support**: Monitors all supported networks (Ethereum, BSC, Polygon, Solana, Tron, BUSD)
- **Network-Specific Thresholds**: Different thresholds for each network based on gas costs
- **Real-Time Alerts**: Immediate Slack notifications when balances are low
- **Balance History**: Tracks balance changes over time
- **Transfer Estimation**: Estimates how many transfers remaining before funding needed

## Testing

### Run the Test Scripts

```bash
# Test gas fee wallet system
npm run ts-node scripts/test-gas-fee-wallet-system.ts

# Test gas fee wallet monitoring
npm run ts-node scripts/test-gas-fee-wallet-monitoring.ts

# Test Slack alerts
npm run ts-node scripts/test-gas-fee-slack-alerts.ts
```

These will test:
- Gas fee wallet configuration
- Balance validation
- Forwarder service integration
- All network support
- Monitoring system functionality
- Slack alert integration

### Manual Testing

```typescript
// Test gas fee wallet setup
const gasFeeWallet = await gasFeeWalletService.getGasFeeWallet('ethereum');
console.log(`Gas fee wallet: ${gasFeeWallet.address}`);
console.log(`Balance: ${gasFeeWallet.balance} ETH`);

// Test forwarding with gas fee wallet
const result = await forwarderService.forwardFunds({
  userId: 'test-user',
  network: 'ethereum',
  amount: '10',
  privateKey: depositWalletPrivateKey,
  // ... other fields
});
```

## Monitoring and Alerts

### Balance Monitoring

The `WalletBalanceMonitorService` now monitors gas fee wallets with enhanced features:

#### Default Configuration
```typescript
const defaultConfig = {
  checkInterval: 300000, // 5 minutes
  alertCooldown: 1800000, // 30 minutes
  enabledNetworks: ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'],
  thresholds: [
    {
      network: 'ethereum',
      lowThreshold: ethers.parseEther('0.05'),    // 0.05 ETH
      criticalThreshold: ethers.parseEther('0.02'), // 0.02 ETH
      priority: 'high'
    },
    {
      network: 'bsc',
      lowThreshold: ethers.parseEther('0.05'),    // 0.05 BNB
      criticalThreshold: ethers.parseEther('0.02'), // 0.02 BNB
      priority: 'high'
    },
    {
      network: 'polygon',
      lowThreshold: ethers.parseEther('0.1'),     // 0.1 MATIC
      criticalThreshold: ethers.parseEther('0.05'), // 0.05 MATIC
      priority: 'high'
    }
  ],
  slackChannel: '#gas-fee-alerts',
  enableNotifications: true,
  maxAlertsPerHour: 10,
  balanceHistory: true,
  estimatedTransferCost: ethers.parseEther('0.002') // 0.002 ETH per transfer
};
```

#### Multi-Network Balance Support
- **EVM Chains**: Ethereum, BSC, Polygon, BUSD (uses BSC)
- **Solana**: Native SOL balance monitoring
- **Tron**: TRX balance monitoring
- **Automatic Conversion**: All balances converted to wei for consistent comparison

```typescript
// Configure monitoring
const config = {
  enabledNetworks: ['ethereum', 'bsc', 'polygon'],
  thresholds: [
    {
      network: 'ethereum',
      lowThreshold: ethers.parseEther('0.01'),    // 0.01 ETH
      criticalThreshold: ethers.parseEther('0.005'), // 0.005 ETH
      priority: 'high'
    }
  ],
  slackChannel: '#gas-fee-alerts'
};

await monitorService.startMonitoring(config);
```

### Slack Alerts

Receive alerts when gas fee wallet balances are low:

#### Critical Balance Alerts
When a gas fee wallet has insufficient balance for a transfer operation, a critical alert is sent to Slack:

```
🚨 CRITICAL: Gas Fee Wallet Insufficient Balance - ETHEREUM
Network: ETHEREUM
Wallet Address: 0x1234...5678
Current Balance: 0.003 ETH
Required Balance: 0.01 ETH
Deficit: 0.007 ETH
Transfer Amount: 100 USDT
User ID: user123
Time: 2024-01-15T10:30:00.000Z

⚠️ IMMEDIATE ACTION REQUIRED:
• Fund the gas fee wallet immediately
• Transfer operations are blocked
• Check wallet balance and add funds
```

#### Balance Monitoring Alerts
Regular monitoring alerts for low balances:

```
💰 Low Wallet Balance Alert - 1 wallet(s)
🔴 ETHEREUM
   Address: 0x1234...5678
   Balance: 0.003 ETH
   Threshold: 0.005 ETH
   Deficit: 0.002 ETH
   Transfers Remaining: ~3
```

## Migration Guide

### From Old System

1. **Set up gas fee wallets**:
   ```bash
   # Generate new wallets for gas fees
   # Fund them with native tokens
   # Add to environment variables
   ```

2. **Update configuration**:
   ```bash
   # Add gas fee wallet environment variables
   GAS_FEE_WALLET_ETH=0x...
   GAS_FEE_WALLET_KEY_ETH=...
   ```

3. **Test the system**:
   ```bash
   npm run ts-node scripts/test-gas-fee-wallet-system.ts
   ```

4. **Deploy and monitor**:
   ```bash
   # Deploy updated code
   # Monitor gas fee wallet balances
   # Set up alerts
   ```

### Backward Compatibility

- Existing disposable wallets continue to work
- No changes needed to deposit detection
- Forwarding automatically uses new gas fee system
- Gradual migration possible

## Security Considerations

### 1. **Private Key Management**
- Gas fee wallet private keys are encrypted
- Use strong encryption keys
- Rotate keys periodically
- Store keys securely

### 2. **Access Control**
- Limit access to gas fee wallets
- Use multi-signature wallets for high-value operations
- Monitor all gas fee wallet transactions

### 3. **Balance Management**
- Set appropriate balance thresholds
- Monitor for unusual activity
- Have backup funding sources

### 4. **Network Security**
- Use secure RPC endpoints
- Validate all transactions
- Monitor for failed transactions

## Best Practices

### 1. **Gas Fee Wallet Setup**
- Use dedicated wallets for each network
- Fund with appropriate amounts
- Monitor balances regularly
- Set up automated alerts

### 2. **Balance Management**
- Keep sufficient balance for expected volume
- Monitor gas price trends
- Adjust thresholds based on usage
- Have emergency funding procedures

### 3. **Monitoring**
- Set up comprehensive monitoring
- Monitor both balances and transaction success
- Track gas fee costs
- Alert on unusual patterns

### 4. **Backup and Recovery**
- Have backup gas fee wallets
- Document recovery procedures
- Test recovery processes
- Maintain emergency contacts

## Troubleshooting

### Common Issues

1. **"Gas fee wallet not configured"**
   - Check environment variables
   - Verify wallet addresses and keys
   - Ensure encryption is working

2. **"Insufficient balance in gas fee wallet"**
   - Fund the gas fee wallet
   - Check balance thresholds
   - Monitor gas price increases

3. **"Forwarding failed"**
   - Check gas fee wallet balance
   - Verify network connectivity
   - Check transaction parameters

### Debug Commands

```bash
# Check gas fee wallet status
npm run ts-node scripts/test-gas-fee-wallet-system.ts

# Check specific wallet balance
curl -X GET "http://localhost:3000/api/wallet/balance/ethereum/0x..."

# Monitor gas fee wallet
npm run ts-node scripts/test-wallet-balance-monitor.service.ts
```

## API Reference

### GasFeeWalletService Methods

```typescript
// Get gas fee wallet for network
getGasFeeWallet(network: string): Promise<GasFeeWalletInfo>

// Validate balance
validateGasFeeWalletBalance(network: string, requiredAmount: string): Promise<BalanceValidation>

// Get all statuses
getAllGasFeeWalletStatuses(): Promise<GasFeeWalletInfo[]>

// Check configuration
isGasFeeWalletConfigured(network: string): boolean

// Get wallet address
getGasFeeWalletAddress(network: string): string | null
```

### Configuration

```typescript
// Environment variables structure
config.blockchain.gasFeeWallets = {
  ethereum: process.env.GAS_FEE_WALLET_ETH,
  bsc: process.env.GAS_FEE_WALLET_BSC,
  polygon: process.env.GAS_FEE_WALLET_POLYGON,
  solana: process.env.GAS_FEE_WALLET_SOLANA,
  tron: process.env.GAS_FEE_WALLET_TRON,
  busd: process.env.GAS_FEE_WALLET_BUSD,
}

config.blockchain.gasFeeWalletKeys = {
  ethereum: process.env.GAS_FEE_WALLET_KEY_ETH,
  bsc: process.env.GAS_FEE_WALLET_KEY_BSC,
  polygon: process.env.GAS_FEE_WALLET_KEY_POLYGON,
  solana: process.env.GAS_FEE_WALLET_KEY_SOLANA,
  tron: process.env.GAS_FEE_WALLET_KEY_TRON,
  busd: process.env.GAS_FEE_WALLET_KEY_BUSD,
}
```

## Conclusion

The Gas Fee Wallet System provides a robust, secure, and scalable solution for managing gas fees in deposit forwarding operations. By separating concerns and centralizing gas fee management, it improves security, operational efficiency, and maintainability.

For questions or support, refer to the troubleshooting section or contact the development team. 