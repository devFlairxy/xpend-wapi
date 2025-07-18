import { PrismaClient } from '@prisma/client';
import { WebhookService } from '../src/services/webhook.service';

const prisma = new PrismaClient();

async function simulateExpiredDeposit() {
  try {
    console.log('🔍 Querying active deposit watches...');
    
    // Find an active deposit watch
    const activeWatch = await prisma.depositWatch.findFirst({
      where: {
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!activeWatch) {
      console.log('❌ No active deposit watches found. Creating a test watch first...');
      
      // First, check if we have any existing wallets
      const existingWallet = await prisma.disposableWallet.findFirst({
        where: {
          isUsed: false,
        },
      });
      
      let walletId: string;
      
      if (existingWallet) {
        walletId = existingWallet.id;
        console.log(`✅ Using existing wallet: ${walletId}`);
      } else {
        // Create a test wallet
        const testWallet = await prisma.disposableWallet.create({
          data: {
            userId: 'test-user-expired',
            network: 'bsc',
            address: '0x' + Math.random().toString(16).substring(2, 42),
            privateKey: '0x' + Math.random().toString(16).substring(2, 66),
            derivationPath: "m/44'/60'/0'/0/0",
            isUsed: false,
          },
        });
        walletId = testWallet.id;
        console.log(`✅ Created test wallet: ${walletId}`);
      }
      
      // Create a test watch that we can expire
      const testWatch = await prisma.depositWatch.create({
        data: {
          userId: 'test-user-expired',
          walletId: walletId,
          address: '0x' + Math.random().toString(16).substring(2, 42),
          network: 'bsc',
          token: 'USDT',
          expectedAmount: '5',
          webhookUrl: 'https://credo-whatsapp-bot.onrender.com/webhooks/wallet-api/deposit',
          paymentId: 'test-payment-expired',
          expiresAt: new Date(Date.now() - 1000), // Already expired
          status: 'ACTIVE',
        },
      });
      
      console.log(`✅ Created test watch: ${testWatch.id}`);
      await simulateExpiredDepositForWatch(testWatch);
    } else {
      console.log(`📊 Found active watch: ${activeWatch.id}`);
      console.log(`   User ID: ${activeWatch.userId}`);
      console.log(`   Network: ${activeWatch.network}`);
      console.log(`   Address: ${activeWatch.address}`);
      console.log(`   Expected Amount: ${activeWatch.expectedAmount} ${activeWatch.token}`);
      console.log(`   Expires At: ${activeWatch.expiresAt}`);
      
      await simulateExpiredDepositForWatch(activeWatch);
    }
  } catch (error) {
    console.error('❌ Error simulating expired deposit:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function simulateExpiredDepositForWatch(watch: any) {
  try {
    console.log(`\n🎯 Simulating expired deposit for watch: ${watch.id}`);
    
    // Manually set the watch to expired
    const expiredWatch = await prisma.depositWatch.update({
      where: { id: watch.id },
      data: {
        status: 'EXPIRED',
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Ensure it's expired
      },
    });
    
    console.log(`✅ Watch status updated to EXPIRED`);
    
    // Send webhook notification for expired deposit
    const webhookService = WebhookService.getInstance();
    
    const webhookPayload = {
      type: 'deposit_expired',
      watchId: watch.id,
      userId: watch.userId,
      network: watch.network,
      address: watch.address,
      expectedAmount: watch.expectedAmount,
      token: watch.token,
      paymentId: watch.paymentId,
      timestamp: new Date().toISOString(),
      reason: 'Deposit watch expired without receiving expected amount',
    };
    
    console.log(`📡 Sending expired deposit webhook...`);
    console.log(`   URL: ${watch.webhookUrl || 'No webhook URL configured'}`);
    
    if (watch.webhookUrl) {
      const result = await webhookService.sendWebhook(
        watch.webhookUrl,
        webhookPayload,
        process.env['SHARED_SECRET'] || 'default-shared-secret'
      );
      
      if (result.success) {
        console.log(`✅ Expired deposit webhook sent successfully!`);
        console.log(`   Status Code: ${result.statusCode}`);
        console.log(`   Response: ${JSON.stringify(result.response)}`);
        
        // Mark webhook as sent
        await prisma.depositWatch.update({
          where: { id: watch.id },
          data: {
            webhookSent: true,
          },
        });
        console.log(`✅ Webhook marked as sent in database`);
      } else {
        console.log(`❌ Failed to send expired deposit webhook:`);
        console.log(`   Error: ${result.error}`);
        console.log(`   Status Code: ${result.statusCode}`);
        
        // Mark webhook as failed (webhookSent remains false by default)
        console.log(`✅ Webhook failure noted (webhookSent remains false)`);
      }
    } else {
      console.log(`⚠️ No webhook URL configured for this watch`);
    }
    
    console.log(`\n🎉 Expired deposit simulation completed successfully!`);
    console.log(`📊 Final watch status: ${expiredWatch.status}`);
    console.log(`📊 Webhook sent: ${expiredWatch.webhookSent ? 'Yes' : 'No'}`);
    
  } catch (error) {
    console.error(`❌ Error processing expired deposit for watch ${watch.id}:`, error);
  }
}

// Run the simulation
simulateExpiredDeposit()
  .then(() => {
    console.log('\n✅ Expired deposit simulation completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Expired deposit simulation failed:', error);
    process.exit(1);
  }); 