import crypto from 'crypto';

console.log('🔑 Wallet Encryption Key Generator');
console.log('=====================================\n');

// Generate different key lengths
const keyLengths = [
  { name: 'Minimum Security', bytes: 32, chars: 64, command: 'openssl rand -hex 32' },
  { name: 'Standard Security', bytes: 48, chars: 96, command: 'openssl rand -hex 48' },
  { name: 'High Security', bytes: 56, chars: 112, command: 'openssl rand -hex 56' },
  { name: 'Maximum Security', bytes: 62, chars: 124, command: 'openssl rand -hex 62' },
];

console.log('Generated Encryption Keys:\n');

keyLengths.forEach(({ name, bytes, chars, command }) => {
  const key = crypto.randomBytes(bytes).toString('hex');
  
  console.log(`${name} (${chars} characters):`);
  console.log(`   Command: ${command}`);
  console.log(`   Key: ${key}`);
  console.log(`   Length: ${key.length} characters`);
  console.log(`   Entropy: ${bytes * 8} bits`);
  console.log('');
});

console.log('📋 Usage Instructions:');
console.log('1. Copy one of the generated keys above');
console.log('2. Add it to your environment variables:');
console.log('   WALLET_ENCRYPTION_KEY=your_generated_key_here');
console.log('3. Restart your application');
console.log('');

console.log('🔒 Security Recommendations:');
console.log('✅ Use "Maximum Security" (124 characters) for production');
console.log('✅ Use "High Security" (112 characters) for staging');
console.log('✅ Use "Standard Security" (96 characters) for development');
console.log('⚠️  "Minimum Security" (64 characters) only for testing');
console.log('');

console.log('⚠️  Important Security Notes:');
console.log('- Never commit encryption keys to version control');
console.log('- Store keys securely in environment variables');
console.log('- Use different keys for different environments');
console.log('- Rotate keys periodically');
console.log('- Backup keys securely');
console.log('');

console.log('🎯 Recommended for Production:');
const recommendedKey = crypto.randomBytes(62).toString('hex');
console.log(`WALLET_ENCRYPTION_KEY=${recommendedKey}`);
console.log('');
console.log('✅ This key provides maximum security for your wallet private keys!'); 