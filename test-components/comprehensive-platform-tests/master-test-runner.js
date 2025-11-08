/**
 * Master Test Runner
 * Executes all comprehensive platform tests
 */

const PlatformTester = require('./role-based-tests');
const TransactionTester = require('./transaction-tests');
const LiveSessionTester = require('./live-session-tests');

class MasterTestRunner {
  constructor() {
    this.overallResults = {
      roleBasedTests: null,
      transactionTests: null,
      liveSessionTests: null,
      totalPassed: 0,
      totalFailed: 0,
      overallSuccessRate: 0
    };
  }

  async runAllTests() {
    console.log('🚀 STARTING COMPREHENSIVE PLATFORM TESTING SUITE');
    console.log('=' .repeat(60));
    console.log('Testing all aspects of the TCF/TEF Learning Platform');
    console.log('From Admin to Student interactions and all transactions');
    console.log('=' .repeat(60));
    console.log('\n');

    const startTime = Date.now();

    try {
      // ==================== ROLE-BASED TESTS ====================
      console.log('🎭 PHASE 1: ROLE-BASED FUNCTIONALITY TESTS');
      console.log('-' .repeat(50));
      
      const platformTester = new PlatformTester();
      await platformTester.runAllTests();
      
      this.overallResults.roleBasedTests = {
        admin: platformTester.testResults.admin,
        seniorManager: platformTester.testResults.seniorManager,
        juniorManager: platformTester.testResults.juniorManager,
        student: platformTester.testResults.student
      };

      // ==================== TRANSACTION TESTS ====================
      console.log('\n\n💰 PHASE 2: TRANSACTION & PAYMENT TESTS');
      console.log('-' .repeat(50));
      
      const transactionTester = new TransactionTester();
      await transactionTester.runAllTransactionTests();
      
      this.overallResults.transactionTests = transactionTester.testResults;

      // ==================== LIVE SESSION TESTS ====================
      console.log('\n\n📹 PHASE 3: LIVE SESSION FUNCTIONALITY TESTS');
      console.log('-' .repeat(50));
      
      const liveSessionTester = new LiveSessionTester();
      await liveSessionTester.runAllLiveSessionTests();
      
      this.overallResults.liveSessionTests = liveSessionTester.testResults;

      // ==================== CALCULATE OVERALL RESULTS ====================
      this.calculateOverallResults();

      // ==================== PRINT COMPREHENSIVE SUMMARY ====================
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      this.printComprehensiveSummary(duration);

    } catch (error) {
      console.error('❌ Master test execution failed:', error.message);
      console.error(error.stack);
    }
  }

  calculateOverallResults() {
    // Role-based tests
    if (this.overallResults.roleBasedTests) {
      Object.values(this.overallResults.roleBasedTests).forEach(roleResult => {
        this.overallResults.totalPassed += roleResult.passed;
        this.overallResults.totalFailed += roleResult.failed;
      });
    }

    // Transaction tests
    if (this.overallResults.transactionTests) {
      this.overallResults.totalPassed += this.overallResults.transactionTests.passed;
      this.overallResults.totalFailed += this.overallResults.transactionTests.failed;
    }

    // Live session tests
    if (this.overallResults.liveSessionTests) {
      this.overallResults.totalPassed += this.overallResults.liveSessionTests.passed;
      this.overallResults.totalFailed += this.overallResults.liveSessionTests.failed;
    }

    // Calculate success rate
    const total = this.overallResults.totalPassed + this.overallResults.totalFailed;
    this.overallResults.overallSuccessRate = total > 0 ? Math.round((this.overallResults.totalPassed / total) * 100) : 0;
  }

