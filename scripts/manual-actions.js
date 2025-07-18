#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function showMenu() {
  console.log('\n🔧 Wallet API Manual Actions Tool');
  console.log('==================================');
  console.log('1. Check deposit watches status');
  console.log('2. Manually complete a deposit watch');
  console.log('3. Check gas fee wallet balances');
  console.log('4. Retry failed webhooks');
  console.log('5. Check pending batch transfers');
  console.log('6. Emergency stop all monitoring');
  console.log('7. View system health');
  console.log('0. Exit');
  console.log('');
}

async function checkDepositWatches() {
  console.log('\n📊 Deposit Watches Status');
  console.log('========================');
  
  try {
    const watches = await prisma.depositWatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (watches.length === 0) {
      console.log('   No deposit watches found');
      return;
    }

    watches.forEach(watch => {
      const status = watch.status === 'ACTIVE' ? '🟢' : 
                    watch.status === 'CONFIRMED' ? '✅' : 
                    watch.status === 'EXPIRED' ? '⏰' : '❓';
      
      console.log(`   ${status} ${watch.id.substring(0, 8)}... - ${watch.network} - ${watch.status}`);
      console.log(`      Address: ${watch.address.substring(0, 20)}...`);
      console.log(`      Expected: ${watch.expectedAmount} USDT`);
      console.log(`      Created: ${watch.createdAt.toLocaleString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error checking deposit watches:', error.message);
  }
}

async function manuallyCompleteDeposit() {
  console.log('\n🎯 Manually Complete Deposit Watch');
  console.log('==================================');
  
  try {
    const watchId = await question('Enter deposit watch ID: ');
    
    const watch = await prisma.depositWatch.findUnique({
      where: { id: watchId }
    });

    if (!watch) {
      console.log('❌ Deposit watch not found');
      return;
    }

    console.log(`\n📋 Watch Details:`);
    console.log(`   ID: ${watch.id}`);
    console.log(`   Network: ${watch.network}`);
    console.log(`   Address: ${watch.address}`);
    console.log(`   Expected Amount: ${watch.expectedAmount} USDT`);
    console.log(`   Status: ${watch.status}`);
    console.log('');

    if (watch.status !== 'ACTIVE') {
      console.log('❌ Watch is not active and cannot be completed');
      return;
    }

    const confirm = await question('⚠️  Are you sure you want to manually complete this deposit? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      return;
    }

    // Update watch status
    await prisma.depositWatch.update({
      where: { id: watchId },
      data: { 
        status: 'CONFIRMED',
        completedAt: new Date()
      }
    });

    console.log('✅ Deposit watch completed successfully');
    console.log('💡 The deposit will be processed in the next batch transfer cycle');

  } catch (error) {
    console.error('❌ Error completing deposit:', error.message);
  }
}

async function checkGasFeeWallets() {
  console.log('\n💰 Gas Fee Wallet Balances');
  console.log('==========================');
  
  try {
    const { GasFeeWalletService } = require('../src/services/gas-fee-wallet.service');
    const gasFeeService = GasFeeWalletService.getInstance();

    const networks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron'];
    
    for (const network of networks) {
      try {
        const walletInfo = await gasFeeService.getGasFeeWallet(network);
        const balance = walletInfo.balance || '0';
        const status = parseFloat(balance) > 0.01 ? '🟢' : '🔴';
        
        console.log(`   ${status} ${network.toUpperCase()}: ${balance} ${getNativeToken(network)}`);
      } catch (error) {
        console.log(`   ❌ ${network.toUpperCase()}: Not configured`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking gas fee wallets:', error.message);
  }
}

function getNativeToken(network) {
  const tokens = {
    ethereum: 'ETH',
    bsc: 'BNB',
    polygon: 'MATIC',
    solana: 'SOL',
    tron: 'TRX'
  };
  return tokens[network] || 'NATIVE';
}

async function retryFailedWebhooks() {
  console.log('\n🔄 Retry Failed Webhooks');
  console.log('========================');
  
  try {
    const failedWebhooks = await prisma.depositWatch.findMany({
      where: {
        status: 'ACTIVE',
        webhookAttempts: { gt: 0 }
      }
    });

    if (failedWebhooks.length === 0) {
      console.log('   No failed webhooks found');
      return;
    }

    console.log(`   Found ${failedWebhooks.length} watches with failed webhooks`);
    
    const confirm = await question('⚠️  Retry webhooks for all failed watches? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      return;
    }

    // Reset webhook attempts to trigger retry
    await prisma.depositWatch.updateMany({
      where: {
        status: 'ACTIVE',
        webhookAttempts: { gt: 0 }
      },
      data: {
        webhookAttempts: 0,
        lastWebhookAttempt: null
      }
    });

    console.log('✅ Webhook retry triggered for all failed watches');

  } catch (error) {
    console.error('❌ Error retrying webhooks:', error.message);
  }
}

async function checkPendingBatchTransfers() {
  console.log('\n📦 Pending Batch Transfers');
  console.log('==========================');
  
  try {
    const { BatchTransferService } = require('../src/services/batch-transfer.service');
    const batchService = BatchTransferService.getInstance();

    const pendingTransfers = await batchService.getPendingTransfers();
    
    if (pendingTransfers.length === 0) {
      console.log('   No pending batch transfers');
      return;
    }

    console.log(`   Found ${pendingTransfers.length} pending transfers:`);
    
    pendingTransfers.forEach(transfer => {
      console.log(`   • ${transfer.network}: ${transfer.amount} USDT`);
      console.log(`     From: ${transfer.fromAddress.substring(0, 20)}...`);
      console.log(`     To: ${transfer.toAddress.substring(0, 20)}...`);
      console.log(`     Created: ${transfer.createdAt.toLocaleString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error checking pending transfers:', error.message);
  }
}

async function emergencyStopMonitoring() {
  console.log('\n🚨 Emergency Stop All Monitoring');
  console.log('================================');
  
  const confirm = await question('⚠️  WARNING: This will stop ALL deposit monitoring. Continue? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Operation cancelled');
    return;
  }

  const finalConfirm = await question('⚠️  FINAL WARNING: This action cannot be undone. Type "STOP" to confirm: ');
  
  if (finalConfirm !== 'STOP') {
    console.log('❌ Operation cancelled');
    return;
  }

  try {
    // Stop all active monitoring
    await prisma.depositWatch.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'STOPPED' }
    });

    console.log('✅ All deposit monitoring stopped');
    console.log('💡 Restart monitoring by setting watches back to ACTIVE status');

  } catch (error) {
    console.error('❌ Error stopping monitoring:', error.message);
  }
}

