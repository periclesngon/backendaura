# TCF/TEF Platform Comprehensive Test Suite

A complete testing framework for the TCF/TEF French Learning Platform that validates all user interactions from Admin to Student level and ensures all transactions work correctly.

## 🎯 Overview

This test suite provides comprehensive coverage of:
- **Role-Based Functionality** - Admin, Senior Manager, Junior Manager, Student
- **Transaction Processing** - Payments, Subscriptions, Course Purchases
- **Live Session Management** - Creation, Registration, Participation
- **Security & Authentication** - Access control, JWT validation
- **API Endpoints** - All 50+ endpoints with proper responses

## 📁 Test Structure

```
comprehensive-platform-tests/
├── master-test-runner.js      # Main test orchestrator
├── role-based-tests.js        # User role functionality tests
├── transaction-tests.js       # Payment & transaction tests
├── live-session-tests.js      # Live session functionality tests
├── quick-smoke-tests.js       # Fast basic functionality tests
├── package.json               # Test dependencies & scripts
└── README.md                  # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- TCF/TEF backend server running on `http://localhost:3001`
- Database connected and accessible

### Installation
```bash
cd test-components/comprehensive-platform-tests
npm install
```

### Run All Tests
```bash
npm test
# or
npm run test:all
```

## 🧪 Available Test Commands

### Main Test Suites
```bash
npm run test                    # Run all comprehensive tests
npm run test:roles             # Test all user roles functionality
npm run test:transactions      # Test payment & transaction flows
npm run test:live-sessions     # Test live session features
```

### Quick Tests
```bash
npm run test:quick             # Fast smoke tests (< 30 seconds)
npm run test:verbose           # Detailed logging output
```

### Specific Role Tests
```bash
npm run test:admin             # Admin functionality only
npm run test:manager           # Manager functionality only
npm run test:student           # Student functionality only
```

### Specialized Tests
```bash
npm run test:payments          # Payment processing only
npm run test:security          # Security & authentication
npm run test:performance       # Performance benchmarks
```

### Reporting
```bash
npm run test:report            # Generate test report file
```

## 📊 Test Coverage

### Role-Based Tests (role-based-tests.js)
Tests functionality for each user role:

#### 👑 **Admin Tests**
- Dashboard access and system health monitoring
- User management and role assignments
- Manager creation and performance analytics
- Business metrics and technical metrics access
- Data export and comprehensive reporting

#### 👥 **Senior Manager Tests**
- Manager dashboard and analytics access
- Course creation and management
- Live session creation and scheduling
- User management capabilities
- Advanced reporting features

#### 📚 **Junior Manager Tests**
- Limited manager dashboard access
- Course creation (restricted scope)
- Student progress monitoring
- Content management access
- Proper access restrictions (no admin functions)

#### 🎓 **Student Tests**
- Profile management and dashboard access
- Course browsing and enrollment
- Progress tracking and learning materials
- Live session participation
- Proper access restrictions (no management functions)

### Transaction Tests (transaction-tests.js)
Validates all payment and transaction flows:

#### 💳 **Payment Processing**
- Payment intent creation for courses
- Stripe integration and webhook handling
- Payment confirmation and verification
- Payment history and transaction records

#### 🛒 **Course Purchase Flow**
- Course selection and pricing
- Payment processing for course access
- Post-payment enrollment verification
- Access control after purchase

#### 📅 **Subscription Management**
- Subscription creation (Basic, Premium)
- Subscription upgrades and downgrades
- Billing cycle management
- Subscription status tracking

#### 🔒 **Transaction Security**
- Authentication requirements for payments
- Authorization checks for transactions
- Secure webhook endpoint handling
- Payment data protection

### Live Session Tests (live-session-tests.js)
Comprehensive live session functionality:

#### 📹 **Session Management**
- Live session creation by managers
- Session scheduling and configuration
- Session updates and modifications
- Session deletion and cleanup

#### ✋ **Registration & Participation**
- Student registration for sessions
- Registration verification and tracking
- Session join/leave functionality
- Participant management

#### 🔍 **Session Discovery**
- Public session listing
- Upcoming sessions display
- Session details and information
- Authenticated vs. public access

#### 🔒 **Session Security**
- Manager-only session creation
- Student access restrictions
- Authentication requirements
- Proper role-based permissions

## 📈 Test Results & Reporting

### Success Criteria
- **Excellent (90%+)**: Production-ready, all major functionality working
- **Good (75-89%)**: Mostly functional, minor issues need attention
- **Fair (50-74%)**: Significant issues, requires substantial fixes
- **Poor (<50%)**: Major work needed, not ready for deployment

### Sample Output
```
🏆 COMPREHENSIVE PLATFORM TEST RESULTS
============================================================

📊 OVERALL STATISTICS:
   ⏱️  Total Duration: 45 seconds
   ✅ Total Passed: 28
   ❌ Total Failed: 2
   📈 Overall Success Rate: 93%

🎭 ROLE-BASED TEST BREAKDOWN:
   ADMIN           ✅  8 ❌  0 (100%)
   SENIORMANAGER   ✅  7 ❌  1 (87%)
   JUNIORMANAGER   ✅  6 ❌  0 (100%)
   STUDENT         ✅  5 ❌  1 (83%)

💰 TRANSACTION TEST BREAKDOWN:
   PAYMENTS        ✅  2 ❌  0 (100%)

🎯 PLATFORM READINESS ASSESSMENT:
   🟢 EXCELLENT - Platform is production-ready
   ✨ All major functionality is working correctly
   🚀 Ready for user deployment and scaling
```

## 🔧 Configuration

### Environment Variables
The tests automatically detect the server URL. Default: `http://localhost:3001`

To use a different server:
```bash
export TEST_SERVER_URL=http://your-server:port
npm test
```

### Test Data
Tests create temporary users with timestamps to avoid conflicts:
- `admin-test-{timestamp}@example.com`
- `manager-test-{timestamp}@example.com`
- `student-test-{timestamp}@example.com`

## 🐛 Troubleshooting

### Common Issues

#### Server Not Running
```
❌ Health Check: Server health check failed
```
**Solution**: Ensure the backend server is running on port 3001

#### Database Connection Issues
```
❌ Database Connection: Database may not be connected
```
**Solution**: Check database connection and run migrations

#### Authentication Failures
```
❌ User Registration: Registration failed
```
**Solution**: Check password requirements and validation rules

#### Permission Errors
```
❌ Admin Access Restriction: Should not have admin access
```
**Solution**: Verify role-based access control implementation

### Debug Mode
Run tests with detailed logging:
```bash
DEBUG=* npm run test:verbose
```

## 📝 Adding New Tests

### Creating a New Test File
```javascript
const axios = require('axios');
const BASE_URL = 'http://localhost:3001';

class YourTestClass {
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
    // Implementation similar to existing test files
  }

  async runYourTests() {
    // Your test implementation
  }
}
```

### Integration with Master Runner
Add your test class to `master-test-runner.js`:
```javascript
const YourTestClass = require('./your-test-file');

// In runAllTests method:
const yourTester = new YourTestClass();
await yourTester.runYourTests();
```

## 🤝 Contributing

1. Follow the existing test structure and naming conventions
2. Include both positive and negative test cases
3. Test authentication and authorization properly
4. Add meaningful error messages and logging
5. Update this README when adding new test categories

## 📄 License

This test suite is part of the TCF/TEF Learning Platform project.

---

**Happy Testing! 🧪✨**
