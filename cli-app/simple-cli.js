#!/usr/bin/env node

import { AuthService } from './services/authService.js';
import { UserService } from './services/userService.js';
import { AdminService } from './services/adminService.js';
import { CourseService } from './services/courseService.js';
import { TableFormatter } from './utils/formatter.js';
import chalk from 'chalk';
import readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Clear screen function
function clearScreen() {
  console.clear();
}

// Display welcome screen
function showWelcome() {
  clearScreen();
  console.log(chalk.blue(`
  _____ ____ _____ _______ _____ _____    ____ _     ___ 
 |_   _/ ___|  ___/ /_   _| ____|  ___|  / ___| |   |_ _|
   | || |   | |_ / /  | | |  _| | |_    | |   | |    | |
   | || |___|  _/ /   | | | |___|  _|   | |___| |___ | |
   |_| \\____|_|/_/    |_| |_____|_|      \\____|_____|___|

🎓 Welcome to TCF/TEF French Learning Platform CLI
`));
  console.log(chalk.gray('═'.repeat(60)));
}

// Authentication menu
async function showAuthMenu() {
  while (true) {
    clearScreen();
    showWelcome();
    
    if (AuthService.isAuthenticated()) {
      const user = AuthService.getCurrentUser();
      console.log(chalk.green(`👋 Welcome back, ${user.firstName}!`));
      console.log(chalk.blue(`Role: ${user.role} | Subscription: ${user.subscriptionTier}`));
      console.log(chalk.gray('─'.repeat(60)));
      await showMainMenu();
      return;
    }

    console.log(chalk.white('\nAuthentication Menu:'));
    console.log(chalk.green('1. 🔑 Login'));
    console.log(chalk.green('2. 📝 Register'));
    console.log(chalk.green('3. 🚪 Exit'));
    console.log(chalk.gray('─'.repeat(60)));

    const choice = await ask('Enter your choice (1-3): ');

    switch (choice.trim()) {
      case '1':
        await handleLogin();
        break;
      case '2':
        await handleRegister();
        break;
      case '3':
        console.log(chalk.blue('👋 Goodbye!'));
        rl.close();
        process.exit(0);
      default:
        console.log(chalk.red('❌ Invalid choice. Please try again.'));
        await ask('Press Enter to continue...');
    }
  }
}

// Login handler
async function handleLogin() {
  clearScreen();
  console.log(chalk.blue('🔑 Login to TCF/TEF Platform'));
  console.log(chalk.gray('─'.repeat(40)));

  const email = await ask('Email: ');
  const password = await ask('Password: ');

  try {
    console.log(chalk.yellow('🔄 Logging in...'));
    const result = await AuthService.login(email, password);
    console.log(chalk.green('✅ Login successful!'));
    console.log(`Welcome, ${result.user.firstName} ${result.user.lastName}!`);
    await ask('Press Enter to continue...');
  } catch (error) {
    console.log(chalk.red(`❌ Login failed: ${error.message}`));
    await ask('Press Enter to continue...');
  }
}

// Register handler
async function handleRegister() {
  clearScreen();
  console.log(chalk.blue('📝 Register for TCF/TEF Platform'));
  console.log(chalk.gray('─'.repeat(40)));

  const firstName = await ask('First Name: ');
  const lastName = await ask('Last Name: ');
  const email = await ask('Email: ');
  const password = await ask('Password: ');
  const country = await ask('Country (optional): ');

  try {
    console.log(chalk.yellow('🔄 Creating account...'));
    const result = await AuthService.register({
      firstName,
      lastName,
      email,
      password,
      country: country || undefined
    });
    console.log(chalk.green('✅ Registration successful!'));
    console.log(`Welcome, ${result.user.firstName}!`);
    await ask('Press Enter to continue...');
  } catch (error) {
    console.log(chalk.red(`❌ Registration failed: ${error.message}`));
    await ask('Press Enter to continue...');
  }
}

