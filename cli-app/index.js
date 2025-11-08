#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from './services/authService.js';
import { CourseService } from './services/courseService.js';
import { UserService } from './services/userService.js';
import { AdminService } from './services/adminService.js';
import { ManagerService } from './services/managerService.js';
import { PaymentService } from './services/paymentService.js';
import { TestService } from './services/testService.js';
import { LiveSessionService } from './services/liveSessionService.js';
import { AIChatService } from './services/aiChatService.js';
import { ConfigManager } from './utils/config.js';
import { TableFormatter } from './utils/formatter.js';
import * as MenuHelpers from './utils/menuHelpers.js';

const program = new Command();

// Initialize configuration
ConfigManager.init();

// Display banner
console.log(
  chalk.cyan(
    figlet.textSync('TCF/TEF CLI', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    })
  )
);

console.log(chalk.yellow('🎓 Welcome to TCF/TEF Learning Platform CLI'));
console.log(chalk.gray('Version 1.0.0 - Command Line Interface\n'));

// Program configuration
program
  .name('tcf-cli')
  .description('CLI for TCF/TEF Learning Platform')
  .version('1.0.0');

// Authentication Commands
program
  .command('login')
  .description('Login to your account')
  .option('-e, --email <email>', 'Email address')
  .option('-p, --password <password>', 'Password')
  .action(async (options) => {
    try {
      let { email, password } = options;
      
      if (!email || !password) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'email',
            message: 'Enter your email:',
            when: !email,
            validate: (input) => input.includes('@') || 'Please enter a valid email'
          },
          {
            type: 'password',
            name: 'password',
            message: 'Enter your password:',
            when: !password,
            mask: '*'
          }
        ]);
        email = email || answers.email;
        password = password || answers.password;
      }

      const spinner = ora('Logging in...').start();
      const result = await AuthService.login(email, password);
      spinner.succeed(chalk.green('✅ Login successful!'));
      
      console.log(chalk.blue(`Welcome back, ${result.user.firstName} ${result.user.lastName}!`));
      console.log(chalk.gray(`Role: ${result.user.role}`));
      console.log(chalk.gray(`Subscription: ${result.user.subscriptionTier}`));
      
    } catch (error) {
      ora().fail(chalk.red(`❌ Login failed: ${error.message}`));
    }
  });

program
  .command('register')
  .description('Register a new account')
  .action(async () => {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'firstName',
          message: 'First Name:',
          validate: (input) => input.length > 0 || 'First name is required'
        },
        {
          type: 'input',
          name: 'lastName',
          message: 'Last Name:',
          validate: (input) => input.length > 0 || 'Last name is required'
        },
        {
          type: 'input',
          name: 'email',
          message: 'Email:',
          validate: (input) => input.includes('@') || 'Please enter a valid email'
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
          validate: (input) => input.length >= 8 || 'Password must be at least 8 characters'
        },
        {
          type: 'input',
          name: 'country',
          message: 'Country:',
          default: 'France'
        }
      ]);

      const spinner = ora('Creating account...').start();
      const result = await AuthService.register(answers);
      spinner.succeed(chalk.green('✅ Registration successful!'));
      
      console.log(chalk.blue(`Welcome, ${result.user.firstName}!`));
      console.log(chalk.gray('You can now login with your credentials.'));
      
    } catch (error) {
      ora().fail(chalk.red(`❌ Registration failed: ${error.message}`));
    }
  });

program
  .command('logout')
  .description('Logout from your account')
  .action(async () => {
    try {
      await AuthService.logout();
      console.log(chalk.green('✅ Logged out successfully!'));
    } catch (error) {
      console.log(chalk.red(`❌ Logout failed: ${error.message}`));
    }
  });

// User Commands
program
  .command('profile')
  .description('View your profile')
  .action(async () => {
    try {
      const spinner = ora('Loading profile...').start();
      const profile = await UserService.getProfile();
      spinner.stop();
      
      TableFormatter.displayProfile(profile);
    } catch (error) {
      ora().fail(chalk.red(`❌ Failed to load profile: ${error.message}`));
    }
  });

program
  .command('dashboard')
  .description('View your dashboard')
  .action(async () => {
    try {
      const spinner = ora('Loading dashboard...').start();
      const dashboard = await UserService.getDashboard();
      spinner.stop();
      
      TableFormatter.displayDashboard(dashboard);
    } catch (error) {
      ora().fail(chalk.red(`❌ Failed to load dashboard: ${error.message}`));
    }
  });

// Course Commands
program
  .command('courses')
  .description('List available courses')
  .option('-l, --level <level>', 'Filter by level (A1, A2, B1, B2, C1, C2)')
  .option('-c, --category <category>', 'Filter by category')
  .option('-p, --page <page>', 'Page number', '1')
  .action(async (options) => {
    try {
      const spinner = ora('Loading courses...').start();
      const courses = await CourseService.getCourses(options);
      spinner.stop();
      
      TableFormatter.displayCourses(courses);
    } catch (error) {
      ora().fail(chalk.red(`❌ Failed to load courses: ${error.message}`));
    }
  });

