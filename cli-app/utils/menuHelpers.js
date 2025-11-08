import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { UserService } from '../services/userService.js';
import { CourseService } from '../services/courseService.js';
import { TestService } from '../services/testService.js';
import { LiveSessionService } from '../services/liveSessionService.js';
import { PaymentService } from '../services/paymentService.js';
import { AIChatService } from '../services/aiChatService.js';
import { AdminService } from '../services/adminService.js';
import { ManagerService } from '../services/managerService.js';
import { TableFormatter } from './formatter.js';

// Profile Menu Helpers
export async function handleEditProfile() {
  console.log(chalk.blue('\n✏️  Edit Profile'));
  console.log(chalk.gray('─'.repeat(40)));
  
  try {
    const currentProfile = await UserService.getProfile();
    
    const updates = await inquirer.prompt([
      {
        type: 'input',
        name: 'firstName',
        message: 'First Name:',
        default: currentProfile.firstName
      },
      {
        type: 'input',
        name: 'lastName',
        message: 'Last Name:',
        default: currentProfile.lastName
      },
      {
        type: 'input',
        name: 'country',
        message: 'Country:',
        default: currentProfile.country
      }
    ]);

    const spinner = ora('Updating profile...').start();
    await UserService.updateProfile(updates);
    spinner.succeed(chalk.green('✅ Profile updated successfully!'));
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to update profile: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function handleChangePassword() {
  console.log(chalk.blue('\n🔒 Change Password'));
  console.log(chalk.gray('─'.repeat(40)));
  
  try {
    const passwords = await inquirer.prompt([
      {
        type: 'password',
        name: 'currentPassword',
        message: 'Current Password:',
        mask: '*'
      },
      {
        type: 'password',
        name: 'newPassword',
        message: 'New Password:',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters'
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm New Password:',
        mask: '*',
        validate: (input, answers) => input === answers.newPassword || 'Passwords do not match'
      }
    ]);

    const spinner = ora('Changing password...').start();
    await UserService.changePassword(passwords.currentPassword, passwords.newPassword);
    spinner.succeed(chalk.green('✅ Password changed successfully!'));
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to change password: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function handleViewProgress() {
  console.log(chalk.blue('\n📊 Learning Progress'));
  console.log(chalk.gray('─'.repeat(40)));
  
  try {
    const spinner = ora('Loading progress...').start();
    const progress = await UserService.getUserProgress();
    spinner.stop();
    
    // Display progress information
    console.log(chalk.white('\n📈 Overall Progress:'));
    console.log(`• Courses Enrolled: ${progress.coursesEnrolled || 0}`);
    console.log(`• Courses Completed: ${progress.coursesCompleted || 0}`);
    console.log(`• Tests Taken: ${progress.testsTaken || 0}`);
    console.log(`• Study Hours: ${progress.studyHours || 0}`);
    console.log(`• Current Level: ${progress.currentLevel || 'Not assessed'}`);
    
    if (progress.recentActivity && progress.recentActivity.length > 0) {
      console.log(chalk.white('\n📋 Recent Activity:'));
      progress.recentActivity.forEach(activity => {
        console.log(`• ${activity.description} - ${new Date(activity.date).toLocaleDateString()}`);
      });
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load progress: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function handleViewAchievements() {
  console.log(chalk.blue('\n🏆 My Achievements'));
  console.log(chalk.gray('─'.repeat(40)));
  
  try {
    const spinner = ora('Loading achievements...').start();
    const achievements = await UserService.getUserAchievements();
    spinner.stop();
    
    if (achievements && achievements.length > 0) {
      console.log(chalk.white('\n🏆 Your Achievements:'));
      achievements.forEach(achievement => {
        console.log(`🏅 ${achievement.title}`);
        console.log(`   ${achievement.description}`);
        console.log(`   Earned: ${new Date(achievement.earnedAt).toLocaleDateString()}\n`);
      });
    } else {
      console.log(chalk.yellow('No achievements yet. Keep learning to earn your first achievement!'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load achievements: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Course Menu Helpers
export async function handleCourseEnrollment(courses) {
  const { courseId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'courseId',
      message: 'Select a course to enroll in:',
      choices: courses.map(course => ({
        name: `${course.title} (${course.level}) - ${course.requiredTier}`,
        value: course.id
      }))
    }
  ]);

  try {
    const spinner = ora('Enrolling in course...').start();
    await CourseService.enrollInCourse(courseId);
    spinner.succeed(chalk.green('✅ Successfully enrolled in course!'));
  } catch (error) {
    console.log(chalk.red(`❌ Enrollment failed: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function handleCourseDetails(courses) {
  const { courseId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'courseId',
      message: 'Select a course to view details:',
      choices: courses.map(course => ({
        name: `${course.title} (${course.level})`,
        value: course.id
      }))
    }
  ]);

  try {
    const spinner = ora('Loading course details...').start();
    const course = await CourseService.getCourse(courseId);
    spinner.stop();
    
    console.log(chalk.blue(`\n📚 ${course.title}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`📖 Description: ${course.description}`);
    console.log(`📊 Level: ${course.level}`);
    console.log(`📂 Category: ${course.category}`);
    console.log(`⏱️  Duration: ${course.duration} hours`);
    console.log(`📝 Lessons: ${course.lessons || 'N/A'}`);
    console.log(`⭐ Required Tier: ${course.requiredTier}`);
    console.log(`🏷️  Tags: ${course.tags ? course.tags.join(', ') : 'None'}`);
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load course details: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Learning Menu Helpers
export async function showEnrolledCourses() {
  console.log(chalk.blue('\n📚 My Enrolled Courses'));
  console.log(chalk.gray('─'.repeat(50)));
  
  try {
    const spinner = ora('Loading enrolled courses...').start();
    const courses = await CourseService.getEnrolledCourses();
    spinner.stop();
    
    if (courses && courses.length > 0) {
      TableFormatter.displayEnrolledCourses(courses);
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Course Actions:',
          choices: [
            { name: '📊 View Progress', value: 'progress' },
            { name: '📚 Continue Learning', value: 'continue' },
            { name: '❌ Unenroll from Course', value: 'unenroll' },
            { name: '🔙 Back', value: 'back' }
          ]
        }
      ]);

      if (action !== 'back') {
        await handleEnrolledCourseAction(action, courses);
      }
    } else {
      console.log(chalk.yellow('You are not enrolled in any courses yet.'));
      console.log(chalk.blue('Browse available courses to start learning!'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load enrolled courses: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function handleEnrolledCourseAction(action, courses) {
  if (action === 'progress') {
    const { courseId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'courseId',
        message: 'Select course to view progress:',
        choices: courses.map(course => ({
          name: course.course?.title || course.title,
          value: course.course?.id || course.id
        }))
      }
    ]);

    try {
      const spinner = ora('Loading course progress...').start();
      const progress = await CourseService.getCourseProgress(courseId);
      spinner.stop();
      
      console.log(chalk.blue('\n📊 Course Progress'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`Progress: ${progress.completionPercentage || 0}%`);
      console.log(`Lessons Completed: ${progress.lessonsCompleted || 0}/${progress.totalLessons || 0}`);
      console.log(`Time Spent: ${progress.timeSpent || 0} hours`);
      console.log(`Last Accessed: ${progress.lastAccessed ? new Date(progress.lastAccessed).toLocaleDateString() : 'Never'}`);
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to load progress: ${error.message}`));
    }
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// Test Menu Helpers
export async function showPracticeQuestions() {
  console.log(chalk.blue('\n📝 Practice Questions'));
  console.log(chalk.gray('─'.repeat(40)));
  
  const { level, category } = await inquirer.prompt([
    {
      type: 'list',
      name: 'level',
      message: 'Select level:',
      choices: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    },
    {
      type: 'list',
      name: 'category',
      message: 'Select category:',
      choices: ['GRAMMAR', 'LISTENING', 'READING', 'VOCABULARY', 'WRITING', 'ORAL']
    }
  ]);

  try {
    const spinner = ora('Loading practice questions...').start();
    const questions = await TestService.getPracticeQuestions(level, category);
    spinner.stop();
    
    if (questions && questions.length > 0) {
      console.log(chalk.green(`✅ Found ${questions.length} practice questions`));
      // Here you could implement a practice session
      console.log(chalk.blue('Practice session feature coming soon!'));
    } else {
      console.log(chalk.yellow('No practice questions available for this combination.'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load practice questions: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function showTestResults() {
  console.log(chalk.blue('\n📊 My Test Results'));
  console.log(chalk.gray('─'.repeat(40)));
  
  try {
    const spinner = ora('Loading test results...').start();
    const results = await TestService.getTestResults();
    spinner.stop();
    
    if (results && results.length > 0) {
      TableFormatter.displayTestResults(results);
    } else {
      console.log(chalk.yellow('No test results found. Take a test to see your results here!'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load test results: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

export async function showAvailableTests() {
  console.log(chalk.blue('\n📋 Available Tests'));
  console.log(chalk.gray('─'.repeat(40)));
  
  try {
    const spinner = ora('Loading available tests...').start();
    const tests = await TestService.getAvailableTests();
    spinner.stop();
    
    if (tests && tests.length > 0) {
      TableFormatter.displayTests(tests);
    } else {
      console.log(chalk.yellow('No tests available at the moment.'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to load tests: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}
