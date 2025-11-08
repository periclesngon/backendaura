/**
 * Token Validation Test Script
 * Manual test to verify secure session tokens expire after 1.5 hours (90 minutes)
 */

import { SecureSessionService } from '../services/secureSessionService';
import jwt from 'jsonwebtoken';

// Manual test function
function testTokenGenerationAndExpiration() {
  console.log('=== Token Validation Test ===\n');
  
  const sessionId = 'test-session-123';
  const studentId = 'test-student-456';
  
  // Test 1: Generate token
  console.log('1. Generating token...');
  const token = SecureSessionService.generateSecureToken(sessionId, studentId);
  console.log(`✅ Token generated: ${token.substring(0, 50)}...\n`);
  
  // Test 2: Decode and check expiration
  const decoded = jwt.decode(token) as any;
  const now = Math.floor(Date.now() / 1000);
  const expiration = decoded.exp;
  const issuedAt = decoded.iat;
  const duration = expiration - issuedAt;
  const durationInHours = duration / 3600;
  
  console.log('2. Checking token expiration...');
  console.log(`   Issued at: ${new Date(issuedAt * 1000).toISOString()}`);
  console.log(`   Expires at: ${new Date(expiration * 1000).toISOString()}`);
  console.log(`   Duration: ${duration} seconds (${durationInHours.toFixed(2)} hours)`);
  
  if (Math.abs(durationInHours - 1.5) < 0.01) {
    console.log(`   ✅ Token expires in 1.5 hours (${duration} seconds)\n`);
  } else {
    console.log(`   ❌ Token expiration incorrect. Expected 1.5 hours, got ${durationInHours.toFixed(2)} hours\n`);
  }
  
  // Test 3: Validate token
  console.log('3. Validating token...');
  const validation = SecureSessionService.validateSecureToken(token);
  if (validation.valid) {
    console.log(`   ✅ Token is valid`);
    console.log(`   Session ID: ${validation.sessionId}`);
    console.log(`   Student ID: ${validation.studentId}\n`);
  } else {
    console.log(`   ❌ Token validation failed: ${validation.error}\n`);
  }
  
  // Test 4: Test sanitization
  console.log('4. Testing token sanitization...');
  const tokenWithBr = token + '<br>';
  const sanitized = tokenWithBr
    .replace(/<br\s*\/?>(?:\s*)/gi, '')
    .trim()
    .split('<br>')[0];
  
  const sanitizedValidation = SecureSessionService.validateSecureToken(sanitized);
  if (sanitizedValidation.valid) {
    console.log(`   ✅ Sanitized token is valid\n`);
  } else {
    console.log(`   ❌ Sanitized token validation failed: ${sanitizedValidation.error}\n`);
  }
  
  // Test 5: Check expiration time remaining
  const timeRemaining = expiration - now;
  const hoursRemaining = timeRemaining / 3600;
  console.log('5. Expiration check...');
  console.log(`   Time remaining: ${timeRemaining} seconds (${hoursRemaining.toFixed(2)} hours)`);
  
  if (hoursRemaining > 1.49 && hoursRemaining < 1.51) {
    console.log(`   ✅ Token expires in approximately 1.5 hours\n`);
  } else {
    console.log(`   ⚠️  Token expires in ${hoursRemaining.toFixed(2)} hours (expected ~1.5 hours)\n`);
  }
  
  console.log('=== Test Complete ===');
  return {
    token,
    valid: validation.valid,
    expiresIn: timeRemaining,
    expiresInHours: hoursRemaining
  };
}

// Run test if executed directly
if (require.main === module) {
  testTokenGenerationAndExpiration();
}

export { testTokenGenerationAndExpiration };

