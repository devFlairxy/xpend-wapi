const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrateToDisposableWallets() {
  console.log('🔄 Starting migration to disposable wallets...');
  
  try {
    // Get all existing user wallets
    const userWallets = await prisma.userWallet.findMany();
    console.log(`📊 Found ${userWallets.length} existing user wallets to migrate`);

    for (const userWallet of userWallets) {
      console.log(`\n👤 Migrating wallets for user: ${userWallet.userId}`);
      
      // Create disposable wallets for each network
      const networks = [
        { name: 'ethereum', address: userWallet.ethereumAddress, privateKey: userWallet.ethereumPrivateKey, derivationPath: userWallet.ethereumDerivationPath, qrCode: userWallet.ethereumQrCode },
        { name: 'bsc', address: userWallet.bscAddress, privateKey: userWallet.bscPrivateKey, derivationPath: userWallet.bscDerivationPath, qrCode: userWallet.bscQrCode },
        { name: 'polygon', address: userWallet.polygonAddress, privateKey: userWallet.polygonPrivateKey, derivationPath: userWallet.polygonDerivationPath, qrCode: userWallet.polygonQrCode },
        { name: 'solana', address: userWallet.solanaAddress, privateKey: userWallet.solanaPrivateKey, derivationPath: userWallet.solanaDerivationPath, qrCode: userWallet.solanaQrCode },
        { name: 'tron', address: userWallet.tronAddress, privateKey: userWallet.tronPrivateKey, derivationPath: userWallet.tronDerivationPath, qrCode: userWallet.tronQrCode },
      ];

      for (const network of networks) {
        if (network.address) {
          try {
            // Check if disposable wallet already exists
            const existingWallet = await prisma.disposableWallet.findUnique({
              where: {
                userId_network: {
                  userId: userWallet.userId,
                  network: network.name
                }
              }
            });

            if (!existingWallet) {
              const disposableWallet = await prisma.disposableWallet.create({
                data: {
                  userId: userWallet.userId,
                  network: network.name,
                  address: network.address,
                  privateKey: network.privateKey,
                  derivationPath: network.derivationPath,
                  qrCode: network.qrCode,
                  isUsed: false,
                }
              });
              console.log(`   ✅ Created ${network.name} wallet: ${disposableWallet.address}`);
            } else {
              console.log(`   ⚠️  ${network.name} wallet already exists for user`);
            }
          } catch (error) {
            console.error(`   ❌ Error creating ${network.name} wallet:`, error.message);
          }
        } else {
          console.log(`   ⚠️  No ${network.name} address found for user`);
        }
      }
    }

    // Migrate existing deposit watches
    console.log('\n📋 Migrating deposit watches...');
    const depositWatches = await prisma.depositWatch.findMany();
    console.log(`📊 Found ${depositWatches.length} deposit watches to migrate`);

    for (const watch of depositWatches) {
      try {
        // Find the corresponding disposable wallet
        const disposableWallet = await prisma.disposableWallet.findFirst({
          where: {
            userId: watch.userId,
            network: watch.network,
            address: watch.address
          }
        });

        if (disposableWallet) {
          await prisma.depositWatch.update({
            where: { id: watch.id },
            data: {
              walletId: disposableWallet.id
            }
          });
          console.log(`   ✅ Updated deposit watch ${watch.id} with wallet ${disposableWallet.id}`);
        } else {
          console.log(`   ⚠️  No disposable wallet found for deposit watch ${watch.id}`);
        }
      } catch (error) {
        console.error(`   ❌ Error updating deposit watch ${watch.id}:`, error.message);
      }
    }

    // Migrate existing deposits
    console.log('\n💰 Migrating deposits...');
    const deposits = await prisma.deposit.findMany();
    console.log(`📊 Found ${deposits.length} deposits to migrate`);

    for (const deposit of deposits) {
      try {
        // Find the corresponding disposable wallet
        const disposableWallet = await prisma.disposableWallet.findFirst({
          where: {
            userId: deposit.userId,
            network: deposit.network,
            address: deposit.wallet
          }
        });

        if (disposableWallet) {
          await prisma.deposit.update({
            where: { id: deposit.id },
            data: {
              walletId: disposableWallet.id,
              walletAddress: deposit.wallet
            }
          });
          console.log(`   ✅ Updated deposit ${deposit.id} with wallet ${disposableWallet.id}`);
        } else {
          console.log(`   ⚠️  No disposable wallet found for deposit ${deposit.id}`);
        }
      } catch (error) {
        console.error(`   ❌ Error updating deposit ${deposit.id}:`, error.message);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('💡 You can now run: npx prisma migrate dev');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateToDisposableWallets().catch(console.error); 