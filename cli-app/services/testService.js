import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class TestService {
  static async getAvailableTests() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch tests');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getAvailableTests();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getTestResults(options = {}) {
    try {
      AuthService.requireAuth();
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');
      if (options.testType) params.append('testType', options.testType);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/results?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch test results');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getTestResults(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async startTCFTest() {
    try {
      console.log(chalk.blue('\n🎯 Starting TCF Test'));
      console.log(chalk.gray('─'.repeat(50)));

      const { level } = await inquirer.prompt([
        {
          type: 'list',
          name: 'level',
          message: 'Select your target level:',
          choices: [
            { name: 'A1 - Beginner', value: 'A1' },
            { name: 'A2 - Elementary', value: 'A2' },
            { name: 'B1 - Intermediate', value: 'B1' },
            { name: 'B2 - Upper Intermediate', value: 'B2' },
            { name: 'C1 - Advanced', value: 'C1' },
            { name: 'C2 - Proficient', value: 'C2' }
          ]
        }
      ]);

      const spinner = ora('Preparing TCF test...').start();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/tests/tcf/start`, {
        level,
        testType: 'TCF'
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      spinner.stop();

      if (response.data.success) {
        const testSession = response.data.data;
        console.log(chalk.green('✅ TCF Test started successfully!'));
        console.log(chalk.blue(`Test ID: ${testSession.id}`));
        console.log(chalk.yellow(`Duration: ${testSession.duration} minutes`));
        console.log(chalk.gray('You can continue this test later using the test ID.'));
        
        return testSession;
      } else {
        throw new Error(response.data.error?.message || 'Failed to start TCF test');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.startTCFTest();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async startTEFTest() {
    try {
      console.log(chalk.blue('\n🎯 Starting TEF Test'));
      console.log(chalk.gray('─'.repeat(50)));

      const { level } = await inquirer.prompt([
        {
          type: 'list',
          name: 'level',
          message: 'Select your target level:',
          choices: [
            { name: 'A1 - Beginner', value: 'A1' },
            { name: 'A2 - Elementary', value: 'A2' },
            { name: 'B1 - Intermediate', value: 'B1' },
            { name: 'B2 - Upper Intermediate', value: 'B2' },
            { name: 'C1 - Advanced', value: 'C1' },
            { name: 'C2 - Proficient', value: 'C2' }
          ]
        }
      ]);

      const spinner = ora('Preparing TEF test...').start();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/tests/tef/start`, {
        level,
        testType: 'TEF'
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      spinner.stop();

      if (response.data.success) {
        const testSession = response.data.data;
        console.log(chalk.green('✅ TEF Test started successfully!'));
        console.log(chalk.blue(`Test ID: ${testSession.id}`));
        console.log(chalk.yellow(`Duration: ${testSession.duration} minutes`));
        console.log(chalk.gray('You can continue this test later using the test ID.'));
        
        return testSession;
      } else {
        throw new Error(response.data.error?.message || 'Failed to start TEF test');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.startTEFTest();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async continueTest(testId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/${testId}/continue`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to continue test');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.continueTest(testId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async submitTestAnswer(testId, questionId, answer) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/tests/${testId}/answer`, {
        questionId,
        answer
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to submit answer');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.submitTestAnswer(testId, questionId, answer);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async finishTest(testId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/tests/${testId}/finish`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to finish test');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.finishTest(testId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getTestById(testId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/${testId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch test');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getTestById(testId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getTestStatistics() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/statistics`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch test statistics');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getTestStatistics();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getPracticeQuestions(level, category) {
    try {
      AuthService.requireAuth();
      
      const params = new URLSearchParams();
      if (level) params.append('level', level);
      if (category) params.append('category', category);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/practice?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch practice questions');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getPracticeQuestions(level, category);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getCertificates() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/certificates`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch certificates');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getCertificates();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async downloadCertificate(certificateId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/tests/certificates/${certificateId}/download`, {
        headers: ConfigManager.getAuthHeaders(),
        responseType: 'blob'
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.downloadCertificate(certificateId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
