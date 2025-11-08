/**
 * Comprehensive Role-Based Platform Tests
 * Tests all user interactions from Admin to Student level
 */

const axios = require('axios');
const BASE_URL = 'http://localhost:3001';

class PlatformTester {
  constructor() {
    this.testResults = {
      admin: { passed: 0, failed: 0, tests: [] },
      seniorManager: { passed: 0, failed: 0, tests: [] },
      juniorManager: { passed: 0, failed: 0, tests: [] },
      student: { passed: 0, failed: 0, tests: [] },
      transactions: { passed: 0, failed: 0, tests: [] }
    };
    this.tokens = {};
    this.testUsers = {};
  }

  log(role, testName, passed, message = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${role.toUpperCase()}] ${status} - ${testName}${message ? ': ' + message : ''}`);
    
    this.testResults[role].tests.push({ testName, passed, message });
    if (passed) {
      this.testResults[role].passed++;
    } else {
      this.testResults[role].failed++;
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

  // ==================== USER REGISTRATION & AUTHENTICATION ====================

  async createTestUsers() {
    console.log('\n🔧 Creating Test Users...\n');

    const users = [
      {
        role: 'admin',
        email: 'mfondomerlin@gmail.com', // Use existing admin
        password: 'Password01',
        firstName: 'mfondo',
        lastName: 'merlin'
      },
      {
        role: 'seniorManager',
        email: 'periclesngon01@gmail.com', // Use existing senior manager
        password: 'pepe01',
        firstName: 'pericles',
        lastName: 'ngon'
      },
      {
        role: 'juniorManager',
        email: 'stacyndoukeu@gmail.com', // Use existing junior manager
        password: 'pepe01',
        firstName: 'ndoukeu',
        lastName: 'stacy'
      },
      {
        role: 'student',
        email: `student-${Date.now()}@example.com`,
        password: 'StudentPass123!',
        firstName: 'Test',
        lastName: 'Student'
      }
    ];

    for (const user of users) {
      // For admin, try login first since admin already exists
      if (user.role === 'admin') {
        const loginResult = await this.makeRequest('POST', '/api/auth/login', {
          email: user.email,
          password: user.password
        });

        if (loginResult.success) {
          this.testUsers[user.role] = user;
          this.tokens[user.role] = loginResult.data.data.tokens.accessToken;
          this.log(user.role, 'User Login (Existing)', true, 'Successfully logged in');
        } else {
          this.log(user.role, 'User Login (Existing)', false, loginResult.error.message || 'Login failed');
        }
      } else if (user.role === 'seniorManager' || user.role === 'juniorManager') {
        // Try login first since managers already exist
        const loginResult = await this.makeRequest('POST', '/api/auth/login', {
          email: user.email,
          password: user.password
        });

        if (loginResult.success) {
          this.testUsers[user.role] = user;
          this.tokens[user.role] = loginResult.data.data.tokens.accessToken;
          this.log(user.role, 'User Login (Existing)', true, 'Successfully logged in');
        } else {
          // If login fails, try to create manager using admin endpoint
          if (this.tokens.admin) {
          const managerRole = user.role === 'seniorManager' ? 'SENIOR_MANAGER' : 'JUNIOR_MANAGER';
          const createManagerResult = await this.makeRequest('POST', '/api/admin/managers', {
            email: user.email,
            password: user.password,
            firstName: user.firstName,
            lastName: user.lastName,
            role: managerRole
          }, this.tokens.admin);

          if (createManagerResult.success) {
            // Now login as the created manager
            const loginResult = await this.makeRequest('POST', '/api/auth/login', {
              email: user.email,
              password: user.password
            });

            if (loginResult.success) {
              this.testUsers[user.role] = user;
              this.tokens[user.role] = loginResult.data.data.tokens.accessToken;
              this.log(user.role, 'User Registration', true, 'Manager created and logged in successfully');
            } else {
              this.log(user.role, 'User Login', false, loginResult.error.message || 'Login failed after creation');
            }
          } else {
            this.log(user.role, 'User Registration', false, createManagerResult.error.message || 'Manager creation failed');

            // Try to login if manager already exists
            const loginResult = await this.makeRequest('POST', '/api/auth/login', {
              email: user.email,
              password: user.password
            });

            if (loginResult.success) {
              this.testUsers[user.role] = user;
              this.tokens[user.role] = loginResult.data.data.tokens.accessToken;
              this.log(user.role, 'User Login (Existing)', true, 'Successfully logged in');
            } else {
              this.log(user.role, 'User Login (Existing)', false, loginResult.error.message || 'Login failed');
            }
          }
          } else {
            this.log(user.role, 'User Registration', false, 'No admin token available for manager creation');
          }
        }
      } else {
        // Register regular student user
        const registerResult = await this.makeRequest('POST', '/api/auth/register', user);

        if (registerResult.success) {
          this.testUsers[user.role] = user;
          this.tokens[user.role] = registerResult.data.data.tokens.accessToken;
          this.log(user.role, 'User Registration', true, 'Successfully registered');
        } else {
          this.log(user.role, 'User Registration', false, registerResult.error.message || 'Registration failed');

          // Try to login if user already exists
          const loginResult = await this.makeRequest('POST', '/api/auth/login', {
            email: user.email,
            password: user.password
          });

          if (loginResult.success) {
            this.testUsers[user.role] = user;
            this.tokens[user.role] = loginResult.data.data.tokens.accessToken;
            this.log(user.role, 'User Login (Existing)', true, 'Successfully logged in');
          } else {
            this.log(user.role, 'User Login (Existing)', false, loginResult.error.message || 'Login failed');
          }
        }
      }
    }
  }

  // ==================== ADMIN TESTS ====================

  async testAdminFunctionality() {
    console.log('\n👑 Testing Admin Functionality...\n');
    const token = this.tokens.admin;

    if (!token) {
      this.log('admin', 'Admin Token Check', false, 'No admin token available');
      return;
    }

    // Test admin dashboard access
    const dashboardResult = await this.makeRequest('GET', '/api/admin/dashboard', null, token);
    this.log('admin', 'Dashboard Access', dashboardResult.success, 
      dashboardResult.success ? 'Dashboard accessible' : dashboardResult.error.message);

    // Test system health monitoring
    const healthResult = await this.makeRequest('GET', '/api/admin/system/health', null, token);
    this.log('admin', 'System Health Monitoring', healthResult.success,
      healthResult.success ? 'System health accessible' : healthResult.error.message);

    // Test user management
    const usersResult = await this.makeRequest('GET', '/api/admin/users', null, token);
    this.log('admin', 'User Management Access', usersResult.success,
      usersResult.success ? `Found ${usersResult.data.data?.users?.length || 0} users` : usersResult.error.message);

    // Test manager creation
    const newManager = {
      email: `test-manager-${Date.now()}@example.com`,
      password: 'ManagerPass123!',
      firstName: 'Test',
      lastName: 'Manager',
      role: 'JUNIOR_MANAGER'
    };
    const createManagerResult = await this.makeRequest('POST', '/api/admin/managers', newManager, token);
    this.log('admin', 'Manager Creation', createManagerResult.success,
      createManagerResult.success ? 'Manager created successfully' : createManagerResult.error.message);

    // Test analytics access
    const analyticsResult = await this.makeRequest('GET', '/api/admin/analytics', null, token);
    this.log('admin', 'Analytics Access', analyticsResult.success,
      analyticsResult.success ? 'Analytics accessible' : analyticsResult.error.message);

    // Test business metrics
    const metricsResult = await this.makeRequest('GET', '/api/admin/metrics/business', null, token);
    this.log('admin', 'Business Metrics', metricsResult.success,
      metricsResult.success ? 'Business metrics accessible' : metricsResult.error.message);
  }

  // ==================== SENIOR MANAGER TESTS ====================

  async testSeniorManagerFunctionality() {
    console.log('\n👥 Testing Senior Manager Functionality...\n');
    const token = this.tokens.seniorManager;

    if (!token) {
      this.log('seniorManager', 'Senior Manager Token Check', false, 'No senior manager token available');
      return;
    }

    // Test manager dashboard
    const dashboardResult = await this.makeRequest('GET', '/api/manager/dashboard', null, token);
    this.log('seniorManager', 'Manager Dashboard', dashboardResult.success,
      dashboardResult.success ? 'Dashboard accessible' : dashboardResult.error.message);

    // Test course creation
    const newCourse = {
      title: `Test Course ${Date.now()}`,
      description: 'A comprehensive test course for senior managers',
      level: 'B1',
      category: 'GRAMMAR',
      requiredTier: 'FREE',
      duration: 120,
      lessons: 8,
      difficulty: 3,
      tags: ['test', 'grammar', 'intermediate']
    };
    const createCourseResult = await this.makeRequest('POST', '/api/courses', newCourse, token);
    this.log('seniorManager', 'Course Creation', createCourseResult.success,
      createCourseResult.success ? 'Course created successfully' : createCourseResult.error.message);

    // Test user management access
    const usersResult = await this.makeRequest('GET', '/api/users', null, token);
    this.log('seniorManager', 'User Management Access', usersResult.success,
      usersResult.success ? `Can access ${usersResult.data.data?.users?.length || 0} users` : usersResult.error.message);

    // Test live session creation
    const newSession = {
      title: `Live Session ${Date.now()}`,
      description: 'Test live session for senior managers',
      instructor: 'Senior Manager Test',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      duration: 60,
      maxParticipants: 20,
      requiredTier: 'FREE',
      tags: ['test', 'senior-manager']
    };
    const createSessionResult = await this.makeRequest('POST', '/api/live-sessions', newSession, token);
    this.log('seniorManager', 'Live Session Creation', createSessionResult.success,
      createSessionResult.success ? 'Live session created' : createSessionResult.error.message);

    // Test analytics access
    const analyticsResult = await this.makeRequest('GET', '/api/manager/analytics', null, token);
    this.log('seniorManager', 'Manager Analytics', analyticsResult.success,
      analyticsResult.success ? 'Analytics accessible' : analyticsResult.error.message);
  }

  // ==================== JUNIOR MANAGER TESTS ====================

  async testJuniorManagerFunctionality() {
    console.log('\n📚 Testing Junior Manager Functionality...\n');
    const token = this.tokens.juniorManager;

    if (!token) {
      this.log('juniorManager', 'Junior Manager Token Check', false, 'No junior manager token available');
      return;
    }

    // Test manager dashboard
    const dashboardResult = await this.makeRequest('GET', '/api/manager/dashboard', null, token);
    this.log('juniorManager', 'Manager Dashboard', dashboardResult.success,
      dashboardResult.success ? 'Dashboard accessible' : dashboardResult.error.message);

    // Test course creation (should work)
    const newCourse = {
      title: `Junior Manager Course ${Date.now()}`,
      description: 'A test course created by junior manager',
      level: 'A1',
      category: 'VOCABULARY',
      requiredTier: 'FREE',
      duration: 90,
      lessons: 6,
      difficulty: 1,
      tags: ['test', 'vocabulary', 'beginner']
    };
    const createCourseResult = await this.makeRequest('POST', '/api/courses', newCourse, token);
    this.log('juniorManager', 'Course Creation', createCourseResult.success,
      createCourseResult.success ? 'Course created successfully' : createCourseResult.error.message);

    // Test student management
    const studentsResult = await this.makeRequest('GET', '/api/manager/students', null, token);
    this.log('juniorManager', 'Student Management', studentsResult.success,
      studentsResult.success ? 'Can access student data' : studentsResult.error.message);

    // Test admin functions (should fail)
    const adminResult = await this.makeRequest('GET', '/api/admin/users', null, token);
    this.log('juniorManager', 'Admin Access Restriction', !adminResult.success && adminResult.status === 403,
      !adminResult.success ? 'Correctly denied admin access' : 'Should not have admin access');

    // Test content management
    const contentResult = await this.makeRequest('GET', '/api/content', null, token);
    this.log('juniorManager', 'Content Management', contentResult.success,
      contentResult.success ? 'Content management accessible' : contentResult.error.message);
  }

  // ==================== STUDENT TESTS ====================

  async testStudentFunctionality() {
    console.log('\n🎓 Testing Student Functionality...\n');
    const token = this.tokens.student;

    if (!token) {
      this.log('student', 'Student Token Check', false, 'No student token available');
      return;
    }

    // Test student profile access
    const profileResult = await this.makeRequest('GET', '/api/users/profile', null, token);
    this.log('student', 'Profile Access', profileResult.success,
      profileResult.success ? 'Profile accessible' : profileResult.error.message);

    // Test dashboard access
    const dashboardResult = await this.makeRequest('GET', '/api/users/dashboard', null, token);
    this.log('student', 'Student Dashboard', dashboardResult.success,
      dashboardResult.success ? 'Dashboard accessible' : dashboardResult.error.message);

    // Test course browsing
    const coursesResult = await this.makeRequest('GET', '/api/courses', null, token);
    this.log('student', 'Course Browsing', coursesResult.success,
      coursesResult.success ? `Found ${coursesResult.data.data?.length || 0} courses` : coursesResult.error.message);

    // Test course enrollment (if courses exist)
    if (coursesResult.success && coursesResult.data.data?.length > 0) {
      const courseId = coursesResult.data.data[0].id;
      const enrollResult = await this.makeRequest('POST', `/api/courses/${courseId}/enroll`, null, token);
      this.log('student', 'Course Enrollment', enrollResult.success,
        enrollResult.success ? 'Successfully enrolled in course' : enrollResult.error.message);
    }

    // Test enrolled courses
    const enrolledResult = await this.makeRequest('GET', '/api/courses/enrolled', null, token);
    this.log('student', 'Enrolled Courses Access', enrolledResult.success,
      enrolledResult.success ? `Enrolled in ${enrolledResult.data.data?.courses?.length || 0} courses` : enrolledResult.error.message);

    // Test manager functions (should fail)
    const managerResult = await this.makeRequest('GET', '/api/manager/dashboard', null, token);
    this.log('student', 'Manager Access Restriction', !managerResult.success && managerResult.status === 403,
      !managerResult.success ? 'Correctly denied manager access' : 'Should not have manager access');

    // Test admin functions (should fail)
    const adminResult = await this.makeRequest('GET', '/api/admin/dashboard', null, token);
    this.log('student', 'Admin Access Restriction', !adminResult.success && adminResult.status === 403,
      !adminResult.success ? 'Correctly denied admin access' : 'Should not have admin access');
  }

  // ==================== MAIN TEST RUNNER ====================

  async runAllTests() {
    console.log('🧪 Starting Comprehensive Platform Tests...\n');
    console.log(`Testing server at: ${BASE_URL}\n`);

    try {
      // Step 1: Create test users
      await this.createTestUsers();

      // Step 2: Test each role
      await this.testAdminFunctionality();
      await this.testSeniorManagerFunctionality();
      await this.testJuniorManagerFunctionality();
      await this.testStudentFunctionality();

      // Step 3: Print summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
    }
  }

  printSummary() {
    console.log('\n📊 COMPREHENSIVE TEST SUMMARY\n');
    console.log('=' .repeat(50));

    let totalPassed = 0;
    let totalFailed = 0;

    Object.keys(this.testResults).forEach(role => {
      const results = this.testResults[role];
      const total = results.passed + results.failed;
      const successRate = total > 0 ? Math.round((results.passed / total) * 100) : 0;

      console.log(`\n${role.toUpperCase()}:`);
      console.log(`  ✅ Passed: ${results.passed}`);
      console.log(`  ❌ Failed: ${results.failed}`);
      console.log(`  📈 Success Rate: ${successRate}%`);

      totalPassed += results.passed;
      totalFailed += results.failed;
    });

    const overallTotal = totalPassed + totalFailed;
    const overallSuccessRate = overallTotal > 0 ? Math.round((totalPassed / overallTotal) * 100) : 0;

    console.log('\n' + '=' .repeat(50));
    console.log('OVERALL RESULTS:');
    console.log(`✅ Total Passed: ${totalPassed}`);
    console.log(`❌ Total Failed: ${totalFailed}`);
    console.log(`📈 Overall Success Rate: ${overallSuccessRate}%`);

    if (totalFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Platform is fully functional across all user roles.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the details above for specific issues.');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new PlatformTester();
  tester.runAllTests().catch(console.error);
}

module.exports = PlatformTester;
