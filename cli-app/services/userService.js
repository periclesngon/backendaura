import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';

export class UserService {
  static async getProfile() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/users/profile`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data.user;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch profile');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getProfile();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateProfile(profileData) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/users/profile`, profileData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data.user;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update profile');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateProfile(profileData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getDashboard() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/users/dashboard`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch dashboard');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getDashboard();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getUsers(options = {}) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');
      if (options.search) params.append('search', options.search);
      if (options.role) params.append('role', options.role);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/users?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch users');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getUsers(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getUserById(userId) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/users/${userId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch user');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getUserById(userId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateUser(userId, userData) {
    try {
      AuthService.requireRole('SENIOR_MANAGER');
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/users/${userId}`, userData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update user');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateUser(userId, userData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async deleteUser(userId) {
    try {
      AuthService.requireRole('ADMIN');
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/users/${userId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to delete user');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.deleteUser(userId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async changePassword(currentPassword, newPassword) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/users/password`, {
        currentPassword,
        newPassword
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to change password');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.changePassword(currentPassword, newPassword);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getUserProgress() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/users/progress`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch user progress');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getUserProgress();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getUserAchievements() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/users/achievements`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch achievements');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getUserAchievements();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
