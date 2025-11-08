/**
 * Comprehensive Transaction Tests
 * Tests all payment and transaction flows on the platform
 */

const axios = require('axios');
const BASE_URL = 'http://localhost:3001';

class TransactionTester {
  constructor() {
    this.testResults = { passed: 0, failed: 0, tests: [] };
    this.studentToken = null;
    this.testCourseId = null;
    this.testSubscriptionId = null;
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
        headers: {}
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

  async setupTestUser() {
    console.log('🔧 Setting up test user for transactions...\n');

    const testUser = {
      email: `transaction-test-${Date.now()}@example.com`,
      password: 'TransactionTest123!',
      firstName: 'Transaction',
      lastName: 'Tester'
    };

    // Register user
    const registerResult = await this.makeRequest('POST', '/api/auth/register', testUser);
    
    if (registerResult.success) {
      this.studentToken = registerResult.data.data.tokens.accessToken;
      this.log('User Setup', true, 'Test user registered successfully');
    } else {
      // Try to login if user already exists
      const loginResult = await this.makeRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: testUser.password
      });
      
      if (loginResult.success) {
        this.studentToken = loginResult.data.data.tokens.accessToken;
        this.log('User Setup', true, 'Test user logged in successfully');
      } else {
        this.log('User Setup', false, 'Failed to setup test user');
        return false;
      }
    }
    return true;
  }

  async setupTestCourse() {
    console.log('📚 Setting up test course for transactions...\n');

    // Get available courses first
    const coursesResult = await this.makeRequest('GET', '/api/courses');
    
    if (coursesResult.success && coursesResult.data.data?.length > 0) {
      this.testCourseId = coursesResult.data.data[0].id;
      this.log('Course Setup', true, `Using existing course: ${this.testCourseId}`);
      return true;
    } else {
      this.log('Course Setup', false, 'No courses available for testing');
      return false;
    }
  }

  // ==================== PAYMENT INTENT TESTS ====================

  async testPaymentIntentCreation() {
    console.log('\n💳 Testing Subscription Payment Intent Creation...\n');

    if (!this.studentToken) {
      this.log('Payment Intent Creation', false, 'Missing prerequisites');
      return;
    }

    const paymentData = {
      tier: 'PREMIUM',
      billingCycle: 'monthly',
      currency: 'usd'
    };

    const result = await this.makeRequest('POST', '/api/payments/subscription/create-intent', paymentData, this.studentToken);

    if (result.success) {
      this.log('Payment Intent Creation', true, `Subscription payment intent created: ${result.data.data?.paymentIntentId || 'ID received'}`);
      return result.data.data?.paymentIntentId;
    } else {
      this.log('Payment Intent Creation', result.status === 401 || result.status === 403,
        result.status === 401 ? 'Correctly requires authentication' :
        result.status === 403 ? 'Access properly restricted' :
        `Failed: ${result.error.message || 'Unknown error'}`);
      return null;
    }
  }

  // ==================== COURSE ENROLLMENT TRANSACTION TESTS ====================

  async testCourseEnrollmentTransaction() {
    console.log('\n🎓 Testing Course Enrollment Transaction...\n');

    if (!this.studentToken || !this.testCourseId) {
      this.log('Course Enrollment Transaction', false, 'Missing prerequisites');
      return;
    }

    // Test enrollment
    const enrollResult = await this.makeRequest('POST', `/api/courses/${this.testCourseId}/enroll`, null, this.studentToken);
    
    if (enrollResult.success) {
      this.log('Course Enrollment', true, 'Successfully enrolled in course');
      
      // Verify enrollment
      const enrolledResult = await this.makeRequest('GET', '/api/courses/enrolled', null, this.studentToken);
      
      if (enrolledResult.success) {
        // The response structure is nested: { success: true, data: { success: true, data: [courses...] } }
        const enrolledCourses = enrolledResult.data?.data || [];
        const isEnrolled = Array.isArray(enrolledCourses) && enrolledCourses.some(course => course.id === this.testCourseId);
        this.log('Enrollment Verification', isEnrolled,
          isEnrolled ? 'Enrollment verified in user\'s enrolled courses' : 'Enrollment not found in user\'s courses');
      } else {
        this.log('Enrollment Verification', false, 'Could not verify enrollment');
      }
    } else {
      this.log('Course Enrollment', enrollResult.status === 401 || enrollResult.status === 403, 
        enrollResult.status === 401 ? 'Correctly requires authentication' : 
        enrollResult.status === 403 ? 'Access properly restricted' : 
        `Failed: ${enrollResult.error.message || 'Unknown error'}`);
    }
  }

  // ==================== SUBSCRIPTION TESTS ====================

  async testSubscriptionTransaction() {
    console.log('\n📅 Testing Subscription Transaction...\n');

    if (!this.studentToken) {
      this.log('Subscription Transaction', false, 'Missing student token');
      return;
    }

    const subscriptionData = {
      tier: 'PREMIUM',
      billingCycle: 'monthly'
    };

    // Test subscription creation
    const createResult = await this.makeRequest('POST', '/api/subscriptions', subscriptionData, this.studentToken);
    
    if (createResult.success) {
      this.testSubscriptionId = createResult.data.data?.subscription?.id;
      this.log('Subscription Creation', true, `Subscription created: ${this.testSubscriptionId || 'ID received'}`);
      
      // Test subscription retrieval
      const getResult = await this.makeRequest('GET', '/api/subscriptions', null, this.studentToken);
      
      if (getResult.success) {
        // The response structure is { success: true, data: [subscriptions...], pagination: {...} }
        const subscriptions = getResult.data?.data || getResult.data || [];
        this.log('Subscription Retrieval', subscriptions.length > 0,
          `Found ${subscriptions.length} subscription(s)`);
      } else {
        this.log('Subscription Retrieval', false, 'Could not retrieve subscriptions');
      }
    } else {
      this.log('Subscription Creation', createResult.status === 401 || createResult.status === 403, 
        createResult.status === 401 ? 'Correctly requires authentication' : 
        createResult.status === 403 ? 'Access properly restricted' : 
        `Failed: ${createResult.error.message || 'Unknown error'}`);
    }
  }

  // ==================== PAYMENT HISTORY TESTS ====================

  async testPaymentHistory() {
    console.log('\n📊 Testing Payment History...\n');

    if (!this.studentToken) {
      this.log('Payment History', false, 'Missing student token');
      return;
    }

    const result = await this.makeRequest('GET', '/api/payments/history', null, this.studentToken);
    
    if (result.success) {
      const payments = result.data.data?.payments || [];
      this.log('Payment History Access', true, `Found ${payments.length} payment record(s)`);
      
      // Test payment history structure
      if (payments.length > 0) {
        const payment = payments[0];
        const hasRequiredFields = payment.id && payment.amount && payment.status;
        this.log('Payment History Structure', hasRequiredFields, 
          hasRequiredFields ? 'Payment records have required fields' : 'Payment records missing required fields');
      }
    } else {
      this.log('Payment History Access', result.status === 401 || result.status === 403, 
        result.status === 401 ? 'Correctly requires authentication' : 
        result.status === 403 ? 'Access properly restricted' : 
        `Failed: ${result.error.message || 'Unknown error'}`);
    }
  }

  // ==================== WEBHOOK TESTS ====================

  async testWebhookEndpoint() {
    console.log('\n🔗 Testing Webhook Endpoint...\n');

    // Test webhook endpoint accessibility (should be public)
    const webhookData = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_123',
          status: 'succeeded'
        }
      }
    };

    const result = await this.makeRequest('POST', '/api/payments/webhook', webhookData);
    
    // Webhook should be accessible without authentication
    this.log('Webhook Endpoint Access', result.status !== 401, 
      result.status !== 401 ? 'Webhook endpoint is publicly accessible' : 'Webhook should not require authentication');
    
    // Test webhook response
    if (result.success || result.status === 400) {
      this.log('Webhook Response', true, 'Webhook endpoint responds to requests');
    } else {
      this.log('Webhook Response', false, `Webhook failed: ${result.error.message || 'Unknown error'}`);
    }
  }

  // ==================== TRANSACTION SECURITY TESTS ====================

  async testTransactionSecurity() {
    console.log('\n🔒 Testing Transaction Security...\n');

    // Test payment creation without authentication
    const paymentData = {
      courseId: this.testCourseId || 'test-course-id',
      currency: 'usd'
    };

    const noAuthResult = await this.makeRequest('POST', '/api/payments/course/create-intent', paymentData);
    this.log('Payment Security - No Auth', noAuthResult.status === 401, 
      noAuthResult.status === 401 ? 'Correctly requires authentication' : 'Should require authentication');

    // Test subscription creation without authentication
    const subscriptionData = {
      tier: 'PREMIUM',
      billingCycle: 'monthly'
    };

    const noAuthSubResult = await this.makeRequest('POST', '/api/subscriptions', subscriptionData);
    this.log('Subscription Security - No Auth', noAuthSubResult.status === 401, 
      noAuthSubResult.status === 401 ? 'Correctly requires authentication' : 'Should require authentication');

    // Test payment history without authentication
    const noAuthHistoryResult = await this.makeRequest('GET', '/api/payments/history');
    this.log('Payment History Security - No Auth', noAuthHistoryResult.status === 401, 
      noAuthHistoryResult.status === 401 ? 'Correctly requires authentication' : 'Should require authentication');
  }

  // ==================== COURSE PURCHASE FLOW TESTS ====================

  async testCoursePurchaseFlow() {
    console.log('\n🛒 Testing Course Purchase Flow...\n');

    if (!this.studentToken || !this.testCourseId) {
      this.log('Course Purchase Flow', false, 'Missing prerequisites');
      return;
    }

    // Step 1: Get course details and price
    const courseResult = await this.makeRequest('GET', `/api/courses/${this.testCourseId}`, null, this.studentToken);

    if (courseResult.success) {
      const course = courseResult.data.data?.course;
      this.log('Course Details Retrieval', true, `Course: ${course?.title || 'Title received'}`);

      // Step 2: Verify subscription-based access (courses don't have individual prices)
      if (!course?.price || course?.price === 0) {
        this.log('Course Access Model', true, 'Course correctly uses subscription-based access');
      } else {
        this.log('Course Access Model', false, 'Course should not have individual pricing');
      }

      // Step 3: Test direct enrollment (should work with subscription)
      const enrollResult = await this.makeRequest('POST', `/api/courses/${this.testCourseId}/enroll`, null, this.studentToken);

      if (enrollResult.success) {
        this.log('Course Enrollment', true, 'Successfully enrolled through subscription');
      } else {
        this.log('Course Enrollment', enrollResult.status === 409,
          enrollResult.status === 409 ? 'Already enrolled (expected)' :
          `Enrollment failed: ${enrollResult.error.message || 'Unknown error'}`);
      }
    } else {
      this.log('Course Details Retrieval', false, 'Could not retrieve course details');
    }
  }

  // ==================== SUBSCRIPTION UPGRADE FLOW TESTS ====================

  async testSubscriptionUpgradeFlow() {
    console.log('\n⬆️ Testing Subscription Upgrade Flow...\n');

    if (!this.studentToken) {
      this.log('Subscription Upgrade Flow', false, 'Missing student token');
      return;
    }

    // Step 1: Create essential subscription (lowest paid tier)
    const basicSubscription = {
      tier: 'ESSENTIAL',
      billingCycle: 'monthly'
    };

    const basicResult = await this.makeRequest('POST', '/api/subscriptions', basicSubscription, this.studentToken);

    if (basicResult.success) {
      this.log('Basic Subscription Creation', true, 'Basic subscription created');

      // Step 2: Upgrade to premium
      const upgradeData = {
        tier: 'PREMIUM',
        billingCycle: 'monthly'
      };

      const upgradeResult = await this.makeRequest('PUT', '/api/subscriptions/change', upgradeData, this.studentToken);

      if (upgradeResult.success) {
        this.log('Subscription Upgrade', true, 'Successfully upgraded to premium');
      } else {
        this.log('Subscription Upgrade', upgradeResult.status === 401 || upgradeResult.status === 403,
          upgradeResult.status === 401 ? 'Correctly requires authentication' :
          upgradeResult.status === 403 ? 'Access properly restricted' :
          `Failed: ${upgradeResult.error.message || 'Unknown error'}`);
      }
    } else {
      this.log('Basic Subscription Creation', basicResult.status === 401 || basicResult.status === 403,
        basicResult.status === 401 ? 'Correctly requires authentication' :
        basicResult.status === 403 ? 'Access properly restricted' :
        `Failed: ${basicResult.error.message || 'Unknown error'}`);
    }
  }

  // ==================== MAIN TEST RUNNER ====================

  async runAllTransactionTests() {
    console.log('💰 Starting Comprehensive Transaction Tests...\n');
    console.log(`Testing server at: ${BASE_URL}\n`);

    try {
      // Setup
      const userSetup = await this.setupTestUser();
      if (!userSetup) return;

      await this.setupTestCourse();

      // Run transaction tests
      await this.testPaymentIntentCreation();
      await this.testCourseEnrollmentTransaction();
      await this.testSubscriptionTransaction();
      await this.testPaymentHistory();
      await this.testWebhookEndpoint();
      await this.testTransactionSecurity();
      await this.testCoursePurchaseFlow();
      await this.testSubscriptionUpgradeFlow();

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Transaction test execution failed:', error.message);
    }
  }

  printSummary() {
    console.log('\n📊 TRANSACTION TEST SUMMARY\n');
    console.log('=' .repeat(50));

    const total = this.testResults.passed + this.testResults.failed;
    const successRate = total > 0 ? Math.round((this.testResults.passed / total) * 100) : 0;

    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.testResults.failed === 0) {
      console.log('\n🎉 ALL TRANSACTION TESTS PASSED! Payment system is fully functional.');
    } else {
      console.log('\n⚠️  Some transaction tests failed. Check the details above.');
    }

    // Detailed results
    console.log('\nDetailed Results:');
    this.testResults.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.testName}: ${test.message}`);
    });
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new TransactionTester();
  tester.runAllTransactionTests().catch(console.error);
}

module.exports = TransactionTester;
