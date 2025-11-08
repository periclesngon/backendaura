/**
 * Test script for password reset endpoints
 * Run with: npx ts-node test-password-reset.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const API_URL = `${BASE_URL}/api/auth`;

// Test user credentials (update these with a real user from your database)
const TEST_EMAIL = 'test@example.com';
const TEST_PHONE = '+237612345678';
const TEST_NEW_PASSWORD = 'NewPassword123!';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function test(name: string, testFn: () => Promise<any>): Promise<void> {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    const data = await testFn();
    results.push({ name, passed: true, data });
    console.log(`✅ PASSED: ${name}`);
    if (data) {
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    }
  } catch (error: any) {
    results.push({ 
      name, 
      passed: false, 
      error: error.response?.data?.error?.message || error.message 
    });
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error:`, error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting Password Reset Endpoint Tests\n');
  console.log(`📍 Testing against: ${API_URL}\n`);

  let resetTokenId: string | null = null;
  let resetCode: string | null = null;

  // Test 1: Request password reset via email
  await test('POST /forgot-password (email)', async () => {
    const response = await axios.post(`${API_URL}/forgot-password`, {
      method: 'email',
      email: TEST_EMAIL,
      lang: 'fr'
    });
    return response.data;
  });

  // Test 2: Request password reset via phone
  await test('POST /forgot-password (phone)', async () => {
    const response = await axios.post(`${API_URL}/forgot-password`, {
      method: 'phone',
      phone: TEST_PHONE,
      lang: 'fr'
    });
    return response.data;
  });

  // Test 3: Verify reset code (this will fail without a real code, but tests the endpoint)
  await test('POST /verify-reset-code (invalid code)', async () => {
    try {
      const response = await axios.post(`${API_URL}/verify-reset-code`, {
        code: '000000',
        method: 'email',
        email: TEST_EMAIL
      });
      return response.data;
    } catch (error: any) {
      // Expected to fail with invalid code
      if (error.response?.status === 400) {
        return { success: false, error: 'Invalid code (expected)' };
      }
      throw error;
    }
  });

  // Test 4: Resend reset code
  await test('POST /resend-reset-code (email)', async () => {
    const response = await axios.post(`${API_URL}/resend-reset-code`, {
      method: 'email',
      email: TEST_EMAIL,
      lang: 'fr'
    });
    return response.data;
  });

  // Test 5: Reset password (this will fail without a valid tokenId, but tests the endpoint)
  await test('POST /reset-password (invalid token)', async () => {
    try {
      const response = await axios.post(`${API_URL}/reset-password`, {
        tokenId: 'invalid-token-id',
        newPassword: TEST_NEW_PASSWORD
      });
      return response.data;
    } catch (error: any) {
      // Expected to fail with invalid token
      if (error.response?.status === 400) {
        return { success: false, error: 'Invalid token (expected)' };
      }
      throw error;
    }
  });

  // Test 6: Validation errors
  await test('POST /forgot-password (validation error - missing method)', async () => {
    try {
      const response = await axios.post(`${API_URL}/forgot-password`, {
        email: TEST_EMAIL
      });
      return response.data;
    } catch (error: any) {
      // Expected validation error
      if (error.response?.status === 400) {
        return { success: false, error: 'Validation error (expected)' };
      }
      throw error;
    }
  });

  // Test 7: Validation error - invalid code format
  await test('POST /verify-reset-code (validation error - invalid code)', async () => {
    try {
      const response = await axios.post(`${API_URL}/verify-reset-code`, {
        code: '12345', // Too short
        method: 'email',
        email: TEST_EMAIL
      });
      return response.data;
    } catch (error: any) {
      // Expected validation error
      if (error.response?.status === 400) {
        return { success: false, error: 'Validation error (expected)' };
      }
      throw error;
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Note: Some tests are expected to fail (invalid codes/tokens)');
  console.log('   These failures confirm that validation is working correctly.\n');
}

// Run tests
runTests().catch(console.error);

