import { WalletService } from './src/services/wallet.service';

async function testWalletGeneration() {
  const walletService = WalletService.getInstance();
  const userId = 'test-user-123';

  try {
    console.log('🧪 Testing wallet generation...');

    // Test generating wallets for different networks
    const networks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'];
    
    for (const network of networks) {
      console.log(`\n📱 Generating ${network} wallet for user ${userId}...`);
      
      const wallet = await walletService.generateDisposableWallet(userId, network);
      console.log(`✅ ${network.toUpperCase()} wallet generated:`);
      console.log(`   Address: ${wallet.address}`);
      console.log(`   Network: ${wallet.network}`);
      console.log(`   ID: ${wallet.id}`);
      
      // Test getting the same wallet again (should return existing)
      console.log(`\n🔄 Testing wallet retrieval for ${network}...`);
      const existingWallet = await walletService.getDisposableWallet(userId, network);
      if (existingWallet && existingWallet.address === wallet.address) {
        console.log(`✅ Successfully retrieved existing ${network} wallet`);
      } else {
        console.log(`❌ Failed to retrieve existing ${network} wallet`);
      }
    }

    // Test getting wallet addresses
    console.log('\n📍 Testing wallet address retrieval...');
    for (const network of networks) {
      const address = await walletService.getWalletAddress(userId, network);
      if (address) {
        console.log(`✅ ${network.toUpperCase()} address: ${address}`);
      } else {
        console.log(`❌ No ${network} address found`);
      }
    }

    // Test getting network wallet info
    console.log('\n📋 Testing network wallet info retrieval...');
    for (const network of networks) {
      const walletInfo = await walletService.getNetworkWallet(userId, network);
      if (walletInfo) {
        console.log(`✅ ${network.toUpperCase()} wallet info:`);
        console.log(`   Address: ${walletInfo.address}`);
        console.log(`   QR Code: ${walletInfo.qrCode ? 'Available' : 'Not available'}`);
      } else {
        console.log(`❌ No ${network} wallet info found`);
      }
    }

    console.log('\n🎉 All wallet generation tests completed successfully!');
  } catch (error) {
    console.error('❌ Error during wallet generation test:', error);
  }
}

// Run the test
testWalletGeneration().catch(console.error); 