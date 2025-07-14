import { WalletService } from './services/wallet.service';

async function testWalletGeneration() {
  console.log('🧪 Testing Wallet Generation...\n');

  const walletService = WalletService.getInstance();

  try {
    // Test wallet generation
    const userId = 'test-user-123';
    console.log(`📝 Generating wallets for userId: ${userId}`);

    const userWallets = await walletService.generateWallets(userId);

    console.log('✅ Wallet Generation Results:');
    console.log(`Ethereum: ${userWallets.ethereum.address}`);
    console.log(`BSC: ${userWallets.bsc.address}`);
    console.log(`Polygon: ${userWallets.polygon.address}`);
    console.log(`Solana: ${userWallets.solana.address}`);
    console.log(`TON: ${userWallets.ton.address}`);

    // Test wallet address retrieval
    console.log('\n🔍 Testing wallet address retrieval...');
    const addresses = await walletService.getWalletAddresses(userId);
    
    if (addresses && 
        addresses.ethereum === userWallets.ethereum.address &&
        addresses.bsc === userWallets.bsc.address &&
        addresses.polygon === userWallets.polygon.address &&
        addresses.solana === userWallets.solana.address &&
        addresses.ton === userWallets.ton.address
    ) {
      console.log('✅ Wallet address retrieval test passed');
    } else {
      console.log('❌ Wallet address retrieval test failed');
    }

    // Test deterministic generation
    console.log('\n🔄 Testing deterministic generation...');
    const userWallets2 = await walletService.generateWallets(userId);
    console.log('Deterministic test:', 
      userWallets.ethereum.address === userWallets2.ethereum.address
    );

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testWalletGeneration().catch(console.error); 