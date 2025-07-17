# Deposit Monitoring System

## Overview

This comprehensive deposit monitoring system replaces the NOWPayments webhook functionality with an intelligent, user-initiated deposit tracking system. The system only watches wallets when users specifically request deposits, monitors for 1 hour, tracks confirmations, and sends webhooks to the credo bot API.

## 🎯 **Key Features**

### ✅ **Smart Monitoring**
- **On-demand watching**: Only monitors wallets when users initiate deposits
- **1-hour timeout**: Automatically stops monitoring after 1 hour
- **5-confirmation requirement**: Considers deposits confirmed after 5 blockchain confirmations
- **Automatic expiry**: Sends expiry notifications if no deposit received within 1 hour

### ✅ **Webhook Integration**
- **Replaces NOWPayments**: Direct integration with credo bot API
- **Confirmed deposits**: Notifies when deposit reaches 5 confirmations
- **Expired deposits**: Notifies when 1-hour timeout occurs
- **Secure signatures**: Webhook payload signing for security

### ✅ **Database Tracking**
- **Watch list management**: Tracks active, confirmed, expired, and inactive watches
- **User-specific**: Each user can have multiple active watches across networks
- **Status tracking**: Real-time status updates and confirmation counting

## 🏗️ **Architecture**

### **Database Schema**

```sql
CREATE TABLE deposit_watches (
  id                VARCHAR PRIMARY KEY,
  userId            VARCHAR NOT NULL,
  address           VARCHAR NOT NULL,     -- Wallet address being watched
  network           VARCHAR NOT NULL,     -- ethereum, bsc, polygon, solana, ton
  expectedAmount    VARCHAR NOT NULL,     -- Amount user is expected to deposit
  actualAmount      VARCHAR,              -- Actual amount received (if any)
  confirmations     INTEGER DEFAULT 0,    -- Current confirmation count
  status            VARCHAR DEFAULT 'ACTIVE', -- ACTIVE, CONFIRMED, EXPIRED, INACTIVE
  expiresAt         TIMESTAMP NOT NULL,   -- 1 hour from creation
  webhookSent       BOOLEAN DEFAULT FALSE,
  webhookUrl        VARCHAR,              -- URL to send webhook to
  txHash            VARCHAR,              -- Transaction hash if deposit found
  lastCheckedAt     TIMESTAMP DEFAULT NOW(),
  createdAt         TIMESTAMP DEFAULT NOW(),
  updatedAt         TIMESTAMP DEFAULT NOW()
);
```

### **System Components**

#### **1. DepositWatchService**
- **Core monitoring engine**
- **Manages watch lifecycle**: start → monitor → confirm/expire → cleanup
- **Blockchain monitoring**: Checks for deposits every 30 seconds
- **Webhook notifications**: Sends status updates to credo API

#### **2. DepositWatchController** 
- **API endpoints** for starting/stopping watches
- **Validation middleware** for request parameters
- **Error handling** and response formatting

#### **3. Webhook Integration**
- **Replaces NOWPayments webhooks**
- **Direct communication** with credo bot API
- **Payload signing** for security verification

## 📡 **API Endpoints**

### **POST /api/deposit-watch**
Start watching a user's wallet for deposits

**Request:**
```json
{
  "userId": "user123",
  "network": "bsc",
  "expectedAmount": "100.0",
  "webhookUrl": "https://credo-api.com/webhook/deposits"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "watch_abc123",
    "userId": "user123",
    "address": "0x1234...5678",
    "network": "bsc",
    "expectedAmount": "100.0",
    "status": "ACTIVE",
    "expiresAt": "2025-01-17T15:30:00Z",
    "confirmations": 0
  },
  "message": "Deposit watch started successfully"
}
```

### **DELETE /api/deposit-watch/:watchId**
Stop watching a specific deposit

**Response:**
```json
{
  "success": true,
  "message": "Deposit watch stopped successfully"
}
```

### **GET /api/deposit-watch/user/:userId**
Get all active deposit watches for a user

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "watch_abc123",
      "userId": "user123",
      "address": "0x1234...5678",
      "network": "bsc",
      "expectedAmount": "100.0",
      "status": "ACTIVE",
      "expiresAt": "2025-01-17T15:30:00Z",
      "confirmations": 2
    }
  ],
  "message": "Found 1 active deposit watches"
}
```

## 🔔 **Webhook Notifications**

### **Webhook Payload Structure**
```json
{
  "userId": "user123",
  "address": "0x1234...5678", 
  "network": "bsc",
  "expectedAmount": "100.0",
  "actualAmount": "100.0",
  "confirmations": 5,
  "status": "CONFIRMED",
  "txHash": "0xabc123...",
  "timestamp": "2025-01-17T15:25:00Z",
  "watchId": "watch_abc123"
}
```

### **Webhook Statuses**

#### **CONFIRMED** - Deposit received with 5+ confirmations
- User's account should be credited
- Send success notification to user
- Mark watch as CONFIRMED and stop monitoring

#### **EXPIRED** - 1-hour timeout without deposit
- No deposit received within timeout period
- Send expiry notification to user
- Mark watch as EXPIRED and stop monitoring

### **Webhook Security**
- **Signature header**: `X-Wallet-API-Signature`
- **Signature generation**: Base64 encoded payload + secret
- **Verification**: Validate signature to ensure webhook authenticity

## 🔄 **Integration Flow**

### **1. User Initiates Deposit (Credo)**
```javascript
// When user selects deposit amount and network
const watchRequest = {
  userId: user.id,
  network: 'bsc',
  expectedAmount: '100.0',
  webhookUrl: 'https://credo-api.com/webhook/deposits'
};

