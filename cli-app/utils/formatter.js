import chalk from 'chalk';
import { table } from 'table';
import moment from 'moment';

export class TableFormatter {
  static displayProfile(profile) {
    console.log(chalk.blue('\n👤 User Profile'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const data = [
      ['Name', `${profile.firstName} ${profile.lastName}`],
      ['Email', profile.email],
      ['Role', this.formatRole(profile.role)],
      ['Subscription', this.formatSubscription(profile.subscriptionTier)],
      ['Country', profile.country || 'Not specified'],
      ['Member Since', moment(profile.createdAt).format('MMMM Do, YYYY')],
      ['Last Login', profile.lastLoginAt ? moment(profile.lastLoginAt).fromNow() : 'Never']
    ];

    const config = {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│'
      },
      columns: {
        0: { width: 15, alignment: 'right' },
        1: { width: 30, alignment: 'left' }
      }
    };

    console.log(table(data, config));
  }

  static displayDashboard(dashboard) {
    console.log(chalk.blue('\n📊 Dashboard'));
    console.log(chalk.gray('─'.repeat(50)));

    // Stats overview
    if (dashboard.stats) {
      const statsData = [
        ['📚 Enrolled Courses', dashboard.stats.enrolledCourses || 0],
        ['✅ Completed Courses', dashboard.stats.completedCourses || 0],
        ['📈 Tests Taken', dashboard.stats.testsTaken || 0],
        ['🏆 Certificates', dashboard.stats.certificates || 0],
        ['⏱️  Study Hours', dashboard.stats.studyHours || 0]
      ];

      console.log(table(statsData, this.getDefaultTableConfig()));
    }

    // Recent activity
    if (dashboard.recentActivity && dashboard.recentActivity.length > 0) {
      console.log(chalk.blue('\n📋 Recent Activity'));
      const activityData = [
        ['Type', 'Description', 'Date']
      ];

      dashboard.recentActivity.forEach(activity => {
        activityData.push([
          this.formatActivityType(activity.type),
          activity.description,
          moment(activity.createdAt).fromNow()
        ]);
      });

      console.log(table(activityData, this.getDefaultTableConfig()));
    }
  }

  static displayCourses(courses) {
    console.log(chalk.blue('\n📚 Available Courses'));
    console.log(chalk.gray('─'.repeat(80)));

    if (!courses || courses.length === 0) {
      console.log(chalk.yellow('No courses available.'));
      return;
    }

    const data = [
      ['ID', 'Title', 'Level', 'Category', 'Duration', 'Lessons', 'Tier']
    ];

    courses.forEach(course => {
      data.push([
        course.id.substring(0, 8) + '...',
        course.title.substring(0, 30) + (course.title.length > 30 ? '...' : ''),
        this.formatLevel(course.level),
        this.formatCategory(course.category),
        `${course.duration}h`,
        course.lessons || 'N/A',
        this.formatTier(course.requiredTier)
      ]);
    });

    console.log(table(data, this.getWideTableConfig()));
  }

  static displayEnrolledCourses(courses) {
    console.log(chalk.blue('\n🎓 My Enrolled Courses'));
    console.log(chalk.gray('─'.repeat(80)));

    if (!courses || courses.length === 0) {
      console.log(chalk.yellow('You are not enrolled in any courses yet.'));
      return;
    }

    const data = [
      ['Course', 'Progress', 'Status', 'Enrolled', 'Last Activity']
    ];

    courses.forEach(enrollment => {
      const course = enrollment.course || enrollment;
      data.push([
        course.title?.substring(0, 25) + (course.title?.length > 25 ? '...' : ''),
        `${enrollment.progress || 0}%`,
        this.formatEnrollmentStatus(enrollment.status),
        moment(enrollment.enrolledAt || enrollment.createdAt).format('MMM DD'),
        enrollment.lastAccessedAt ? moment(enrollment.lastAccessedAt).fromNow() : 'Never'
      ]);
    });

    console.log(table(data, this.getWideTableConfig()));
  }

  static displayTests(tests) {
    console.log(chalk.blue('\n📝 Available Tests'));
    console.log(chalk.gray('─'.repeat(70)));

    if (!tests || tests.length === 0) {
      console.log(chalk.yellow('No tests available.'));
      return;
    }

    const data = [
      ['Test Type', 'Level', 'Duration', 'Questions', 'Status']
    ];

    tests.forEach(test => {
      data.push([
        test.type,
        this.formatLevel(test.level),
        `${test.duration} min`,
        test.questionCount || 'N/A',
        test.available ? chalk.green('Available') : chalk.red('Locked')
      ]);
    });

    console.log(table(data, this.getDefaultTableConfig()));
  }

  static displayTestResults(results) {
    console.log(chalk.blue('\n📊 Test Results'));
    console.log(chalk.gray('─'.repeat(70)));

    if (!results || results.length === 0) {
      console.log(chalk.yellow('No test results found.'));
      return;
    }

    const data = [
      ['Test', 'Score', 'Level', 'Date', 'Status']
    ];

    results.forEach(result => {
      data.push([
        result.testType,
        `${result.score}/${result.maxScore}`,
        this.formatLevel(result.level),
        moment(result.completedAt).format('MMM DD, YYYY'),
        this.formatTestStatus(result.status)
      ]);
    });

    console.log(table(data, this.getDefaultTableConfig()));
  }

  static displayLiveSessions(sessions) {
    console.log(chalk.blue('\n🎥 Live Sessions'));
    console.log(chalk.gray('─'.repeat(80)));

    if (!sessions || sessions.length === 0) {
      console.log(chalk.yellow('No live sessions found.'));
      return;
    }

    const data = [
      ['Title', 'Instructor', 'Date', 'Duration', 'Status', 'Participants']
    ];

    sessions.forEach(session => {
      data.push([
        session.title.substring(0, 20) + (session.title.length > 20 ? '...' : ''),
        session.instructor || 'TBD',
        moment(session.date).format('MMM DD, HH:mm'),
        `${session.duration}min`,
        this.formatSessionStatus(session.status),
        `${session.participantCount || 0}/${session.maxParticipants || '∞'}`
      ]);
    });

    console.log(table(data, this.getWideTableConfig()));
  }

  static displaySubscription(subscription) {
    console.log(chalk.blue('\n💳 Subscription Status'));
    console.log(chalk.gray('─'.repeat(50)));

    if (!subscription) {
      console.log(chalk.yellow('No subscription information available.'));
      return;
    }

    const data = [
      ['Plan', this.formatSubscription(subscription.tier)],
      ['Status', this.formatSubscriptionStatus(subscription.status)],
      ['Billing Cycle', subscription.billingCycle || 'N/A'],
      ['Next Billing', subscription.nextBillingDate ? moment(subscription.nextBillingDate).format('MMMM Do, YYYY') : 'N/A'],
      ['Started', moment(subscription.createdAt).format('MMMM Do, YYYY')]
    ];

    console.log(table(data, this.getDefaultTableConfig()));
  }

  static displayAdminDashboard(dashboard) {
    console.log(chalk.blue('\n👑 Admin Dashboard'));
    console.log(chalk.gray('─'.repeat(60)));

    if (dashboard.stats) {
      const data = [
        ['👥 Total Users', dashboard.stats.totalUsers || 0],
        ['📚 Total Courses', dashboard.stats.totalCourses || 0],
        ['🎓 Active Enrollments', dashboard.stats.activeEnrollments || 0],
        ['💰 Monthly Revenue', `$${dashboard.stats.monthlyRevenue || 0}`],
        ['🎥 Live Sessions', dashboard.stats.liveSessions || 0]
      ];

      console.log(table(data, this.getDefaultTableConfig()));
    }
  }

  static displayUsers(users) {
    console.log(chalk.blue('\n👥 Users'));
    console.log(chalk.gray('─'.repeat(80)));

    if (!users || users.length === 0) {
      console.log(chalk.yellow('No users found.'));
      return;
    }

    const data = [
      ['Name', 'Email', 'Role', 'Subscription', 'Joined', 'Status']
    ];

    users.forEach(user => {
      data.push([
        `${user.firstName} ${user.lastName}`,
        user.email,
        this.formatRole(user.role),
        this.formatSubscription(user.subscriptionTier),
        moment(user.createdAt).format('MMM DD'),
        user.isActive ? chalk.green('Active') : chalk.red('Inactive')
      ]);
    });

    console.log(table(data, this.getWideTableConfig()));
  }

  static displaySystemHealth(health) {
    console.log(chalk.blue('\n⚡ System Health'));
    console.log(chalk.gray('─'.repeat(50)));

    const data = [
      ['Database', health.database ? chalk.green('✅ Connected') : chalk.red('❌ Disconnected')],
      ['Redis', health.redis ? chalk.green('✅ Connected') : chalk.red('❌ Disconnected')],
      ['API Status', health.api ? chalk.green('✅ Healthy') : chalk.red('❌ Unhealthy')],
      ['Uptime', health.uptime || 'Unknown'],
      ['Memory Usage', health.memoryUsage || 'Unknown'],
      ['CPU Usage', health.cpuUsage || 'Unknown']
    ];

    console.log(table(data, this.getDefaultTableConfig()));
  }

  // Formatting helpers
  static formatRole(role) {
    const roleColors = {
      'STUDENT': chalk.blue('👨‍🎓 Student'),
      'JUNIOR_MANAGER': chalk.yellow('👨‍💼 Junior Manager'),
      'SENIOR_MANAGER': chalk.magenta('👨‍💼 Senior Manager'),
      'ADMIN': chalk.red('👑 Admin')
    };
    return roleColors[role] || role;
  }

  static formatSubscription(tier) {
    const tierColors = {
      'FREE': chalk.gray('🆓 Free'),
      'ESSENTIAL': chalk.blue('⭐ Essential'),
      'PREMIUM': chalk.yellow('💎 Premium'),
      'PRO': chalk.red('🚀 Pro')
    };
    return tierColors[tier] || tier;
  }

  static formatLevel(level) {
    const levelColors = {
      'A1': chalk.green('A1'),
      'A2': chalk.green('A2'),
      'B1': chalk.yellow('B1'),
      'B2': chalk.yellow('B2'),
      'C1': chalk.red('C1'),
      'C2': chalk.red('C2')
    };
    return levelColors[level] || level;
  }

  static formatCategory(category) {
    const categoryIcons = {
      'GRAMMAR': '📝 Grammar',
      'LISTENING': '👂 Listening',
      'READING': '📖 Reading',
      'VOCABULARY': '📚 Vocabulary',
      'WRITING': '✍️ Writing',
      'ORAL': '🗣️ Oral',
      'TCF_TEF': '🎯 TCF/TEF'
    };
    return categoryIcons[category] || category;
  }

  static formatTier(tier) {
    return this.formatSubscription(tier);
  }

  static formatActivityType(type) {
    const typeIcons = {
      'ENROLLMENT': '📚',
      'COMPLETION': '✅',
      'TEST': '📝',
      'CERTIFICATE': '🏆',
      'LOGIN': '🔐'
    };
    return typeIcons[type] || '📋';
  }

  static formatEnrollmentStatus(status) {
    const statusColors = {
      'ACTIVE': chalk.green('✅ Active'),
      'COMPLETED': chalk.blue('🎓 Completed'),
      'PAUSED': chalk.yellow('⏸️ Paused'),
      'CANCELLED': chalk.red('❌ Cancelled')
    };
    return statusColors[status] || status;
  }

  static formatTestStatus(status) {
    const statusColors = {
      'PASSED': chalk.green('✅ Passed'),
      'FAILED': chalk.red('❌ Failed'),
      'IN_PROGRESS': chalk.yellow('⏳ In Progress'),
      'PENDING': chalk.gray('⏸️ Pending')
    };
    return statusColors[status] || status;
  }

  static formatSessionStatus(status) {
    const statusColors = {
      'SCHEDULED': chalk.blue('📅 Scheduled'),
      'LIVE': chalk.green('🔴 Live'),
      'COMPLETED': chalk.gray('✅ Completed'),
      'CANCELLED': chalk.red('❌ Cancelled')
    };
    return statusColors[status] || status;
  }

  static formatSubscriptionStatus(status) {
    const statusColors = {
      'ACTIVE': chalk.green('✅ Active'),
      'CANCELLED': chalk.red('❌ Cancelled'),
      'EXPIRED': chalk.yellow('⏰ Expired'),
      'PENDING': chalk.blue('⏳ Pending')
    };
    return statusColors[status] || status;
  }

  // Table configuration helpers
  static getDefaultTableConfig() {
    return {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│'
      }
    };
  }

  static getWideTableConfig() {
    return {
      ...this.getDefaultTableConfig(),
      columnDefault: {
        width: 12,
        wrapWord: true
      }
    };
  }
}