program
  .command('enroll <courseId>')
  .description('Enroll in a course')
  .action(async (courseId) => {
    try {
      const spinner = ora('Enrolling in course...').start();
      await CourseService.enrollInCourse(courseId);
      spinner.succeed(chalk.green('✅ Successfully enrolled in course!'));
    } catch (error) {
      ora().fail(chalk.red(`❌ Enrollment failed: ${error.message}`));
    }
  });

program
  .command('my-courses')
  .description('View your enrolled courses')
  .action(async () => {
    try {
      const spinner = ora('Loading your courses...').start();
      const courses = await CourseService.getEnrolledCourses();
      spinner.stop();
      
      TableFormatter.displayEnrolledCourses(courses);
    } catch (error) {
      ora().fail(chalk.red(`❌ Failed to load courses: ${error.message}`));
    }
  });

// Main Application Mode
program
  .command('app')
  .alias('start')
  .description('Start the TCF/TEF Learning Platform Application')
  .action(async () => {
    await startMainApplication();
  });

// Interactive Mode (Legacy)
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    await startMainApplication();
  });

// Handle interactive actions
async function handleInteractiveAction(action) {
  switch (action) {
    case 'profile':
      const profile = await UserService.getProfile();
      TableFormatter.displayProfile(profile);
      break;
      
    case 'dashboard':
      const dashboard = await UserService.getDashboard();
      TableFormatter.displayDashboard(dashboard);
      break;
      
    case 'courses':
      const courses = await CourseService.getCourses({});
      TableFormatter.displayCourses(courses);
      break;
      
    case 'my-courses':
      const enrolledCourses = await CourseService.getEnrolledCourses();
      TableFormatter.displayEnrolledCourses(enrolledCourses);
      break;
      
    case 'subscription':
      const subscription = await PaymentService.getSubscription();
      TableFormatter.displaySubscription(subscription);
      break;
      
    case 'test':
      await handleTestMenu();
      break;
      
    case 'live-sessions':
      await handleLiveSessionMenu();
      break;
      
    case 'admin':
      await handleAdminMenu();
      break;
      
    case 'manager':
      await handleManagerMenu();
      break;
  }
}

async function handleTestMenu() {
  const { testAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'testAction',
      message: 'Test Options:',
      choices: [
        { name: '📝 Available Tests', value: 'list' },
        { name: '🎯 Start TCF Test', value: 'tcf' },
        { name: '🎯 Start TEF Test', value: 'tef' },
        { name: '📊 Test Results', value: 'results' }
      ]
    }
  ]);

  switch (testAction) {
    case 'list':
      const tests = await TestService.getAvailableTests();
      TableFormatter.displayTests(tests);
      break;
    case 'tcf':
      await TestService.startTCFTest();
      break;
    case 'tef':
      await TestService.startTEFTest();
      break;
    case 'results':
      const results = await TestService.getTestResults();
      TableFormatter.displayTestResults(results);
      break;
  }
}

async function handleLiveSessionMenu() {
  const { sessionAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'sessionAction',
      message: 'Live Session Options:',
      choices: [
        { name: '📅 Upcoming Sessions', value: 'upcoming' },
        { name: '✅ My Registered Sessions', value: 'registered' },
        { name: '🎥 Join Session', value: 'join' },
        { name: '📝 Register for Session', value: 'register' }
      ]
    }
  ]);

  switch (sessionAction) {
    case 'upcoming':
      const upcoming = await LiveSessionService.getUpcomingSessions();
      TableFormatter.displayLiveSessions(upcoming);
      break;
    case 'registered':
      const registered = await LiveSessionService.getRegisteredSessions();
      TableFormatter.displayLiveSessions(registered);
      break;
    case 'join':
      await LiveSessionService.joinSession();
      break;
    case 'register':
      await LiveSessionService.registerForSession();
      break;
  }
}

async function handleAdminMenu() {
  try {
    const { adminAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'adminAction',
        message: 'Admin Panel:',
        choices: [
          { name: '📊 System Dashboard', value: 'dashboard' },
          { name: '👥 Manage Users', value: 'users' },
          { name: '📚 Manage Courses', value: 'courses' },
          { name: '👨‍💼 Manage Managers', value: 'managers' },
          { name: '📈 Analytics', value: 'analytics' },
          { name: '⚡ System Health', value: 'health' }
        ]
      }
    ]);

    switch (adminAction) {
      case 'dashboard':
        const dashboard = await AdminService.getDashboard();
        TableFormatter.displayAdminDashboard(dashboard);
        break;
      case 'users':
        const users = await AdminService.getUsers();
        TableFormatter.displayUsers(users);
        break;
      case 'courses':
        const courses = await AdminService.getCourses();
        TableFormatter.displayAdminCourses(courses);
        break;
      case 'managers':
        const managers = await AdminService.getManagers();
        TableFormatter.displayManagers(managers);
        break;
      case 'analytics':
        const analytics = await AdminService.getAnalytics();
        TableFormatter.displayAnalytics(analytics);
        break;
      case 'health':
        const health = await AdminService.getSystemHealth();
        TableFormatter.displaySystemHealth(health);
        break;
    }
  } catch (error) {
    console.log(chalk.red(`❌ Admin access denied: ${error.message}`));
  }
}

