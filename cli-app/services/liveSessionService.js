import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class LiveSessionService {
  static async getUpcomingSessions(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');
      if (options.level) params.append('level', options.level);
      if (options.category) params.append('category', options.category);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/live-sessions/upcoming?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch upcoming sessions');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getUpcomingSessions(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getRegisteredSessions() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/live-sessions/registered`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch registered sessions');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getRegisteredSessions();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async registerForSession() {
    try {
      AuthService.requireAuth();
      
      // First, get upcoming sessions
      const sessions = await this.getUpcomingSessions({ limit: 20 });
      
      if (!sessions || sessions.length === 0) {
        console.log(chalk.yellow('No upcoming sessions available for registration.'));
        return;
      }

      const { sessionId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'sessionId',
          message: 'Select a session to register for:',
          choices: sessions.map(session => ({
            name: `${session.title} - ${new Date(session.date).toLocaleString()} (${session.duration}min)`,
            value: session.id
          }))
        }
      ]);

      const spinner = ora('Registering for session...').start();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}/register`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });

      spinner.stop();

      if (response.data.success) {
        console.log(chalk.green('✅ Successfully registered for the live session!'));
        console.log(chalk.blue('You will receive a notification before the session starts.'));
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to register for session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.registerForSession();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async unregisterFromSession(sessionId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}/register`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to unregister from session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.unregisterFromSession(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async joinSession() {
    try {
      AuthService.requireAuth();
      
      // Get registered sessions that are live or starting soon
      const sessions = await this.getRegisteredSessions();
      
      if (!sessions || sessions.length === 0) {
        console.log(chalk.yellow('You are not registered for any sessions.'));
        console.log(chalk.blue('Use the register option to join upcoming sessions.'));
        return;
      }

      // Filter for sessions that can be joined (live or starting within 15 minutes)
      const now = new Date();
      const joinableSessions = sessions.filter(session => {
        const sessionDate = new Date(session.date);
        const timeDiff = sessionDate.getTime() - now.getTime();
        const minutesDiff = timeDiff / (1000 * 60);
        
        return session.status === 'LIVE' || (session.status === 'SCHEDULED' && minutesDiff <= 15 && minutesDiff >= -5);
      });

      if (joinableSessions.length === 0) {
        console.log(chalk.yellow('No sessions available to join right now.'));
        console.log(chalk.blue('Sessions can be joined 15 minutes before they start.'));
        return;
      }

      const { sessionId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'sessionId',
          message: 'Select a session to join:',
          choices: joinableSessions.map(session => ({
            name: `${session.title} - ${session.status === 'LIVE' ? '🔴 LIVE' : '📅 Starting Soon'}`,
            value: session.id
          }))
        }
      ]);

      const spinner = ora('Joining session...').start();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}/join`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });

      spinner.stop();

      if (response.data.success) {
        const joinData = response.data.data;
        console.log(chalk.green('✅ Successfully joined the live session!'));
        console.log(chalk.blue(`Session URL: ${joinData.sessionUrl || 'Check your email for the link'}`));
        console.log(chalk.yellow(`Session Token: ${joinData.token || 'N/A'}`));
        console.log(chalk.gray('The session will open in your default browser.'));
        
        return joinData;
      } else {
        throw new Error(response.data.error?.message || 'Failed to join session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.joinSession();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getSessionById(sessionId) {
    try {
      const response = await axios.get(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getSessionById(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createSession(sessionData) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/live-sessions`, sessionData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createSession(sessionData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateSession(sessionId, sessionData) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}`, sessionData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateSession(sessionId, sessionData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async deleteSession(sessionId) {
    try {
      AuthService.requireRole('SENIOR_MANAGER');
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to delete session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.deleteSession(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getSessionParticipants(sessionId) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}/participants`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch session participants');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getSessionParticipants(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async startSession(sessionId) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}/start`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to start session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.startSession(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async endSession(sessionId) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}/end`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to end session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.endSession(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
