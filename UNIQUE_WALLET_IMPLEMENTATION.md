# Unique Wallet Generation Implementation

## Overview

This document outlines the implementation of unique wallet generation for each deposit request, ensuring that wallets are never reused and are marked as "used" when deposits expire or complete.

## Key Changes Made

### 1. Wallet Generation Service (`src/services/wallet.service.ts`)

**Previous Behavior:**
- System would reuse existing unused wallets for the same user/network
- Deterministic index generation could lead to address collisions

**New Behavior:**
- **Always generates a fresh, unique wallet for each deposit request**
- Uses timestamp-based unique index generation
- No wallet reuse - each request gets a completely new address

**Changes:**
```typescript
// REMOVED: Wallet reuse logic
// Check if wallet already exists for this user and network
// If wallet exists and is not used, return it

// ADDED: Always generate new wallets
// Always generate a new wallet for each deposit request (no reuse)
// This ensures better security and tracking for each deposit session

// REPLACED: generateIndexFromUserIdAndNetwork() 
// WITH: generateUniqueIndex() - includes timestamp and attempt number
```

### 2. Wallet Marking System

**Added New Methods:**
- `markWalletAsUsedById(walletId: string)` - Mark specific wallet by ID
- Enhanced `DatabaseService` with `markWalletAsUsedById()` method

**Why This Was Needed:**
- Since each wallet is now unique, we need to mark the specific wallet used in a deposit watch
- The old approach of finding "any unused wallet for user/network" is no longer appropriate

### 3. Deposit Watch Service (`src/services/deposit-watch.service.ts`)

**Enhanced Expiry Handling:**
```typescript
// ADDED: Mark wallet as used when watch expires
if (webhookSent) {
  // Update status to EXPIRED
  await this.prisma.depositWatch.update(/* ... */);
  
  // NEW: Mark the specific wallet as used
  await this.walletService.markWalletAsUsedById(watch.walletId);
  console.log(`🔒 Wallet marked as used due to expiry`);
}
```

**Enhanced Confirmation Handling:**
```typescript
// ADDED: Mark wallet as used when deposit confirms
if (webhookSent) {
  // Update status to CONFIRMED  
  await this.prisma.depositWatch.update(/* ... */);
  
  // NEW: Mark the specific wallet as used
  await this.walletService.markWalletAsUsedById(watch.walletId);
  console.log(`🔒 Wallet marked as used due to confirmed deposit`);
}
```

### 4. Database Schema Relationship

The implementation leverages the existing database relationship:
```prisma
model DepositWatch {
  walletId  String
  wallet    DisposableWallet @relation(fields: [walletId], references: [id])
  // ... other fields
}
```

This allows us to mark the exact wallet associated with each deposit watch.

## Behavioral Changes

### Before Implementation:
1. User requests deposit → System checks for existing unused wallet
2. If unused wallet exists → Return same wallet address
3. If deposit expires → Wallet remains unused, can be reused
4. If deposit completes → Mark any wallet for user/network as used

### After Implementation:
1. User requests deposit → **System always generates new unique wallet**
2. **Each request gets completely fresh address**
3. If deposit expires → **Mark the specific wallet as used (never reuse)**
4. If deposit completes → **Mark the specific wallet as used**

## Security & Tracking Benefits

### Enhanced Security:
- **No address reuse** - Each deposit session gets a unique address
- **Better isolation** - Each transaction is completely independent
- **Reduced address collision risk** - Timestamp-based generation

### Improved Tracking:
- **One-to-one mapping** - Each deposit request maps to exactly one wallet
- **Clear audit trail** - Can track which wallet was used for which deposit
- **No ambiguity** - No confusion about which wallet handled which deposit

### Operational Benefits:
- **Simplified debugging** - Each deposit has its own unique address
- **Better user experience** - No confusion from address reuse
- **Cleaner database state** - Clear separation between deposit sessions

## Testing Verification

A test was created and successfully run to verify the implementation:

```bash
🧪 Testing unique wallet generation...
🔄 Generating 3 wallets for user test-user-123 on bsc...
✅ Wallet 1: 0x9Ba37a36942Bb1e5831D48068cfd6f87BFD235a5
✅ Wallet 2: 0xbdaB86f0EC6CB6A4fE4fFFda5771D1c7563E9b2B  
✅ Wallet 3: 0x1a0fA5Ad124275535b877bDa107F4f830a417442

✅ SUCCESS: All 3 wallets have unique addresses
✅ New wallet generation behavior is working correctly
```

## Implementation Status

- ✅ **Unique wallet generation** - Implemented and tested
- ✅ **Wallet marking on expiry** - Implemented in deposit-watch service
- ✅ **Wallet marking on confirmation** - Implemented in deposit-watch service  
- ✅ **Database methods** - New `markWalletAsUsedById()` methods added
- ✅ **Build verification** - All changes compile successfully
- ✅ **Backward compatibility** - Legacy services unaffected

## Migration Notes

- **No database migration required** - Uses existing schema
- **Immediate effect** - All new deposit requests will get unique wallets
- **Legacy watches** - Existing active watches continue normally
- **No service downtime** - Changes are backward compatible

## Future Considerations

1. **Cleanup Strategy** - Consider implementing periodic cleanup of very old used wallets
2. **Monitoring** - Add metrics to track wallet generation and usage patterns
3. **Performance** - Monitor impact of generating more wallets vs. reusing them
4. **Analytics** - Track user deposit patterns with unique wallet data 