async function viewSystemHealth() {
  console.log('\n🏥 System Health Check');
  console.log('=====================');
  
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('   🟢 Database: Connected');

    // Check deposit watches
    const activeWatches = await prisma.depositWatch.count({
      where: { status: 'ACTIVE' }
    });
    console.log(`   📊 Active Watches: ${activeWatches}`);

    // Check gas fee wallets
    const { GasFeeWalletService } = require('../src/services/gas-fee-wallet.service');
    const gasFeeService = GasFeeWalletService.getInstance();
    
    let configuredWallets = 0;
    const networks = ['ethereum', 'bsc', 'polygon', 'solana', 'tron'];
    
    for (const network of networks) {
      try {
        await gasFeeService.getGasFeeWallet(network);
        configuredWallets++;
      } catch (error) {
        // Wallet not configured
      }
    }
    
    console.log(`   💰 Configured Gas Fee Wallets: ${configuredWallets}/${networks.length}`);

    // Check batch transfers
    const { BatchTransferService } = require('../src/services/batch-transfer.service');
    const batchService = BatchTransferService.getInstance();
    const pendingTransfers = await batchService.getPendingTransfers();
    console.log(`   📦 Pending Batch Transfers: ${pendingTransfers.length}`);

    console.log('\n✅ System health check completed');

  } catch (error) {
    console.error('❌ Error checking system health:', error.message);
  }
}

async function main() {
  console.log('🔧 Wallet API Manual Actions Tool');
  console.log('==================================');
  console.log('Use this tool for manual interventions when automation fails');
  console.log('');

  while (true) {
    await showMenu();
    
    const choice = await question('Select an action (0-7): ');
    
    switch (choice) {
      case '1':
        await checkDepositWatches();
        break;
      case '2':
        await manuallyCompleteDeposit();
        break;
      case '3':
        await checkGasFeeWallets();
        break;
      case '4':
        await retryFailedWebhooks();
        break;
      case '5':
        await checkPendingBatchTransfers();
        break;
      case '6':
        await emergencyStopMonitoring();
        break;
      case '7':
        await viewSystemHealth();
        break;
      case '0':
        console.log('\n👋 Goodbye!');
        process.exit(0);
      default:
        console.log('❌ Invalid choice. Please select 0-7.');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  rl.close();
  prisma.$disconnect();
  process.exit(0);
});

// Run the tool
main().catch(async (error) => {
  console.error('❌ Fatal error:', error);
  await prisma.$disconnect();
  rl.close();
  process.exit(1);
}); 