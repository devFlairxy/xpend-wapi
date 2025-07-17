import { WalletService } from './services/wallet.service';

async function testWalletGeneration() {
  console.log('🧪 Testing Wallet Generation...\n');

  const walletService = WalletService.getInstance();

  try {
    // Test wallet generation
    const userId = 'test-user-123';
    console.log(`📝 Generating wallets for userId: ${userId}`);

    // Test generating wallets for different networks
    const networks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron', 'busd'];
    const generatedWallets: any = {};
    
    for (const network of networks) {
      console.log(`\n📱 Generating ${network} wallet for user ${userId}...`);
      
      const wallet = await walletService.generateDisposableWallet(userId, network);
      generatedWallets[network] = wallet;
      
      console.log(`✅ ${network.toUpperCase()} wallet generated:`);
      console.log(`   Address: ${wallet.address}`);
      console.log(`   Network: ${wallet.network}`);
      console.log(`   ID: ${wallet.id}`);
    }

    // Test wallet address retrieval
    console.log('\n🔍 Testing wallet address retrieval...');
    const retrievedAddresses: any = {};
    
    for (const network of networks) {
      const address = await walletService.getWalletAddress(userId, network);
      retrievedAddresses[network] = address;
      
      if (address === generatedWallets[network].address) {
        console.log(`✅ ${network.toUpperCase()} address retrieval test passed`);
      } else {
        console.log(`❌ ${network.toUpperCase()} address retrieval test failed`);
      }
    }

    // Test deterministic generation
    console.log('\n🔄 Testing deterministic generation...');
    const regeneratedWallets: any = {};
    
    for (const network of networks) {
      const wallet = await walletService.generateDisposableWallet(userId, network);
      regeneratedWallets[network] = wallet;
      
      if (wallet.address === generatedWallets[network].address) {
        console.log(`✅ ${network.toUpperCase()} deterministic generation test passed`);
      } else {
        console.log(`❌ ${network.toUpperCase()} deterministic generation test failed`);
      }
    }

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testWalletGeneration().catch(console.error); 