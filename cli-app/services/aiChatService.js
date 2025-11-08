import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

export class AIChatService {
  static async startChatSession() {
    try {
      AuthService.requireAuth();
      
      console.clear();
      console.log(chalk.blue('\n🤖 AI French Tutor'));
      console.log(chalk.yellow('Your personal French language learning assistant'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.white('💡 Tips:'));
      console.log('• Ask questions about French grammar, vocabulary, or culture');
      console.log('• Request practice exercises for specific topics');
      console.log('• Get help with TCF/TEF test preparation');
      console.log('• Type "exit" to end the conversation');
      console.log(chalk.gray('─'.repeat(60)));

      // Initialize chat session
      const spinner = ora('Initializing AI tutor...').start();
      const chatSession = await this.initializeChatSession();
      spinner.succeed(chalk.green('✅ AI tutor is ready!'));

      console.log(chalk.blue('\n🤖 AI Tutor: Bonjour! I\'m your French learning assistant. How can I help you today?'));
      
      // Start conversation loop
      await this.conversationLoop(chatSession.id);
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to start AI chat: ${error.message}`));
    }
  }

  static async initializeChatSession() {
    try {
      const response = await axios.post(`${ConfigManager.getApiUrl()}/ai/chat/start`, {
        type: 'FRENCH_TUTOR',
        context: 'TCF_TEF_LEARNING'
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to initialize chat session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.initializeChatSession();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async conversationLoop(sessionId) {
    while (true) {
      try {
        const { message } = await inquirer.prompt([
          {
            type: 'input',
            name: 'message',
            message: chalk.green('You:'),
            validate: (input) => input.trim().length > 0 || 'Please enter a message'
          }
        ]);

        if (message.toLowerCase().trim() === 'exit') {
          console.log(chalk.blue('\n🤖 AI Tutor: Au revoir! Keep practicing your French. Bonne chance!'));
          await this.endChatSession(sessionId);
          break;
        }

        const spinner = ora('AI is thinking...').start();
        const response = await this.sendMessage(sessionId, message);
        spinner.stop();

        console.log(chalk.blue(`\n🤖 AI Tutor: ${response.message}`));

        // Show additional features if available
        if (response.suggestions && response.suggestions.length > 0) {
          console.log(chalk.yellow('\n💡 Suggestions:'));
          response.suggestions.forEach((suggestion, index) => {
            console.log(chalk.gray(`${index + 1}. ${suggestion}`));
          });
        }

        if (response.exercises && response.exercises.length > 0) {
          const { wantExercise } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'wantExercise',
              message: 'Would you like to try a practice exercise?',
              default: false
            }
          ]);

          if (wantExercise) {
            await this.handlePracticeExercise(response.exercises[0]);
          }
        }

      } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
        
        const { continueChat } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueChat',
            message: 'Would you like to continue the conversation?',
            default: true
          }
        ]);

        if (!continueChat) break;
      }
    }
  }

  static async sendMessage(sessionId, message) {
    try {
      const response = await axios.post(`${ConfigManager.getApiUrl()}/ai/chat/${sessionId}/message`, {
        message,
        timestamp: new Date().toISOString()
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to send message');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.sendMessage(sessionId, message);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async handlePracticeExercise(exercise) {
    console.log(chalk.yellow(`\n📝 Practice Exercise: ${exercise.title}`));
    console.log(chalk.white(exercise.question));

    if (exercise.type === 'MULTIPLE_CHOICE') {
      const choices = exercise.options.map((option, index) => ({
        name: `${String.fromCharCode(65 + index)}. ${option}`,
        value: index
      }));

      const { answer } = await inquirer.prompt([
        {
          type: 'list',
          name: 'answer',
          message: 'Choose your answer:',
          choices
        }
      ]);

      const isCorrect = answer === exercise.correctAnswer;
      
      if (isCorrect) {
        console.log(chalk.green('✅ Correct! Excellent work!'));
      } else {
        console.log(chalk.red(`❌ Incorrect. The correct answer is: ${String.fromCharCode(65 + exercise.correctAnswer)}. ${exercise.options[exercise.correctAnswer]}`));
      }

      if (exercise.explanation) {
        console.log(chalk.blue(`💡 Explanation: ${exercise.explanation}`));
      }

    } else if (exercise.type === 'FILL_IN_BLANK') {
      const { answer } = await inquirer.prompt([
        {
          type: 'input',
          name: 'answer',
          message: 'Your answer:'
        }
      ]);

      const isCorrect = answer.toLowerCase().trim() === exercise.correctAnswer.toLowerCase().trim();
      
      if (isCorrect) {
        console.log(chalk.green('✅ Correct! Très bien!'));
      } else {
        console.log(chalk.red(`❌ Incorrect. The correct answer is: "${exercise.correctAnswer}"`));
      }

      if (exercise.explanation) {
        console.log(chalk.blue(`💡 Explanation: ${exercise.explanation}`));
      }
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }

  static async endChatSession(sessionId) {
    try {
      await axios.post(`${ConfigManager.getApiUrl()}/ai/chat/${sessionId}/end`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });
    } catch (error) {
      // Silently handle errors when ending session
      console.log(chalk.gray('Session ended.'));
    }
  }

  static async getChatHistory(options = {}) {
    try {
      AuthService.requireAuth();
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/ai/chat/history?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch chat history');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getChatHistory(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getAIRecommendations() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/ai/recommendations`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch AI recommendations');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getAIRecommendations();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async generatePracticeQuestions(topic, level, count = 5) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/ai/generate/questions`, {
        topic,
        level,
        count,
        type: 'PRACTICE'
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to generate practice questions');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.generatePracticeQuestions(topic, level, count);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getStudyPlan() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/ai/study-plan`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch study plan');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getStudyPlan();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
