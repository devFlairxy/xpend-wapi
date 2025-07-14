import { execSync } from 'child_process';
import { config } from '../src/config';

async function initDatabase() {
  try {
    console.log('🗄️ Initializing database...');

    // Validate configuration
    config.validateConfig();

    // Generate Prisma client
    console.log('📦 Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // Run database migrations
    console.log('🔄 Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    // Optional: Seed database with initial data
    console.log('🌱 Database initialization completed successfully!');
    
    console.log('\n📋 Next steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Test wallet generation: curl -X POST http://localhost:3000/api/deposit-wallets \\');
    console.log('   -H "Content-Type: application/json" \\');
    console.log('   -H "X-API-Key: your-api-key-secret-here" \\');
    console.log('   -d \'{"userId": "test-user-123"}\'');
    console.log('3. Check deposit monitoring: curl http://localhost:3000/api/deposits/status');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase().catch(console.error); 