// Main menu
async function showMainMenu() {
  while (true) {
    clearScreen();
    const user = AuthService.getCurrentUser();
    console.log(chalk.green(`👋 Welcome back, ${user.firstName}!`));
    console.log(chalk.blue(`Role: ${user.role} | Subscription: ${user.subscriptionTier}`));
    console.log(chalk.gray('─'.repeat(60)));

    console.log(chalk.white('\nMain Menu:'));
    console.log(chalk.green('1. 👤 My Profile'));
    console.log(chalk.green('2. 📚 Browse Courses'));
    console.log(chalk.green('3. 🎓 My Learning'));
    
    if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
      console.log(chalk.yellow('4. 👑 Admin Panel'));
    }
    if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER' || user.role === 'JUNIOR_MANAGER') {
      console.log(chalk.yellow('5. 👥 Manager Panel'));
    }
    
    console.log(chalk.green('6. 🤖 AI Tutor Chat'));
    console.log(chalk.green('7. ⚙️  Settings'));
    console.log(chalk.green('8. 🔓 Logout'));
    console.log(chalk.green('9. 🚪 Exit'));
    console.log(chalk.gray('─'.repeat(60)));

    const choice = await ask('Enter your choice: ');

    switch (choice.trim()) {
      case '1':
        await showProfile();
        break;
      case '2':
        await showCourses();
        break;
      case '3':
        await showMyLearning();
        break;
      case '4':
        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
          await showAdminPanel();
        } else {
          console.log(chalk.red('❌ Access denied'));
          await ask('Press Enter to continue...');
        }
        break;
      case '5':
        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER' || user.role === 'JUNIOR_MANAGER') {
          await showManagerPanel();
        } else {
          console.log(chalk.red('❌ Access denied'));
          await ask('Press Enter to continue...');
        }
        break;
      case '6':
        await showAIChat();
        break;
      case '7':
        await showSettings();
        break;
      case '8':
        AuthService.logout();
        console.log(chalk.green('✅ Logged out successfully'));
        await ask('Press Enter to continue...');
        return;
      case '9':
        console.log(chalk.blue('👋 Goodbye!'));
        rl.close();
        process.exit(0);
      default:
        console.log(chalk.red('❌ Invalid choice. Please try again.'));
        await ask('Press Enter to continue...');
    }
  }
}

// Profile menu
async function showProfile() {
  clearScreen();
  console.log(chalk.blue('👤 My Profile'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    console.log(chalk.yellow('🔄 Loading profile...'));
    const profile = await UserService.getProfile();
    clearScreen();
    console.log(chalk.blue('👤 My Profile'));
    console.log(chalk.gray('─'.repeat(50)));
    TableFormatter.displayProfile(profile);
  } catch (error) {
    console.log(chalk.red(`❌ Error loading profile: ${error.message}`));
  }

  await ask('\nPress Enter to continue...');
}

// Courses menu
async function showCourses() {
  clearScreen();
  console.log(chalk.blue('📚 Browse Courses'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    console.log(chalk.yellow('🔄 Loading courses...'));
    const courses = await CourseService.getCourses();
    clearScreen();
    console.log(chalk.blue('📚 Browse Courses'));
    console.log(chalk.gray('─'.repeat(50)));
    TableFormatter.displayCourses(courses);
  } catch (error) {
    console.log(chalk.red(`❌ Error loading courses: ${error.message}`));
  }

  await ask('\nPress Enter to continue...');
}

// My Learning menu
async function showMyLearning() {
  clearScreen();
  console.log(chalk.blue('🎓 My Learning'));
  console.log(chalk.gray('─'.repeat(50)));

  try {
    console.log(chalk.yellow('🔄 Loading enrolled courses...'));
    const enrolledCourses = await CourseService.getEnrolledCourses();
    clearScreen();
    console.log(chalk.blue('🎓 My Learning'));
    console.log(chalk.gray('─'.repeat(50)));
    TableFormatter.displayEnrolledCourses(enrolledCourses);
  } catch (error) {
    console.log(chalk.red(`❌ Error loading learning data: ${error.message}`));
  }

  await ask('\nPress Enter to continue...');
}

// Start the application
async function startApp() {
  console.log(chalk.blue('🚀 Starting TCF/TEF CLI Application...'));
  await showAuthMenu();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.blue('\n👋 Goodbye!'));
  rl.close();
  process.exit(0);
});

// Start the application
startApp().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  rl.close();
  process.exit(1);
});