async function handleManagerMenu() {
  try {
    const { managerAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'managerAction',
        message: 'Manager Panel:',
        choices: [
          { name: '📊 Manager Dashboard', value: 'dashboard' },
          { name: '🎓 My Students', value: 'students' },
          { name: '📚 Manage Courses', value: 'courses' },
          { name: '🎥 Live Sessions', value: 'sessions' },
          { name: '📈 Analytics', value: 'analytics' }
        ]
      }
    ]);

    switch (managerAction) {
      case 'dashboard':
        const dashboard = await ManagerService.getDashboard();
        TableFormatter.displayManagerDashboard(dashboard);
        break;
      case 'students':
        const students = await ManagerService.getStudents();
        TableFormatter.displayStudents(students);
        break;
      case 'courses':
        const courses = await ManagerService.getCourses();
        TableFormatter.displayManagerCourses(courses);
        break;
      case 'sessions':
        const sessions = await ManagerService.getLiveSessions();
        TableFormatter.displayManagerSessions(sessions);
        break;
      case 'analytics':
        const analytics = await ManagerService.getAnalytics();
        TableFormatter.displayManagerAnalytics(analytics);
        break;
    }
  } catch (error) {
    console.log(chalk.red(`❌ Manager access denied: ${error.message}`));
  }
}

// Main Application Function
async function startMainApplication() {
  console.clear();
  console.log(
    chalk.cyan(
      figlet.textSync('TCF/TEF Platform', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      })
    )
  );

  console.log(chalk.yellow('🎓 Welcome to TCF/TEF Learning Platform'));
  console.log(chalk.gray('Your Complete French Language Learning Solution\n'));

  // Check if user is logged in
  if (!AuthService.isAuthenticated()) {
    await showAuthenticationMenu();
  } else {
    await showMainMenu();
  }
}

