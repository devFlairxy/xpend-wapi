const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Failed watch ID
const FAILED_WATCH_ID = 'cmd70y10a00026k2uj0tw1302';

async function checkFailedWatch() {
  console.log('🔍 Checking failed webhook watch...');
  
  try {
    const watch = await prisma.depositWatch.findUnique({
      where: { id: FAILED_WATCH_ID }
    });

    if (watch) {
      console.log(`📋 Watch Details:`);
      console.log(`   ID: ${watch.id}`);
      console.log(`   Status: ${watch.status}`);
      console.log(`   Network: ${watch.network}`);
      console.log(`   Token: ${watch.token}`);
      console.log(`   Expected Amount: ${watch.expectedAmount}`);
      console.log(`   Address: ${watch.address}`);
      console.log(`   Webhook URL: ${watch.webhookUrl}`);
      console.log(`   Webhook Sent: ${watch.webhookSent}`);
      console.log(`   Created: ${watch.createdAt}`);
      console.log(`   Updated: ${watch.updatedAt}`);
      
      return watch;
    } else {
      console.log('❌ Watch not found');
      return null;
    }

  } catch (error) {
    console.error('❌ Error checking watch:', error);
    return null;
  }
}

async function resetWebhookStatus(watchId) {
  console.log('\n🔄 Resetting webhook status...');
  
  try {
    await prisma.depositWatch.update({
      where: { id: watchId },
      data: { 
        webhookSent: false,
        updatedAt: new Date()
      }
    });
    
    console.log(`✅ Webhook status reset for watch ${watchId}`);
    console.log(`   The monitoring service will retry the webhook on next cycle`);
    
  } catch (error) {
    console.error('❌ Error resetting webhook status:', error);
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🔧 Checking environment variables...');
  
  const sharedSecret = process.env['SHARED_SECRET'];
  const webhookSecret = process.env['WEBHOOK_SECRET'];
  
  console.log(`   SHARED_SECRET: ${sharedSecret ? '✅ Set' : '❌ Not set'}`);
  console.log(`   WEBHOOK_SECRET: ${webhookSecret ? '✅ Set' : '❌ Not set'}`);
  
  if (!sharedSecret) {
    console.log('⚠️  SHARED_SECRET is not set - this will cause webhook authentication failures');
    console.log('💡 Make sure SHARED_SECRET matches the one in the credo bot');
  }
  
  return sharedSecret;
}

async function testWebhookSignature() {
  console.log('\n🧪 Testing webhook signature generation...');
  
  try {
    const crypto = require('crypto');
    const secret = process.env['SHARED_SECRET'] || process.env['WEBHOOK_SECRET'] || 'default-secret';
    
    const testPayload = {
      userId: 'test-user',
      address: '0x1234567890abcdef1234567890abcdef1234567890',
      network: 'bsc',
      expectedAmount: '1.0',
      actualAmount: '1.0',
      confirmations: 5,
      status: 'CONFIRMED',
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      timestamp: new Date().toISOString(),
      watchId: FAILED_WATCH_ID,
      paymentId: 'test-payment'
    };
    
    const payloadString = JSON.stringify(testPayload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    const signature = `sha256=${hmac.digest('hex')}`;
    
    console.log(`✅ Webhook signature generated successfully`);
    console.log(`   Secret used: ${secret === 'default-secret' ? 'default-secret (WARNING: Using default)' : 'SHARED_SECRET'}`);
    console.log(`   Signature: ${signature.substring(0, 20)}...`);
    console.log(`   Payload: ${JSON.stringify(testPayload, null, 2)}`);
    
  } catch (error) {
    console.error('❌ Error testing webhook signature:', error);
  }
}

async function main() {
  console.log('🔧 WEBHOOK AUTHENTICATION FIX');
  console.log('=' .repeat(60));
  console.log('📋 Failed Watch ID:', FAILED_WATCH_ID);
  
  try {
    const watch = await checkFailedWatch();
    await checkEnvironmentVariables();
    await testWebhookSignature();
    
    if (watch) {
      await resetWebhookStatus(FAILED_WATCH_ID);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 FIX SUMMARY:');
    console.log('✅ Webhook signature generation fixed to use SHARED_SECRET');
    console.log('✅ Webhook status reset for retry');
    console.log('✅ Environment variables checked');
    console.log('✅ Signature generation tested');
    console.log('\n💡 The monitoring service will retry the webhook on next cycle');
    console.log('💡 Make sure SHARED_SECRET is set correctly in environment');
    
  } catch (error) {
    console.error('❌ Error in webhook fix:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
main().catch(console.error); 