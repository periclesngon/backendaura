import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import chalk from 'chalk';

export class AuthService {
  static async login(email, password) {
    try {
      const response = await axios.post(`${ConfigManager.getApiUrl()}/auth/login`, {
        email,
        password
      });

      if (response.data.success) {
        // Store authentication token
        ConfigManager.setToken(response.data.data.tokens.accessToken);
        ConfigManager.setRefreshToken(response.data.data.tokens.refreshToken);
        ConfigManager.setUser(response.data.data.user);

        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Login failed');
      }
    } catch (error) {
      if (error.response?.data?.error?.message) {
        throw new Error(error.response.data.error.message);
      }
      throw new Error(error.message || 'Network error during login');
    }
  }

  static async register(userData) {
    try {
      const response = await axios.post(`${ConfigManager.getApiUrl()}/auth/register`, userData);

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Registration failed');
      }
    } catch (error) {
      if (error.response?.data?.error?.message) {
        throw new Error(error.response.data.error.message);
      }
      throw new Error(error.message || 'Network error during registration');
    }
  }

  static async logout() {
    try {
      const token = ConfigManager.getToken();
      if (token) {
        await axios.post(`${ConfigManager.getApiUrl()}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      ConfigManager.clearAuth();
      return true;
    } catch (error) {
      // Clear local auth even if server request fails
      ConfigManager.clearAuth();
      throw new Error(error.response?.data?.error?.message || 'Logout failed');
    }
  }

  static async refreshToken() {
    try {
      const refreshToken = ConfigManager.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post(`${ConfigManager.getApiUrl()}/auth/refresh`, {
        refreshToken
      });

      if (response.data.success) {
        ConfigManager.setToken(response.data.data.accessToken);
        return response.data.data.accessToken;
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      ConfigManager.clearAuth();
      throw new Error('Session expired. Please login again.');
    }
  }

  static async registerAdmin(userData) {
    try {
      const token = ConfigManager.getToken();
      const response = await axios.post(`${ConfigManager.getApiUrl()}/auth/register-admin`, userData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Admin registration failed');
      }
    } catch (error) {
      if (error.response?.data?.error?.message) {
        throw new Error(error.response.data.error.message);
      }
      throw new Error(error.message || 'Network error during admin registration');
    }
  }

  static isAuthenticated() {
    return !!ConfigManager.getToken();
  }

  static getCurrentUser() {
    return ConfigManager.getUser();
  }

  static async validateToken() {
    try {
      const token = ConfigManager.getToken();
      if (!token) return false;

      const response = await axios.get(`${ConfigManager.getApiUrl()}/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.data.success;
    } catch (error) {
      return false;
    }
  }

  static hasRole(requiredRole) {
    const user = ConfigManager.getUser();
    if (!user) return false;

    const roleHierarchy = {
      'STUDENT': 1,
      'JUNIOR_MANAGER': 2,
      'SENIOR_MANAGER': 3,
      'ADMIN': 4
    };

    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }

  static requireAuth() {
    if (!this.isAuthenticated()) {
      console.log(chalk.red('❌ Authentication required. Please login first.'));
      console.log(chalk.yellow('💡 Use: tcf-cli login'));
      process.exit(1);
    }
  }

  static requireRole(role) {
    this.requireAuth();
    
    if (!this.hasRole(role)) {
      console.log(chalk.red(`❌ Access denied. ${role} role required.`));
      process.exit(1);
    }
  }
}
