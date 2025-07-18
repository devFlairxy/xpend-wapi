import { PrismaClient } from '@prisma/client';
import { WebhookService } from '../src/services/webhook.service';
import { WalletService } from '../src/services/wallet.service';
import { DepositMonitorWebhookPayload } from '../src/types';

const prisma = new PrismaClient();

async function simulateConfirmedDeposit() {
  try {
    console.log('🔍 Querying deposit watches...');
    
    // Get all deposit watches (not just active ones)
    const allWatches = await prisma.depositWatch.findMany({
      where: {
        OR: [
          { status: 'ACTIVE' },
          { status: 'CONFIRMED' }
        ]
      },
      include: {
        wallet: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (allWatches.length === 0) {
      console.log('❌ No deposit watches found');
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
    });

    // Use the first watch for simulation
    const watchToSimulate = allWatches[0];
    if (!watchToSimulate) {
      console.log('❌ No watch to simulate');
      return;
    }

    console.log(`\n🎯 Processing watch: ${watchToSimulate.id}`);

    // Send webhook notification first if not already sent
    let webhookSuccess = false;
    if (watchToSimulate.webhookUrl && !watchToSimulate.webhookSent) {
      console.log(`\n📡 Sending webhook to: ${watchToSimulate.webhookUrl}`);
      
      const webhookService = WebhookService.getInstance();
      
      // Create webhook payload
      const webhookPayload: DepositMonitorWebhookPayload = {
        userId: watchToSimulate.userId,
        address: watchToSimulate.address,
        network: watchToSimulate.network,
        expectedAmount: watchToSimulate.expectedAmount,
        actualAmount: watchToSimulate.actualAmount || watchToSimulate.expectedAmount,
        confirmations: watchToSimulate.confirmations,
        status: 'CONFIRMED',
        txHash: watchToSimulate.txHash,
        timestamp: new Date().toISOString(),
        watchId: watchToSimulate.id,
        ...(watchToSimulate.paymentId && { paymentId: watchToSimulate.paymentId }),
      };

      try {
        // Send the webhook
        const webhookResult = await webhookService.sendWebhook(
          watchToSimulate.webhookUrl,
          webhookPayload
        );

        if (webhookResult.success) {
          console.log(`✅ Webhook sent successfully!`);
          console.log(`   Status Code: ${webhookResult.statusCode}`);
          console.log(`   Response: ${webhookResult.response}`);
          webhookSuccess = true;
          
          // Mark webhook as sent in database
          await prisma.depositWatch.update({
            where: { id: watchToSimulate.id },
            data: {
              webhookSent: true,
              updatedAt: new Date(),
            },
          });
          console.log(`✅ Webhook marked as sent in database`);
        } else {
          console.log(`❌ Webhook failed:`);
          console.log(`   Error: ${webhookResult.error}`);
          webhookSuccess = false;
        }
      } catch (webhookError) {
        console.error(`❌ Error sending webhook:`, webhookError);
        webhookSuccess = false;
      }
    } else if (watchToSimulate.webhookSent) {
      console.log(`\n⚠️ Webhook already sent for this watch`);
      webhookSuccess = true; // Consider it successful if already sent
    } else {
      console.log(`\n⚠️ No webhook URL found for this watch`);
      webhookSuccess = false;
    }

    // Only update status to CONFIRMED if webhook was successful
    if (webhookSuccess) {
      if (watchToSimulate.status === 'ACTIVE' && watchToSimulate.confirmations >= 5) {
        console.log(`📝 Updating watch status from ACTIVE to CONFIRMED...`);
        
        await prisma.depositWatch.update({
          where: { id: watchToSimulate.id },
          data: {
            status: 'CONFIRMED',
            updatedAt: new Date(),
          },
        });
        
        console.log(`✅ Watch status updated to CONFIRMED`);
      }

      // Mark the wallet as used after successful webhook and status update
      try {
        const walletService = WalletService.getInstance();
        await walletService.markWalletAsUsed(watchToSimulate.userId, watchToSimulate.network);
        console.log(`✅ Wallet marked as used for user ${watchToSimulate.userId} on ${watchToSimulate.network}`);
      } catch (walletError) {
        console.error(`❌ Error marking wallet as used:`, walletError);
      }
    } else {
      console.log(`\n❌ Skipping status update and wallet marking due to webhook failure`);
    }

    console.log('\n🎉 Deposit processing and webhook sending completed successfully!');

  } catch (error) {
    console.error('❌ Error processing confirmed deposit:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the simulation
simulateConfirmedDeposit().catch(console.error); 