#!/usr/bin/env node

const chalk = require('chalk');
const figlet = require('figlet');
const readline = require('readline');
const axios = require('axios');

// Global state
let currentUser = null;
let authToken = null;
const API_BASE_URL = 'http://localhost:3001/api';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// ASCII Art Welcome
function showWelcome() {
  console.clear();
  console.log(chalk.cyan(figlet.textSync('TCF TEF CLI', { horizontalLayout: 'full' })));
  console.log(chalk.yellow('🎓 Welcome to TCF/TEF French Learning Platform CLI'));
  console.log(chalk.gray('═'.repeat(60)));
  console.log();
}

// API Helper function
async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {}
    };

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.error?.message || error.response.data.message || 'API Error');
    }
    throw new Error(error.message);
  }
}

// Main menu-driven application
async function startApp() {
  showWelcome();
  
  while (true) {
    try {
      if (!currentUser) {
        await showGuestMenu();
      } else {
        await showUserMenu();
      }
    } catch (error) {
      console.log(chalk.red('❌ Error: ' + error.message));
      await askQuestion(chalk.gray('Press Enter to continue...'));
    }
  }
}

// Guest menu (not logged in)
async function showGuestMenu() {
  console.log(chalk.cyan('\n🏠 MAIN MENU'));
  console.log(chalk.gray('─'.repeat(30)));
  console.log(chalk.white('1. 🔐 Login'));
  console.log(chalk.white('2. 📝 Register'));
  console.log(chalk.white('3. 👀 Browse Courses (Guest)'));
  console.log(chalk.white('4. ❓ Help'));
  console.log(chalk.white('0. 🚪 Exit'));
  console.log();

  const choice = await askQuestion(chalk.yellow('Select an option (0-4): '));

  switch (choice) {
    case '1':
      await handleLogin();
      break;
    case '2':
      await handleRegister();
      break;
    case '3':
      await browseCourses();
      break;
    case '4':
      showHelp();
      break;
    case '0':
      console.log(chalk.green('👋 Goodbye!'));
      process.exit(0);
    default:
      console.log(chalk.red('❌ Invalid option. Please try again.'));
      await askQuestion(chalk.gray('Press Enter to continue...'));
  }
}

// User menu (logged in)
async function showUserMenu() {
  console.log(chalk.cyan(`\n🏠 WELCOME ${currentUser.firstName.toUpperCase()}!`));
  console.log(chalk.gray('─'.repeat(40)));
  
  // Common options for all users
  console.log(chalk.white('1. 👤 View Profile'));
  console.log(chalk.white('2. 📚 My Courses'));
  console.log(chalk.white('3. 🔍 Browse All Courses'));
  console.log(chalk.white('4. 📝 Take Test'));
  console.log(chalk.white('5. 🤖 AI Chat Assistant'));
  console.log(chalk.white('6. 📊 My Dashboard'));
  console.log(chalk.white('7. 🔧 Settings'));
  
  // Role-specific options
  if (currentUser.role === 'ADMIN') {
    console.log(chalk.magenta('8. 👑 Admin Panel'));
  } else if (currentUser.role === 'SENIOR_MANAGER' || currentUser.role === 'JUNIOR_MANAGER') {
    console.log(chalk.blue('8. 📋 Manager Panel'));
  }
  
  console.log(chalk.white('9. 📞 Contact Admin'));
  console.log(chalk.white('0. 🚪 Logout'));
  console.log();

  const maxOption = (currentUser.role === 'ADMIN' || currentUser.role.includes('MANAGER')) ? 9 : 9;
  const choice = await askQuestion(chalk.yellow(`Select an option (0-${maxOption}): `));

  switch (choice) {
    case '1':
      await viewProfile();
      break;
    case '2':
      await viewMyCourses();
      break;
    case '3':
      await browseCourses();
      break;
    case '4':
      await takeTest();
      break;
    case '5':
      await startAIChat();
      break;
    case '6':
      await viewDashboard();
      break;
    case '7':
      await showSettings();
      break;
    case '8':
      if (currentUser.role === 'ADMIN') {
        await showAdminPanel();
      } else if (currentUser.role === 'SENIOR_MANAGER' || currentUser.role === 'JUNIOR_MANAGER') {
        await showManagerPanel();
      } else {
        console.log(chalk.red('❌ Invalid option.'));
      }
      break;
    case '9':
      await contactAdmin();
      break;
    case '0':
      await handleLogout();
      break;
    default:
      console.log(chalk.red('❌ Invalid option. Please try again.'));
      await askQuestion(chalk.gray('Press Enter to continue...'));
  }
}

// Authentication functions
async function handleLogin() {
  console.log(chalk.cyan('\n🔐 LOGIN'));
  console.log(chalk.gray('─'.repeat(20)));
  
  const email = await askQuestion(chalk.white('Email: '));
  const password = await askQuestion(chalk.white('Password: '));

  try {
    console.log(chalk.yellow('🔄 Logging in...'));
    const result = await apiCall('POST', '/auth/login', { email, password });
    
    currentUser = result.data.user;
    authToken = result.data.token;
    
    console.log(chalk.green('✅ Login successful!'));
    console.log(chalk.blue(`Welcome back, ${currentUser.firstName} ${currentUser.lastName}!`));
    console.log(chalk.gray(`Role: ${currentUser.role}`));
    await askQuestion(chalk.gray('Press Enter to continue...'));
  } catch (error) {
    console.log(chalk.red(`❌ Login failed: ${error.message}`));
    await askQuestion(chalk.gray('Press Enter to continue...'));
  }
}

async function handleRegister() {
  console.log(chalk.cyan('\n📝 REGISTER'));
  console.log(chalk.gray('─'.repeat(20)));
  
  const firstName = await askQuestion(chalk.white('First Name: '));
  const lastName = await askQuestion(chalk.white('Last Name: '));
  const email = await askQuestion(chalk.white('Email: '));
  const password = await askQuestion(chalk.white('Password: '));
  const country = await askQuestion(chalk.white('Country (default: France): ')) || 'France';

  try {
    console.log(chalk.yellow('🔄 Creating account...'));
    const result = await apiCall('POST', '/auth/register', {
      firstName,
      lastName,
      email,
      password,
      country
    });
    
    console.log(chalk.green('✅ Registration successful!'));
    console.log(chalk.blue(`Welcome, ${result.data.user.firstName}!`));
    console.log(chalk.gray('You can now login with your credentials.'));
    await askQuestion(chalk.gray('Press Enter to continue...'));
  } catch (error) {
    console.log(chalk.red(`❌ Registration failed: ${error.message}`));
    await askQuestion(chalk.gray('Press Enter to continue...'));
  }
}

async function handleLogout() {
  currentUser = null;
  authToken = null;
  console.log(chalk.green('✅ Logged out successfully!'));
  await askQuestion(chalk.gray('Press Enter to continue...'));
}

// Start the application
if (require.main === module) {
  startApp().catch(console.error);
}
