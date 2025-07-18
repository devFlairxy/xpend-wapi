import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDepositWatches() {
  try {
    console.log('🔍 Checking all deposit watches...');
    
    // Get all deposit watches
    const allWatches = await prisma.depositWatch.findMany({
      include: {
        wallet: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (allWatches.length === 0) {
      console.log('❌ No deposit watches found in database');
      return;
    }

    console.log(`📊 Found ${allWatches.length} deposit watch(es):`);
    
    allWatches.forEach((watch, index) => {
      console.log(`\n${index + 1}. Watch ID: ${watch.id}`);
      console.log(`   User ID: ${watch.userId}`);
      console.log(`   Network: ${watch.network}`);
      console.log(`   Address: ${watch.address}`);
      console.log(`   Expected Amount: ${watch.expectedAmount} ${watch.token}`);
      console.log(`   Status: ${watch.status}`);
      console.log(`   Confirmations: ${watch.confirmations}`);
      console.log(`   Actual Amount: ${watch.actualAmount || 'N/A'}`);
      console.log(`   Transaction Hash: ${watch.txHash || 'N/A'}`);
      console.log(`   Webhook Sent: ${watch.webhookSent ? 'Yes' : 'No'}`);
      console.log(`   Created: ${watch.createdAt}`);
      console.log(`   Expires: ${watch.expiresAt}`);
      console.log(`   Updated: ${watch.updatedAt}`);
    });

  } catch (error) {
    console.error('❌ Error checking deposit watches:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkDepositWatches().catch(console.error); 