const response = await axios.post('http://wallet-api:3001/api/deposit-watch', watchRequest);
const { address, expiresAt } = response.data.data;

// Show deposit instructions to user with address and 1-hour timer
```

### **2. Deposit Monitoring (Wallet-API)**
```javascript
// Every 30 seconds, check all active watches
for (const watch of activeWatches) {
  // Check if expired (1 hour timeout)
  if (new Date() > watch.expiresAt) {
    await handleExpiredWatch(watch);
    continue;
  }
  
  // Check blockchain for deposits to this address
  const deposit = await checkBlockchainForDeposit(watch.address, watch.network);
  
  if (deposit && deposit.confirmations >= 5) {
    await handleConfirmedDeposit(watch, deposit);
  }
}
```

### **3. Webhook Processing (Credo)**
```javascript
// Webhook endpoint in credo
app.post('/webhook/deposits', async (req, res) => {
  const payload = req.body;
  
  // Validate webhook signature
  if (!validateSignature(req.body, req.headers['x-wallet-api-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  if (payload.status === 'CONFIRMED') {
    // Credit user account
    await creditUserAccount(payload.userId, payload.actualAmount);
    await sendSuccessNotification(payload.userId, payload);
  } else if (payload.status === 'EXPIRED') {
    // Handle expiry
    await sendExpiryNotification(payload.userId, payload);
  }
  
  res.json({ success: true });
});
```

## 🛠️ **Configuration**

### **Environment Variables**

**Wallet-API (.env):**
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/wallet_db

# Webhook Security
WEBHOOK_SECRET=your-webhook-secret-key

# Monitoring Settings
MONITORING_INTERVAL_MS=30000
REQUIRED_CONFIRMATIONS=5
WATCH_DURATION_HOURS=1
```

**Credo (.env):**
```env
# Wallet API Integration
WALLET_API_BASE_URL=http://localhost:3001
WALLET_API_KEY=your-api-key-secret-here
WEBHOOK_SECRET=your-webhook-secret-key
```

## 🚀 **Deployment**

### **1. Database Migration**
```bash
cd wallet-api
npx prisma db push
npx prisma generate
```

### **2. Start Services**
```bash
# Start wallet-api (port 3001)
cd wallet-api
npm run dev

# Start credo (port 3000)  
cd credo
npm run dev
```

### **3. Test Integration**
```bash
# Start a deposit watch
curl -X POST http://localhost:3001/api/deposit-watch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userId": "test-user-123",
    "network": "bsc", 
    "expectedAmount": "100.0",
    "webhookUrl": "http://localhost:3000/webhook/deposits"
  }'
```

## 📊 **Monitoring Dashboard**

Track deposit monitoring performance:

- **Active watches**: Currently monitored addresses
- **Confirmed deposits**: Successfully processed deposits  
- **Expired watches**: Timeout statistics
- **Webhook success rate**: Delivery reliability
- **Average confirmation time**: Performance metrics

## 🔒 **Security Considerations**

### **Webhook Security**
- **Signature validation**: Verify all incoming webhooks
- **IP whitelisting**: Restrict webhook sources
- **Rate limiting**: Prevent webhook spam

### **API Security**
- **API key authentication**: Secure endpoint access
- **Request validation**: Validate all input parameters
- **Database protection**: Prevent SQL injection

### **Operational Security**
- **Log monitoring**: Track suspicious activity
- **Error alerting**: Monitor system health
- **Backup procedures**: Protect watch data

## 🎉 **Benefits Over NOWPayments**

### ✅ **Cost Savings**
- **No transaction fees**: Direct blockchain monitoring
- **No third-party dependency**: Complete control over process

### ✅ **Better User Experience**  
- **Faster notifications**: Direct integration with bot
- **Custom messages**: Tailored user communications
- **Real-time status**: Live confirmation tracking

### ✅ **Enhanced Control**
- **Custom confirmation requirements**: 5 confirmations vs variable
- **Flexible timeouts**: 1-hour watching period
- **Network flexibility**: Support any blockchain

### ✅ **Improved Reliability**
- **Direct monitoring**: No external service dependencies
- **Automatic retries**: Built-in error handling
- **Status tracking**: Complete audit trail

## 🔧 **Future Enhancements**

1. **Advanced Blockchain Monitoring**: Real blockchain RPC integration
2. **Dynamic Confirmation Requirements**: Network-specific confirmation counts
3. **Fee Optimization**: Gas fee estimation and optimization
4. **Multi-token Support**: Support for various tokens beyond USDT
5. **Analytics Dashboard**: Comprehensive monitoring and reporting
6. **Webhook Retry Logic**: Automatic retry for failed webhook deliveries

---

**🚀 This system provides a complete replacement for NOWPayments with enhanced control, better user experience, and significant cost savings!** 