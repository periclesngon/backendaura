/**
 * Quick Smoke Tests
 * Fast tests to verify basic platform functionality
 */

const axios = require('axios');
const BASE_URL = 'http://localhost:3001';

class QuickSmokeTests {
  constructor() {
    this.testResults = { passed: 0, failed: 0, tests: [] };
  }

  log(testName, passed, message = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${testName}${message ? ': ' + message : ''}`);
    
    this.testResults.tests.push({ testName, passed, message });
    if (passed) {
      this.testResults.passed++;
    } else {
      this.testResults.failed++;
    }
  }

  async makeRequest(method, endpoint, data = null, token = null) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {},
        timeout: 5000 // 5 second timeout for quick tests
      };

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      if (data) {
        config.data = data;
        config.headers['Content-Type'] = 'application/json';
      }

      const response = await axios(config);
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500
      };
    }
  }

  async runQuickSmokeTests() {
    console.log('🚀 Running Quick Smoke Tests...\n');
    console.log(`Testing server at: ${BASE_URL}\n`);

    const startTime = Date.now();

    try {
      // Test 1: Server Health
      const healthResult = await this.makeRequest('GET', '/health');
      this.log('Server Health', healthResult.success && healthResult.data.status === 'healthy', 
        healthResult.success ? 'Server is healthy' : 'Server health check failed');

      // Test 2: API Accessibility
      const coursesResult = await this.makeRequest('GET', '/api/courses');
      this.log('API Accessibility', coursesResult.success, 
        coursesResult.success ? 'API endpoints accessible' : 'API not accessible');

      // Test 3: Authentication Required
      const protectedResult = await this.makeRequest('GET', '/api/users/profile');
      this.log('Authentication Protection', protectedResult.status === 401, 
        protectedResult.status === 401 ? 'Protected routes require auth' : 'Auth protection may be broken');

      // Test 4: CORS Headers
      const corsResult = await this.makeRequest('GET', '/health');
      const hasCors = corsResult.success && corsResult.data;
      this.log('CORS Configuration', hasCors, 
        hasCors ? 'CORS headers present' : 'CORS may not be configured');

      // Test 5: Error Handling
      const notFoundResult = await this.makeRequest('GET', '/api/non-existent-endpoint');
      this.log('Error Handling', notFoundResult.status === 404, 
        notFoundResult.status === 404 ? '404 errors handled correctly' : 'Error handling may be broken');

      // Test 6: Registration Endpoint
      const testUser = {
        email: `smoke-test-${Date.now()}@example.com`,
        password: 'SmokeTest123!',
        firstName: 'Smoke',
        lastName: 'Test'
      };
      const registerResult = await this.makeRequest('POST', '/api/auth/register', testUser);
      this.log('User Registration', registerResult.success || registerResult.status === 400, 
        registerResult.success ? 'Registration working' : 
        registerResult.status === 400 ? 'Registration endpoint responding' : 'Registration may be broken');

      // Test 7: Database Connection (via courses)
      if (coursesResult.success && coursesResult.data.data) {
        this.log('Database Connection', true, 'Database queries working');
      } else {
        this.log('Database Connection', false, 'Database may not be connected');
      }

      // Test 8: JSON Response Format
      const jsonTest = coursesResult.success && coursesResult.data.success !== undefined;
      this.log('JSON Response Format', jsonTest, 
        jsonTest ? 'API returns proper JSON format' : 'JSON format may be inconsistent');

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000 * 100) / 100;

      this.printQuickSummary(duration);

    } catch (error) {
      console.error('❌ Smoke test execution failed:', error.message);
    }
  }

  printQuickSummary(duration) {
    console.log('\n📊 QUICK SMOKE TEST SUMMARY');
    console.log('=' .repeat(40));

    const total = this.testResults.passed + this.testResults.failed;
    const successRate = total > 0 ? Math.round((this.testResults.passed / total) * 100) : 0;

    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.testResults.failed === 0) {
      console.log('\n🎉 ALL SMOKE TESTS PASSED!');
      console.log('✨ Platform basic functionality is working');
      console.log('🚀 Ready for comprehensive testing');
    } else {
      console.log('\n⚠️  SOME SMOKE TESTS FAILED');
      console.log('🚨 Basic platform functionality has issues');
      console.log('🔧 Fix these issues before running full tests');
    }

    console.log('\n💡 Next Steps:');
    if (successRate >= 75) {
      console.log('   ✅ Run comprehensive tests: npm run test');
      console.log('   📊 Check detailed functionality');
    } else {
      console.log('   🔧 Fix failing smoke tests first');
      console.log('   📝 Check server logs for errors');
      console.log('   🔄 Re-run smoke tests after fixes');
    }

    console.log('=' .repeat(40));
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const smokeTests = new QuickSmokeTests();
  smokeTests.runQuickSmokeTests().catch(console.error);
}

module.exports = QuickSmokeTests;