async function showAuthenticationMenu() {
  while (true) {
    try {
      console.clear();
      console.log(chalk.blue('\n🔐 Authentication Required'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('\nPlease select an option:'));
      console.log(chalk.green('1. 🔑 Login to Existing Account'));
      console.log(chalk.green('2. 📝 Create New Account'));
      console.log(chalk.green('3. 📚 Browse Courses (Guest)'));
      console.log(chalk.green('4. ❓ Help & Information'));
      console.log(chalk.green('5. 🚪 Exit Application'));
      console.log(chalk.gray('─'.repeat(50)));

      const { choice } = await inquirer.prompt([
        {
          type: 'input',
          name: 'choice',
          message: 'Enter your choice (1-5):',
          validate: (input) => {
            const num = parseInt(input);
            if (num >= 1 && num <= 5) return true;
            return 'Please enter a number between 1 and 5';
          }
        }
      ]);

      const option = parseInt(choice);

      switch (option) {
        case 1:
          const loginSuccess = await handleLogin();
          if (loginSuccess && AuthService.isAuthenticated()) {
            await showMainMenu();
            return;
          }
          break;
        case 2:
          await handleRegistration();
          break;
        case 3:
          await handleGuestBrowsing();
          break;
        case 4:
          await showHelpInformation();
          break;
        case 5:
          console.log(chalk.yellow('👋 Thank you for using TCF/TEF Platform!'));
          process.exit(0);
        default:
          console.log(chalk.red('❌ Invalid option. Please try again.'));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showMainMenu() {
  const user = AuthService.getCurrentUser();

  while (true) {
    try {
      console.clear();
      console.log(chalk.blue(`\n👋 Welcome back, ${user.firstName}!`));
      console.log(chalk.gray(`Role: ${user.role} | Subscription: ${user.subscriptionTier}`));
      console.log(chalk.gray('─'.repeat(60)));

      // Build menu options with actions
      const menuItems = [
        { label: '👤 My Profile', action: 'profile' },
        { label: '📊 Dashboard', action: 'dashboard' },
        { label: '📚 Browse Courses', action: 'courses' },
        { label: '🎓 My Learning', action: 'my-learning' },
        { label: '📝 Take Tests', action: 'tests' },
        { label: '🎥 Live Sessions', action: 'live-sessions' },
        { label: '🤖 AI Tutor Chat', action: 'ai-chat' },
        { label: '💳 Subscription & Billing', action: 'billing' }
      ];

      // Add role-specific options
      if (user.role === 'ADMIN') {
        menuItems.push({ label: '👑 Admin Panel', action: 'admin' });
      }

      if (user.role === 'SENIOR_MANAGER' || user.role === 'JUNIOR_MANAGER' || user.role === 'ADMIN') {
        menuItems.push({ label: '👥 Manager Panel', action: 'manager' });
      }

      menuItems.push(
        { label: '⚙️  Settings', action: 'settings' },
        { label: '🔓 Logout', action: 'logout' },
        { label: '🚪 Exit', action: 'exit' }
      );

      console.log(chalk.white('\nMain Menu - Select an option:'));
      menuItems.forEach((item, index) => {
        console.log(chalk.green(`${index + 1}. ${item.label}`));
      });
      console.log(chalk.gray('─'.repeat(60)));

      const { choice } = await inquirer.prompt([
        {
          type: 'input',
          name: 'choice',
          message: `Enter your choice (1-${menuItems.length}):`,
          validate: (input) => {
            const num = parseInt(input);
            if (num >= 1 && num <= menuItems.length) return true;
            return `Please enter a number between 1 and ${menuItems.length}`;
          }
        }
      ]);

      const option = parseInt(choice);
      const selectedItem = menuItems[option - 1];

      if (!selectedItem) {
        console.log(chalk.red('❌ Invalid option. Please try again.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
      }

      const action = selectedItem.action;

      if (action === 'logout') {
        await AuthService.logout();
        console.log(chalk.green('✅ Logged out successfully!'));
        await showAuthenticationMenu();
        return;
      }

      if (action === 'exit') {
        console.log(chalk.yellow('👋 Goodbye!'));
        process.exit(0);
      }

      await handleMainMenuAction(action);

    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

// Authentication Handlers
async function handleLogin() {
  console.log(chalk.blue('\n🔑 Login to Your Account'));
  console.log(chalk.gray('─'.repeat(40)));

  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email Address:',
      validate: (input) => input.includes('@') || 'Please enter a valid email'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*'
    }
  ]);

  const spinner = ora('Logging in...').start();

  try {
    const result = await AuthService.login(credentials.email, credentials.password);
    spinner.succeed(chalk.green('✅ Login successful!'));

    console.log(chalk.blue(`Welcome back, ${result.user.firstName} ${result.user.lastName}!`));
    console.log(chalk.gray(`Role: ${result.user.role} | Subscription: ${result.user.subscriptionTier}`));

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);

    return true; // Login successful

  } catch (error) {
    spinner.fail(chalk.red(`❌ Login failed: ${error.message}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to try again...' }]);
    return false; // Login failed
  }
}

async function handleRegistration() {
  console.log(chalk.blue('\n📝 Create New Account'));
  console.log(chalk.gray('─'.repeat(40)));

  const userData = await inquirer.prompt([
    {
      type: 'input',
      name: 'firstName',
      message: 'First Name:',
      validate: (input) => input.length > 0 || 'First name is required'
    },
    {
      type: 'input',
      name: 'lastName',
      message: 'Last Name:',
      validate: (input) => input.length > 0 || 'Last name is required'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email Address:',
      validate: (input) => input.includes('@') || 'Please enter a valid email'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password (min 8 characters):',
      mask: '*',
      validate: (input) => input.length >= 8 || 'Password must be at least 8 characters'
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm Password:',
      mask: '*',
      validate: (input, answers) => input === answers.password || 'Passwords do not match'
    },
    {
      type: 'input',
      name: 'country',
      message: 'Country:',
      default: 'France'
    }
  ]);

  const spinner = ora('Creating account...').start();

  try {
    const result = await AuthService.register(userData);
    spinner.succeed(chalk.green('✅ Account created successfully!'));

    console.log(chalk.blue(`Welcome, ${result.user.firstName}!`));
    console.log(chalk.yellow('You can now login with your credentials.'));

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);

  } catch (error) {
    spinner.fail(chalk.red(`❌ Registration failed: ${error.message}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to try again...' }]);
  }
}

async function handleGuestBrowsing() {
  console.log(chalk.blue('\n📚 Browse Courses (Guest Mode)'));
  console.log(chalk.yellow('Note: Login required for enrollment and full features'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading courses...').start();
    const courses = await CourseService.getCourses({ limit: 20 });
    spinner.stop();

    if (courses && courses.length > 0) {
      TableFormatter.displayCourses(courses);
    } else {
      console.log(chalk.yellow('No courses available at the moment.'));
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);

  } catch (error) {
    console.log(chalk.red(`❌ Failed to load courses: ${error.message}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
}

async function showHelpInformation() {
  console.log(chalk.blue('\n❓ Help & Information'));
  console.log(chalk.gray('─'.repeat(40)));

  console.log(chalk.white('\n🎓 About TCF/TEF Platform:'));
  console.log('• Complete French language learning solution');
  console.log('• TCF (Test de Connaissance du Français) preparation');
  console.log('• TEF (Test d\'Évaluation de Français) preparation');
  console.log('• Live sessions with certified instructors');
  console.log('• AI-powered tutoring and practice');

  console.log(chalk.white('\n📚 Features:'));
  console.log('• Interactive courses for all levels (A1-C2)');
  console.log('• Practice tests and mock exams');
  console.log('• Real-time progress tracking');
  console.log('• Certificate generation');
  console.log('• Community features and forums');

  console.log(chalk.white('\n💡 Getting Started:'));
  console.log('1. Create an account or login');
  console.log('2. Browse available courses');
  console.log('3. Enroll in courses that match your level');
  console.log('4. Take practice tests to assess your progress');
  console.log('5. Join live sessions for interactive learning');

  console.log(chalk.white('\n🆘 Support:'));
  console.log('• Email: support@tcftef-platform.com');
  console.log('• Documentation: Available in the app');
  console.log('• Live chat: Available for premium users');

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Main Menu Action Handlers
async function handleMainMenuAction(action) {
  switch (action) {
    case 'profile':
      await showProfileMenu();
      break;
    case 'dashboard':
      await showDashboard();
      break;
    case 'courses':
      await showCoursesMenu();
      break;
    case 'my-learning':
      await showMyLearningMenu();
      break;
    case 'tests':
      await showTestsMenu();
      break;
    case 'live-sessions':
      await showLiveSessionsMenu();
      break;
    case 'ai-chat':
      await showAIChatMenu();
      break;
    case 'billing':
      await showBillingMenu();
      break;
    case 'admin':
      await showAdminMenu();
      break;
    case 'manager':
      await showManagerMenu();
      break;
    case 'settings':
      await showSettingsMenu();
      break;
  }
}

async function showProfileMenu() {
  while (true) {
    try {
      console.clear();
      console.log(chalk.blue('\n👤 My Profile'));
      console.log(chalk.gray('─'.repeat(50)));

      const spinner = ora('Loading profile...').start();
      const profile = await UserService.getProfile();
      spinner.stop();

      TableFormatter.displayProfile(profile);

      console.log(chalk.white('\nProfile Options:'));
      console.log(chalk.green('1. ✏️  Edit Profile'));
      console.log(chalk.green('2. 🔒 Change Password'));
      console.log(chalk.green('3. 📊 View Progress'));
      console.log(chalk.green('4. 🏆 My Achievements'));
      console.log(chalk.green('5. 🔙 Back to Main Menu'));
      console.log(chalk.gray('─'.repeat(50)));

      const { choice } = await inquirer.prompt([
        {
          type: 'input',
          name: 'choice',
          message: 'Enter your choice (1-5):',
          validate: (input) => {
            const num = parseInt(input);
            if (num >= 1 && num <= 5) return true;
            return 'Please enter a number between 1 and 5';
          }
        }
      ]);

      const option = parseInt(choice);

      switch (option) {
        case 1:
          await MenuHelpers.handleEditProfile();
          break;
        case 2:
          await MenuHelpers.handleChangePassword();
          break;
        case 3:
          await MenuHelpers.handleViewProgress();
          break;
        case 4:
          await MenuHelpers.handleViewAchievements();
          break;
        case 5:
          return;
        default:
          console.log(chalk.red('❌ Invalid option. Please try again.'));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      }

    } catch (error) {
      console.log(chalk.red(`❌ Failed to load profile: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showDashboard() {
  console.clear();
  console.log(chalk.blue('\n📊 Dashboard'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading dashboard...').start();
    const dashboard = await UserService.getDashboard();
    spinner.stop();

    TableFormatter.displayDashboard(dashboard);

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);

  } catch (error) {
    console.log(chalk.red(`❌ Failed to load dashboard: ${error.message}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
}

async function showCoursesMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n📚 Browse Courses'));
    console.log(chalk.gray('─'.repeat(50)));

    console.log(chalk.white('\nCourse Options:'));
    console.log(chalk.green('1. 📋 View All Courses'));
    console.log(chalk.green('2. 🔍 Search Courses'));
    console.log(chalk.green('3. 📊 Filter by Level'));
    console.log(chalk.green('4. 📂 Filter by Category'));
    console.log(chalk.green('5. ⭐ Recommended for Me'));
    console.log(chalk.green('6. 🔙 Back to Main Menu'));
    console.log(chalk.gray('─'.repeat(50)));

    const { choice } = await inquirer.prompt([
      {
        type: 'input',
        name: 'choice',
        message: 'Enter your choice (1-6):',
        validate: (input) => {
          const num = parseInt(input);
          if (num >= 1 && num <= 6) return true;
          return 'Please enter a number between 1 and 6';
        }
      }
    ]);

    const option = parseInt(choice);
    if (option === 6) break;

    let action;
    switch (option) {
      case 1: action = 'all'; break;
      case 2: action = 'search'; break;
      case 3: action = 'level'; break;
      case 4: action = 'category'; break;
      case 5: action = 'recommended'; break;
      default:
        console.log(chalk.red('❌ Invalid option. Please try again.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
    }

    try {
      let courses;
      const spinner = ora('Loading courses...').start();

      switch (action) {
        case 'all':
          courses = await CourseService.getCourses({ limit: 20 });
          break;
        case 'search':
          spinner.stop();
          const { query } = await inquirer.prompt([
            { type: 'input', name: 'query', message: 'Search for courses:' }
          ]);
          spinner.start('Searching courses...');
          courses = await CourseService.searchCourses(query);
          break;
        case 'level':
          spinner.stop();
          const { level } = await inquirer.prompt([
            {
              type: 'list',
              name: 'level',
              message: 'Select level:',
              choices: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
            }
          ]);
          spinner.start('Loading courses...');
          courses = await CourseService.getCourses({ level, limit: 20 });
          break;
        case 'category':
          spinner.stop();
          const { category } = await inquirer.prompt([
            {
              type: 'list',
              name: 'category',
              message: 'Select category:',
              choices: ['GRAMMAR', 'LISTENING', 'READING', 'VOCABULARY', 'WRITING', 'ORAL', 'TCF_TEF']
            }
          ]);
          spinner.start('Loading courses...');
          courses = await CourseService.getCourses({ category, limit: 20 });
          break;
        case 'recommended':
          // For now, just show all courses - can be enhanced with AI recommendations
          courses = await CourseService.getCourses({ limit: 10 });
          break;
      }

      spinner.stop();

      if (courses && courses.length > 0) {
        TableFormatter.displayCourses(courses);

        console.log(chalk.white('\nWhat would you like to do?'));
        console.log(chalk.green('1. 📝 Enroll in a Course'));
        console.log(chalk.green('2. 👁️  View Course Details'));
        console.log(chalk.green('3. 🔙 Back to Course Menu'));
        console.log(chalk.gray('─'.repeat(40)));

        const { nextChoice } = await inquirer.prompt([
          {
            type: 'input',
            name: 'nextChoice',
            message: 'Enter your choice (1-3):',
            validate: (input) => {
              const num = parseInt(input);
              if (num >= 1 && num <= 3) return true;
              return 'Please enter a number between 1 and 3';
            }
          }
        ]);

        const nextOption = parseInt(nextChoice);

        switch (nextOption) {
          case 1:
            await MenuHelpers.handleCourseEnrollment(courses);
            break;
          case 2:
            await MenuHelpers.handleCourseDetails(courses);
            break;
          case 3:
            // Back to course menu - continue loop
            break;
          default:
            console.log(chalk.red('❌ Invalid option.'));
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        }
      } else {
        console.log(chalk.yellow('No courses found matching your criteria.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      }

    } catch (error) {
      console.log(chalk.red(`❌ Failed to load courses: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

// Additional Menu Handlers
async function showMyLearningMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n🎓 My Learning'));
    console.log(chalk.gray('─'.repeat(50)));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Learning Options:',
        choices: [
          { name: '📚 My Enrolled Courses', value: 'enrolled' },
          { name: '✅ Completed Courses', value: 'completed' },
          { name: '📈 Learning Progress', value: 'progress' },
          { name: '🏆 Certificates', value: 'certificates' },
          { name: '📝 Study Notes', value: 'notes' },
          { name: '🔙 Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      switch (action) {
        case 'enrolled':
          await MenuHelpers.showEnrolledCourses();
          break;
        case 'completed':
          await showCompletedCourses();
          break;
        case 'progress':
          await showLearningProgress();
          break;
        case 'certificates':
          await showCertificates();
          break;
        case 'notes':
          await showStudyNotes();
          break;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showTestsMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n📝 Tests & Assessments'));
    console.log(chalk.gray('─'.repeat(50)));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Test Options:',
        choices: [
          { name: '🎯 Start TCF Test', value: 'tcf' },
          { name: '🎯 Start TEF Test', value: 'tef' },
          { name: '📊 Practice Questions', value: 'practice' },
          { name: '📈 My Test Results', value: 'results' },
          { name: '📋 Available Tests', value: 'available' },
          { name: '🔙 Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      switch (action) {
        case 'tcf':
          await TestService.startTCFTest();
          break;
        case 'tef':
          await TestService.startTEFTest();
          break;
        case 'practice':
          await MenuHelpers.showPracticeQuestions();
          break;
        case 'results':
          await MenuHelpers.showTestResults();
          break;
        case 'available':
          await MenuHelpers.showAvailableTests();
          break;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showLiveSessionsMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n🎥 Live Sessions'));
    console.log(chalk.gray('─'.repeat(50)));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Live Session Options:',
        choices: [
          { name: '📅 Upcoming Sessions', value: 'upcoming' },
          { name: '✅ My Registered Sessions', value: 'registered' },
          { name: '🎥 Join Live Session', value: 'join' },
          { name: '📝 Register for Session', value: 'register' },
          { name: '📊 Session History', value: 'history' },
          { name: '🔙 Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      switch (action) {
        case 'upcoming':
          await showUpcomingSessions();
          break;
        case 'registered':
          await showRegisteredSessions();
          break;
        case 'join':
          await LiveSessionService.joinSession();
          break;
        case 'register':
          await LiveSessionService.registerForSession();
          break;
        case 'history':
          await showSessionHistory();
          break;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showAIChatMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n🤖 AI French Tutor'));
    console.log(chalk.gray('─'.repeat(50)));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'AI Tutor Options:',
        choices: [
          { name: '💬 Start New Chat Session', value: 'chat' },
          { name: '📚 Get Study Recommendations', value: 'recommendations' },
          { name: '📝 Generate Practice Questions', value: 'questions' },
          { name: '📋 My Study Plan', value: 'study-plan' },
          { name: '📜 Chat History', value: 'history' },
          { name: '🔙 Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      switch (action) {
        case 'chat':
          await AIChatService.startChatSession();
          break;
        case 'recommendations':
          await showAIRecommendations();
          break;
        case 'questions':
          await generatePracticeQuestions();
          break;
        case 'study-plan':
          await showStudyPlan();
          break;
        case 'history':
          await showChatHistory();
          break;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showBillingMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n💳 Subscription & Billing'));
    console.log(chalk.gray('─'.repeat(50)));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Billing Options:',
        choices: [
          { name: '📊 Subscription Status', value: 'status' },
          { name: '💳 Payment Methods', value: 'methods' },
          { name: '📄 Payment History', value: 'history' },
          { name: '📋 Invoices', value: 'invoices' },
          { name: '⬆️  Upgrade Subscription', value: 'upgrade' },
          { name: '❌ Cancel Subscription', value: 'cancel' },
          { name: '🔙 Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') break;

    try {
      switch (action) {
        case 'status':
          await showSubscriptionStatus();
          break;
        case 'methods':
          await showPaymentMethods();
          break;
        case 'history':
          await showPaymentHistory();
          break;
        case 'invoices':
          await showInvoices();
          break;
        case 'upgrade':
          await handleSubscriptionUpgrade();
          break;
        case 'cancel':
          await handleSubscriptionCancellation();
          break;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

// Admin and Manager Menu Functions
async function showAdminMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n👑 Admin Panel'));
    console.log(chalk.gray('─'.repeat(50)));

    console.log(chalk.white('\nAdmin Options:'));
    console.log(chalk.green('1. 📊 Admin Dashboard'));
    console.log(chalk.green('2. 👥 User Management'));
    console.log(chalk.green('3. 📚 Course Management'));
    console.log(chalk.green('4. 👨‍💼 Manager Management'));
    console.log(chalk.green('5. 📈 Analytics'));
    console.log(chalk.green('6. ⚙️  System Health'));
    console.log(chalk.green('7. 🔙 Back to Main Menu'));
    console.log(chalk.gray('─'.repeat(50)));

    const { choice } = await inquirer.prompt([
      {
        type: 'input',
        name: 'choice',
        message: 'Enter your choice (1-7):',
        validate: (input) => {
          const num = parseInt(input);
          if (num >= 1 && num <= 7) return true;
          return 'Please enter a number between 1 and 7';
        }
      }
    ]);

    const option = parseInt(choice);
    if (option === 7) break;

    try {
      switch (option) {
        case 1:
          await showAdminDashboard();
          break;
        case 2:
          await showUserManagement();
          break;
        case 3:
          await showCourseManagement();
          break;
        case 4:
          await showManagerManagement();
          break;
        case 5:
          await showAnalytics();
          break;
        case 6:
          await showSystemHealth();
          break;
        default:
          console.log(chalk.red('❌ Invalid option. Please try again.'));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showManagerMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n👥 Manager Panel'));
    console.log(chalk.gray('─'.repeat(50)));

    console.log(chalk.white('\nManager Options:'));
    console.log(chalk.green('1. 📊 Manager Dashboard'));
    console.log(chalk.green('2. 👨‍🎓 Student Management'));
    console.log(chalk.green('3. 📚 Course Oversight'));
    console.log(chalk.green('4. 🎥 Live Session Management'));
    console.log(chalk.green('5. 📈 Progress Reports'));
    console.log(chalk.green('6. 🔙 Back to Main Menu'));
    console.log(chalk.gray('─'.repeat(50)));

    const { choice } = await inquirer.prompt([
      {
        type: 'input',
        name: 'choice',
        message: 'Enter your choice (1-6):',
        validate: (input) => {
          const num = parseInt(input);
          if (num >= 1 && num <= 6) return true;
          return 'Please enter a number between 1 and 6';
        }
      }
    ]);

    const option = parseInt(choice);
    if (option === 6) break;

    try {
      switch (option) {
        case 1:
          await showManagerDashboard();
          break;
        case 2:
          await showStudentManagement();
          break;
        case 3:
          await showManagerCourseOversight();
          break;
        case 4:
          await showLiveSessionManagement();
          break;
        case 5:
          await showProgressReports();
          break;
        default:
          console.log(chalk.red('❌ Invalid option. Please try again.'));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function showSettingsMenu() {
  while (true) {
    console.clear();
    console.log(chalk.blue('\n⚙️  Settings'));
    console.log(chalk.gray('─'.repeat(50)));

    console.log(chalk.white('\nSettings Options:'));
    console.log(chalk.green('1. 🔧 API Configuration'));
    console.log(chalk.green('2. 🎨 Display Preferences'));
    console.log(chalk.green('3. 🔔 Notification Settings'));
    console.log(chalk.green('4. 📱 CLI Preferences'));
    console.log(chalk.green('5. 🔙 Back to Main Menu'));
    console.log(chalk.gray('─'.repeat(50)));

    const { choice } = await inquirer.prompt([
      {
        type: 'input',
        name: 'choice',
        message: 'Enter your choice (1-5):',
        validate: (input) => {
          const num = parseInt(input);
          if (num >= 1 && num <= 5) return true;
          return 'Please enter a number between 1 and 5';
        }
      }
    ]);

    const option = parseInt(choice);
    if (option === 5) break;

    try {
      switch (option) {
        case 1:
          await showAPIConfiguration();
          break;
        case 2:
          await showDisplayPreferences();
          break;
        case 3:
          await showNotificationSettings();
          break;
        case 4:
          await showCLIPreferences();
          break;
        default:
          console.log(chalk.red('❌ Invalid option. Please try again.'));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

// Admin Helper Functions
async function showAdminDashboard() {
  console.clear();
  console.log(chalk.blue('\n📊 Admin Dashboard'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading admin dashboard...').start();
    const dashboard = await AdminService.getDashboard();
    spinner.stop();

    TableFormatter.displayDashboard(dashboard);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load admin dashboard: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showUserManagement() {
  console.clear();
  console.log(chalk.blue('\n👥 User Management'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading users...').start();
    const users = await AdminService.getUsers();
    spinner.stop();

    TableFormatter.displayUsers(users);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load users: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showCourseManagement() {
  console.clear();
  console.log(chalk.blue('\n📚 Course Management'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading courses...').start();
    const courses = await AdminService.getCourses();
    spinner.stop();

    TableFormatter.displayCourses(courses);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load courses: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showManagerManagement() {
  console.clear();
  console.log(chalk.blue('\n👨‍💼 Manager Management'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading managers...').start();
    const managers = await AdminService.getManagers();
    spinner.stop();

    TableFormatter.displayUsers(managers);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load managers: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showAnalytics() {
  console.clear();
  console.log(chalk.blue('\n📈 Analytics'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading analytics...').start();
    const analytics = await AdminService.getAnalytics();
    spinner.stop();

    console.log(chalk.white('\n📊 Platform Analytics:'));
    console.log(`• Total Users: ${analytics.totalUsers || 'N/A'}`);
    console.log(`• Active Users: ${analytics.activeUsers || 'N/A'}`);
    console.log(`• Total Courses: ${analytics.totalCourses || 'N/A'}`);
    console.log(`• Total Enrollments: ${analytics.totalEnrollments || 'N/A'}`);
    console.log(`• Tests Taken: ${analytics.testsTaken || 'N/A'}`);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load analytics: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showSystemHealth() {
  console.clear();
  console.log(chalk.blue('\n⚙️  System Health'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Checking system health...').start();
    const health = await AdminService.getSystemHealth();
    spinner.stop();

    console.log(chalk.white('\n🏥 System Status:'));
    console.log(`• Database: ${health.database ? chalk.green('✅ Connected') : chalk.red('❌ Disconnected')}`);
    console.log(`• API Server: ${health.server ? chalk.green('✅ Running') : chalk.red('❌ Down')}`);
    console.log(`• Memory Usage: ${health.memory || 'N/A'}`);
    console.log(`• CPU Usage: ${health.cpu || 'N/A'}`);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to check system health: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Manager Helper Functions
async function showManagerDashboard() {
  console.clear();
  console.log(chalk.blue('\n📊 Manager Dashboard'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading manager dashboard...').start();
    const dashboard = await ManagerService.getDashboard();
    spinner.stop();

    TableFormatter.displayDashboard(dashboard);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load manager dashboard: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showStudentManagement() {
  console.clear();
  console.log(chalk.blue('\n👨‍🎓 Student Management'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    const spinner = ora('Loading students...').start();
    const students = await ManagerService.getStudents();
    spinner.stop();

    TableFormatter.displayUsers(students);
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load students: ${error.message}`));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Settings Helper Functions
async function showAPIConfiguration() {
  console.clear();
  console.log(chalk.blue('\n🔧 API Configuration'));
  console.log(chalk.gray('─'.repeat(50)));

  const currentUrl = ConfigManager.getApiUrl();
  console.log(chalk.white(`\nCurrent API URL: ${currentUrl}`));

  const { changeUrl } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'changeUrl',
      message: 'Would you like to change the API URL?',
      default: false
    }
  ]);

  if (changeUrl) {
    const { newUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newUrl',
        message: 'Enter new API URL:',
        default: currentUrl,
        validate: (input) => input.startsWith('http') || 'Please enter a valid URL starting with http'
      }
    ]);

    ConfigManager.setApiUrl(newUrl);
    console.log(chalk.green('✅ API URL updated successfully!'));
  }

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showDisplayPreferences() {
  console.clear();
  console.log(chalk.blue('\n🎨 Display Preferences'));
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.white('\nCurrent display settings are optimized for terminal use.'));
  console.log(chalk.yellow('Display customization features coming soon!'));

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showNotificationSettings() {
  console.clear();
  console.log(chalk.blue('\n🔔 Notification Settings'));
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.white('\nNotification preferences will be available in future updates.'));
  console.log(chalk.yellow('Stay tuned for notification customization!'));

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showCLIPreferences() {
  console.clear();
  console.log(chalk.blue('\n📱 CLI Preferences'));
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.white('\nCLI customization options:'));
  console.log('• Menu style: Numbered (current)');
  console.log('• Colors: Enabled');
  console.log('• Progress indicators: Enabled');

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Placeholder functions for missing manager functions
async function showManagerCourseOversight() {
  console.clear();
  console.log(chalk.blue('\n📚 Course Oversight'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.yellow('Course oversight features coming soon!'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showLiveSessionManagement() {
  console.clear();
  console.log(chalk.blue('\n🎥 Live Session Management'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.yellow('Live session management features coming soon!'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function showProgressReports() {
  console.clear();
  console.log(chalk.blue('\n📈 Progress Reports'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.yellow('Progress reporting features coming soon!'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Parse command line arguments
program.parse();

// If no command provided, start the main application
if (process.argv.length === 2) {
  startMainApplication();
}