  printComprehensiveSummary(duration) {
    console.log('\n\n🏆 COMPREHENSIVE PLATFORM TEST RESULTS');
    console.log('=' .repeat(60));
    
    // Overall statistics
    console.log(`\n📊 OVERALL STATISTICS:`);
    console.log(`   ⏱️  Total Duration: ${duration} seconds`);
    console.log(`   ✅ Total Passed: ${this.overallResults.totalPassed}`);
    console.log(`   ❌ Total Failed: ${this.overallResults.totalFailed}`);
    console.log(`   📈 Overall Success Rate: ${this.overallResults.overallSuccessRate}%`);

    // Role-based test breakdown
    if (this.overallResults.roleBasedTests) {
      console.log(`\n🎭 ROLE-BASED TEST BREAKDOWN:`);
      
      Object.entries(this.overallResults.roleBasedTests).forEach(([role, results]) => {
        const total = results.passed + results.failed;
        const rate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
        console.log(`   ${role.toUpperCase().padEnd(15)} ✅ ${results.passed.toString().padStart(2)} ❌ ${results.failed.toString().padStart(2)} (${rate}%)`);
      });
    }

    // Transaction test breakdown
    if (this.overallResults.transactionTests) {
      const transactionTotal = this.overallResults.transactionTests.passed + this.overallResults.transactionTests.failed;
      const transactionRate = transactionTotal > 0 ? Math.round((this.overallResults.transactionTests.passed / transactionTotal) * 100) : 0;
      
      console.log(`\n💰 TRANSACTION TEST BREAKDOWN:`);
      console.log(`   PAYMENTS        ✅ ${this.overallResults.transactionTests.passed.toString().padStart(2)} ❌ ${this.overallResults.transactionTests.failed.toString().padStart(2)} (${transactionRate}%)`);
    }

    // Live session test breakdown
    if (this.overallResults.liveSessionTests) {
      const sessionTotal = this.overallResults.liveSessionTests.passed + this.overallResults.liveSessionTests.failed;
      const sessionRate = sessionTotal > 0 ? Math.round((this.overallResults.liveSessionTests.passed / sessionTotal) * 100) : 0;
      
      console.log(`\n📹 LIVE SESSION TEST BREAKDOWN:`);
      console.log(`   LIVE SESSIONS   ✅ ${this.overallResults.liveSessionTests.passed.toString().padStart(2)} ❌ ${this.overallResults.liveSessionTests.failed.toString().padStart(2)} (${sessionRate}%)`);
    }

    // Platform readiness assessment
    console.log(`\n🎯 PLATFORM READINESS ASSESSMENT:`);
    
    if (this.overallResults.overallSuccessRate >= 90) {
      console.log('   🟢 EXCELLENT - Platform is production-ready');
      console.log('   ✨ All major functionality is working correctly');
      console.log('   🚀 Ready for user deployment and scaling');
    } else if (this.overallResults.overallSuccessRate >= 75) {
      console.log('   🟡 GOOD - Platform is mostly functional');
      console.log('   ⚠️  Some minor issues need attention');
      console.log('   🔧 Recommended to fix failing tests before production');
    } else if (this.overallResults.overallSuccessRate >= 50) {
      console.log('   🟠 FAIR - Platform has significant issues');
      console.log('   🚨 Multiple critical features are not working');
      console.log('   🛠️  Requires substantial fixes before deployment');
    } else {
      console.log('   🔴 POOR - Platform needs major work');
      console.log('   💥 Critical functionality is broken');
      console.log('   🚧 Not ready for any deployment');
    }

    // Feature completeness
    console.log(`\n📋 FEATURE COMPLETENESS:`);
    console.log('   👑 Admin Panel: ' + (this.getFeatureStatus('admin')));
    console.log('   👥 Manager Tools: ' + (this.getFeatureStatus('seniorManager') && this.getFeatureStatus('juniorManager')));
    console.log('   🎓 Student Experience: ' + (this.getFeatureStatus('student')));
    console.log('   💳 Payment System: ' + (this.getTransactionStatus()));
    console.log('   📹 Live Sessions: ' + (this.getLiveSessionStatus()));

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    
    if (this.overallResults.totalFailed === 0) {
      console.log('   🎉 Congratulations! All tests passed.');
      console.log('   📈 Consider adding more edge case tests');
      console.log('   🔍 Implement monitoring and alerting');
      console.log('   📊 Set up performance testing');
    } else {
      console.log('   🔧 Fix failing tests before production deployment');
      console.log('   📝 Review error logs for specific issues');
      console.log('   🧪 Add more comprehensive test coverage');
      console.log('   🔄 Run tests regularly during development');
    }

    console.log('\n' + '=' .repeat(60));
    
    if (this.overallResults.totalFailed === 0) {
      console.log('🎊 ALL TESTS PASSED! TCF/TEF PLATFORM IS FULLY FUNCTIONAL! 🎊');
    } else {
      console.log(`⚠️  ${this.overallResults.totalFailed} TEST(S) FAILED - REVIEW REQUIRED`);
    }
    
    console.log('=' .repeat(60));
  }

  getFeatureStatus(role) {
    if (!this.overallResults.roleBasedTests || !this.overallResults.roleBasedTests[role]) {
      return '❓ Not Tested';
    }
    
    const results = this.overallResults.roleBasedTests[role];
    const total = results.passed + results.failed;
    const rate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
    
    if (rate >= 90) return '✅ Excellent';
    if (rate >= 75) return '🟡 Good';
    if (rate >= 50) return '🟠 Fair';
    return '❌ Poor';
  }

  getTransactionStatus() {
    if (!this.overallResults.transactionTests) {
      return '❓ Not Tested';
    }
    
    const results = this.overallResults.transactionTests;
    const total = results.passed + results.failed;
    const rate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
    
    if (rate >= 90) return '✅ Excellent';
    if (rate >= 75) return '🟡 Good';
    if (rate >= 50) return '🟠 Fair';
    return '❌ Poor';
  }

  getLiveSessionStatus() {
    if (!this.overallResults.liveSessionTests) {
      return '❓ Not Tested';
    }
    
    const results = this.overallResults.liveSessionTests;
    const total = results.passed + results.failed;
    const rate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
    
    if (rate >= 90) return '✅ Excellent';
    if (rate >= 75) return '🟡 Good';
    if (rate >= 50) return '🟠 Fair';
    return '❌ Poor';
  }
}

// Run all tests if this file is executed directly
if (require.main === module) {
  const masterRunner = new MasterTestRunner();
  masterRunner.runAllTests().catch(console.error);
}

module.exports = MasterTestRunner;
