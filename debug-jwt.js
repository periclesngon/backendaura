const jwt = require('jsonwebtoken');

// Load environment variables
require('dotenv').config();

// Use environment variables directly
const config = {
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here'
};

console.log('Environment JWT_SECRET:', process.env.JWT_SECRET);

// Test token from the debug output
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtZ2F6cDh0YTAwMDAyaWx0a2tyeGhqaDgiLCJ1c2VySWQiOiJjbWdhenA4dGEwMDAwMmlsdGtrcnhoamg4IiwiZW1haWwiOiJ0aW1hY2xhdWRlQGdtYWlsLmNvbSIsInJvbGUiOiJTVFVERU5UIiwic3Vic2NyaXB0aW9uVGllciI6IlBSTyIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NTk5Mjc3OTcsImV4cCI6MTc2MDAxNDE5NywiYXVkIjoidGNmLXRlZi1hcHAiLCJpc3MiOiJ0Y2YtdGVmLWFwaSJ9.3T-pNtpv8w70UcYJ6sp_7eb9R2E3OG2SkZkOFar7aks";

console.log('🔍 JWT Debug Test');
console.log('================');

console.log('\n1. Token Info:');
console.log('Token length:', token.length);
console.log('Token preview:', token.substring(0, 50) + '...');

console.log('\n2. Decoding without verification:');
try {
  const decoded = jwt.decode(token);
  console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
} catch (error) {
  console.log('❌ Decode error:', error.message);
}

console.log('\n3. Config check:');
console.log('JWT Secret exists:', !!config.jwtSecret);
console.log('JWT Secret length:', config.jwtSecret ? config.jwtSecret.length : 'N/A');

console.log('\n4. Verifying with config:');
try {
  const verified = jwt.verify(token, config.jwtSecret, {
    issuer: 'tcf-tef-api',
    audience: 'tcf-tef-app'
  });
  console.log('✅ Verification successful!');
  console.log('Verified payload:', JSON.stringify(verified, null, 2));
} catch (error) {
  console.log('❌ Verification error:', error.message);
  console.log('Error name:', error.name);
  console.log('Error details:', error);
}

console.log('\n5. Checking expiration:');
try {
  const decoded = jwt.decode(token);
  if (decoded && decoded.exp) {
    const now = Math.floor(Date.now() / 1000);
    const exp = decoded.exp;
    console.log('Current time:', now);
    console.log('Token expires:', exp);
    console.log('Time until expiry:', exp - now, 'seconds');
    console.log('Token expired:', now > exp);
  }
} catch (error) {
  console.log('❌ Expiration check error:', error.message);
}
