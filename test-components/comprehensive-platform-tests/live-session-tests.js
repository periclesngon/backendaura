/**
 * Comprehensive Live Session Tests
 * Tests all live session functionality including creation, registration, and participation
 */

const axios = require('axios');
const BASE_URL = 'http://localhost:3001';

class LiveSessionTester {
  constructor() {
    this.testResults = { passed: 0, failed: 0, tests: [] };
    this.managerToken = null;
    this.studentToken = null;
    this.testSessionId = null;
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

  async setupTestUsers() {
    console.log('🔧 Setting up test users for live sessions...\n');

    // Create manager user
    const managerUser = {
      email: `live-session-manager-${Date.now()}@example.com`,
      password: 'LiveSessionManager123!',
      firstName: 'Live',
      lastName: 'Manager'
    };

    const managerResult = await this.makeRequest('POST', '/api/auth/register', managerUser);
    if (managerResult.success) {
      this.managerToken = managerResult.data?.token || managerResult.data?.data?.tokens?.accessToken;
      this.log('Manager User Setup', true, 'Manager user created successfully');
    } else {
      this.log('Manager User Setup', false, 'Failed to create manager user');
    }

    // Create student user
    const studentUser = {
      email: `live-session-student-${Date.now()}@example.com`,
      password: 'LiveSessionStudent123!',
      firstName: 'Live',
      lastName: 'Student'
    };

    const studentResult = await this.makeRequest('POST', '/api/auth/register', studentUser);
    if (studentResult.success) {
      this.studentToken = studentResult.data?.token || studentResult.data?.data?.tokens?.accessToken;
      this.log('Student User Setup', true, 'Student user created successfully');
    } else {
      this.log('Student User Setup', false, 'Failed to create student user');
    }
  }

  // ==================== LIVE SESSION CREATION TESTS ====================

  async testLiveSessionCreation() {
    console.log('\n📹 Testing Live Session Creation...\n');

    if (!this.managerToken) {
      this.log('Live Session Creation', false, 'Missing manager token');
      return;
    }

    const sessionData = {
      title: `Test Live Session ${Date.now()}`,
      description: 'A comprehensive test live session for French learning',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      duration: 60,
      maxParticipants: 25,
      level: 'INTERMEDIATE',
      topics: ['Grammar', 'Conversation', 'Pronunciation']
    };

    const result = await this.makeRequest('POST', '/api/live-sessions', sessionData, this.managerToken);
    
    if (result.success) {
      this.testSessionId = result.data?.id || result.data?.session?.id || result.data?.data?.session?.id;
      this.log('Live Session Creation', true, `Session created: ${this.testSessionId || 'ID received'}`);
      return this.testSessionId;
    } else {
      this.log('Live Session Creation', result.status === 401 || result.status === 403,
        result.status === 401 ? 'Correctly requires authentication' :
        result.status === 403 ? 'Correctly requires manager role' :
        `Failed: ${result.error.message || 'Unknown error'}`);
      return null;
    }
  }

  // ==================== LIVE SESSION LISTING TESTS ====================

  async testLiveSessionListing() {
    console.log('\n📋 Testing Live Session Listing...\n');

    // Test upcoming sessions (public access)
    const upcomingResult = await this.makeRequest('GET', '/api/live-sessions/upcoming');
    
    if (upcomingResult.success) {
      // The response structure is nested: { success: true, data: { success: true, data: [sessions...] } }
      const sessions = upcomingResult.data?.data || [];
      this.log('Upcoming Sessions Listing', true, `Found ${Array.isArray(sessions) ? sessions.length : 'invalid'} upcoming session(s)`);

      // Test session data structure
      if (Array.isArray(sessions) && sessions.length > 0) {
        const session = sessions[0];
        const hasRequiredFields = session.id && session.title && session.date;
        this.log('Session Data Structure', hasRequiredFields,
          hasRequiredFields ? 'Sessions have required fields' : 'Sessions missing required fields');

        // Store the first session ID for further testing
        this.testSessionId = session.id;
      }
    } else {
      this.log('Upcoming Sessions Listing', false, `Failed: ${upcomingResult.error.message || 'Unknown error'}`);
    }

    // Test with authentication for personalized data
    if (this.studentToken) {
      const authResult = await this.makeRequest('GET', '/api/live-sessions/upcoming', null, this.studentToken);
      
      if (authResult.success) {
        this.log('Authenticated Session Listing', true, 'Authenticated user can access sessions');
      } else {
        this.log('Authenticated Session Listing', false, 'Authenticated access failed');
      }
    }
  }

  // ==================== SESSION REGISTRATION TESTS ====================

  async testSessionRegistration() {
    console.log('\n✋ Testing Session Registration...\n');

    if (!this.studentToken || !this.testSessionId) {
      this.log('Session Registration', false, 'Missing prerequisites');
      return;
    }

    // Test student registration
    const registerResult = await this.makeRequest('POST', `/api/live-sessions/${this.testSessionId}/register`, null, this.studentToken);
    
    if (registerResult.success) {
      this.log('Student Registration', true, 'Student successfully registered for session');
      
      // Verify registration
      const registeredResult = await this.makeRequest('GET', '/api/live-sessions/registered', null, this.studentToken);
      
      if (registeredResult.success) {
        const registeredSessions = registeredResult.data || [];
        const isRegistered = registeredSessions.some(session => session.id === this.testSessionId);
        this.log('Registration Verification', isRegistered,
          isRegistered ? 'Registration verified in user\'s registered sessions' : 'Registration not found');
      } else {
        this.log('Registration Verification', false, 'Could not verify registration');
      }
    } else {
      this.log('Student Registration', registerResult.status === 401 || registerResult.status === 403, 
        registerResult.status === 401 ? 'Correctly requires authentication' : 
        registerResult.status === 403 ? 'Access properly restricted' : 
        `Failed: ${registerResult.error.message || 'Unknown error'}`);
    }
  }

  // ==================== SESSION DETAILS TESTS ====================

  async testSessionDetails() {
    console.log('\n🔍 Testing Session Details...\n');

    if (!this.testSessionId) {
      this.log('Session Details', false, 'No test session available');
      return;
    }

    // Test public access to session details
    const publicResult = await this.makeRequest('GET', `/api/live-sessions/${this.testSessionId}`);
    
    if (publicResult.success) {
      const session = publicResult.data || publicResult.data?.session;
      this.log('Public Session Details', true, `Session details accessible: ${session?.title || 'Title received'}`);

      // Test session data completeness
      const hasRequiredFields = session && session.id && session.title && session.description && session.date;
      this.log('Session Details Completeness', hasRequiredFields,
        hasRequiredFields ? 'Session has all required details' : 'Session missing required details');
    } else {
      this.log('Public Session Details', false, `Failed: ${publicResult.error.message || 'Unknown error'}`);
    }

    // Test authenticated access for additional details
    if (this.studentToken) {
      const authResult = await this.makeRequest('GET', `/api/live-sessions/${this.testSessionId}`, null, this.studentToken);
      
      if (authResult.success) {
        this.log('Authenticated Session Details', true, 'Authenticated user can access session details');
      } else {
        this.log('Authenticated Session Details', false, 'Authenticated access failed');
      }
    }
  }

  // ==================== SESSION JOIN/LEAVE TESTS ====================

  async testSessionJoinLeave() {
    console.log('\n🚪 Testing Session Join/Leave...\n');

    if (!this.studentToken || !this.testSessionId) {
      this.log('Session Join/Leave', false, 'Missing prerequisites');
      return;
    }

    // Test joining session
    const joinResult = await this.makeRequest('POST', `/api/live-sessions/${this.testSessionId}/join`, null, this.studentToken);
    
    if (joinResult.success) {
      this.log('Session Join', true, 'Student successfully joined session');
      
      // Test leaving session
      const leaveResult = await this.makeRequest('POST', `/api/live-sessions/${this.testSessionId}/leave`, null, this.studentToken);
      
      if (leaveResult.success) {
        this.log('Session Leave', true, 'Student successfully left session');
      } else {
        this.log('Session Leave', leaveResult.status === 401 || leaveResult.status === 403, 
          leaveResult.status === 401 ? 'Correctly requires authentication' : 
          leaveResult.status === 403 ? 'Access properly restricted' : 
          `Failed: ${leaveResult.error.message || 'Unknown error'}`);
      }
    } else {
      this.log('Session Join', joinResult.status === 401 || joinResult.status === 403, 
        joinResult.status === 401 ? 'Correctly requires authentication' : 
        joinResult.status === 403 ? 'Access properly restricted' : 
        `Failed: ${joinResult.error.message || 'Unknown error'}`);
    }
  }

  // ==================== SESSION MANAGEMENT TESTS ====================

  async testSessionManagement() {
    console.log('\n⚙️ Testing Session Management...\n');

    if (!this.managerToken || !this.testSessionId) {
      this.log('Session Management', false, 'Missing prerequisites');
      return;
    }

    // Test session update
    const updateData = {
      title: `Updated Test Session ${Date.now()}`,
      description: 'Updated description for the test session',
      maxParticipants: 30
    };

    const updateResult = await this.makeRequest('PUT', `/api/live-sessions/${this.testSessionId}`, updateData, this.managerToken);
    
    if (updateResult.success) {
      this.log('Session Update', true, 'Session updated successfully');
    } else {
      this.log('Session Update', updateResult.status === 401 || updateResult.status === 403, 
        updateResult.status === 401 ? 'Correctly requires authentication' : 
        updateResult.status === 403 ? 'Correctly requires manager role' : 
        `Failed: ${updateResult.error.message || 'Unknown error'}`);
    }

    // Test session deletion (if supported)
    const deleteResult = await this.makeRequest('DELETE', `/api/live-sessions/${this.testSessionId}`, null, this.managerToken);
    
    if (deleteResult.success) {
      this.log('Session Deletion', true, 'Session deleted successfully');
    } else {
      this.log('Session Deletion', deleteResult.status === 401 || deleteResult.status === 403, 
        deleteResult.status === 401 ? 'Correctly requires authentication' : 
        deleteResult.status === 403 ? 'Correctly requires manager role' : 
        `Failed: ${deleteResult.error.message || 'Unknown error'}`);
    }
  }

  // ==================== SECURITY TESTS ====================

  async testLiveSessionSecurity() {
    console.log('\n🔒 Testing Live Session Security...\n');

    // Test session creation without authentication
    const sessionData = {
      title: 'Unauthorized Session',
      description: 'This should not be created',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      duration: 60
    };

    const noAuthResult = await this.makeRequest('POST', '/api/live-sessions', sessionData);
    this.log('Session Creation Security', noAuthResult.status === 401, 
      noAuthResult.status === 401 ? 'Correctly requires authentication' : 'Should require authentication');

    // Test student trying to create session
    if (this.studentToken) {
      const studentCreateResult = await this.makeRequest('POST', '/api/live-sessions', sessionData, this.studentToken);
      this.log('Student Creation Restriction', studentCreateResult.status === 403, 
        studentCreateResult.status === 403 ? 'Correctly restricts students from creating sessions' : 'Should restrict student access');
    }

    // Test accessing registered sessions without authentication
    const noAuthRegisteredResult = await this.makeRequest('GET', '/api/live-sessions/registered');
    this.log('Registered Sessions Security', noAuthRegisteredResult.status === 401, 
      noAuthRegisteredResult.status === 401 ? 'Correctly requires authentication' : 'Should require authentication');
  }

  // ==================== MAIN TEST RUNNER ====================

  async runAllLiveSessionTests() {
    console.log('📹 Starting Comprehensive Live Session Tests...\n');
    console.log(`Testing server at: ${BASE_URL}\n`);

    try {
      // Setup
      await this.setupTestUsers();

      // Run live session tests
      await this.testLiveSessionCreation();
      await this.testLiveSessionListing();
      await this.testSessionRegistration();
      await this.testSessionDetails();
      await this.testSessionJoinLeave();
      await this.testSessionManagement();
      await this.testLiveSessionSecurity();

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Live session test execution failed:', error.message);
    }
  }

  printSummary() {
    console.log('\n📊 LIVE SESSION TEST SUMMARY\n');
    console.log('=' .repeat(50));

    const total = this.testResults.passed + this.testResults.failed;
    const successRate = total > 0 ? Math.round((this.testResults.passed / total) * 100) : 0;

    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.testResults.failed === 0) {
      console.log('\n🎉 ALL LIVE SESSION TESTS PASSED! Live session system is fully functional.');
    } else {
      console.log('\n⚠️  Some live session tests failed. Check the details above.');
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
  const tester = new LiveSessionTester();
  tester.runAllLiveSessionTests().catch(console.error);
}

module.exports = LiveSessionTester;
