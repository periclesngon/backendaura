import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';

export class AdminService {
  static async getDashboard() {
    try {
      AuthService.requireRole('ADMIN');
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/dashboard`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch admin dashboard');
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
      AuthService.requireRole('ADMIN');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');
      if (options.search) params.append('search', options.search);
      if (options.role) params.append('role', options.role);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/users?${params}`, {
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

  static async getCourses(options = {}) {
    try {
      AuthService.requireRole('ADMIN');

      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/courses?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch courses');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getCourses(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getManagers(options = {}) {
    try {
      AuthService.requireRole('ADMIN');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/managers?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch managers');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getManagers(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createManager(managerData) {
    try {
      AuthService.requireRole('ADMIN');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/admin/managers`, managerData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create manager');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createManager(managerData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateManager(managerId, managerData) {
    try {
      AuthService.requireRole('ADMIN');
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/admin/managers/${managerId}`, managerData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update manager');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateManager(managerId, managerData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async deleteManager(managerId) {
    try {
      AuthService.requireRole('ADMIN');
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/admin/managers/${managerId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to delete manager');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.deleteManager(managerId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getAnalytics(options = {}) {
    try {
      AuthService.requireRole('ADMIN');
      
      const params = new URLSearchParams();
      if (options.period) params.append('period', options.period);
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/analytics?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch analytics');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getAnalytics(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createCourse(courseData) {
    try {
      AuthService.requireRole('ADMIN');

      const response = await axios.post(`${ConfigManager.getApiUrl()}/courses`, courseData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data.course;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createCourse(courseData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateUserRole(userId, newRole) {
    try {
      AuthService.requireRole('ADMIN');

      const response = await axios.put(`${ConfigManager.getApiUrl()}/users/${userId}/role`,
        { role: newRole },
        { headers: ConfigManager.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data.data.user;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update user role');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateUserRole(userId, newRole);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async resetUserPassword(userId, newPassword) {
    try {
      AuthService.requireRole('ADMIN');

      // Note: This functionality may need to be implemented in the backend
      // For now, we'll return a placeholder response
      throw new Error('Password reset functionality not yet implemented in backend');
    } catch (error) {
      throw new Error(error.message);
    }
  }

  static async getSystemHealth() {
    try {
      AuthService.requireRole('ADMIN');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/system/health`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch system health');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getSystemHealth();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getBusinessMetrics(options = {}) {
    try {
      AuthService.requireRole('ADMIN');
      
      const params = new URLSearchParams();
      if (options.period) params.append('period', options.period);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/metrics/business?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch business metrics');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getBusinessMetrics(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async generateReport(reportConfig) {
    try {
      AuthService.requireRole('ADMIN');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/admin/analytics/reports`, reportConfig, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to generate report');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.generateReport(reportConfig);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async exportData(exportConfig) {
    try {
      AuthService.requireRole('ADMIN');
      
      const params = new URLSearchParams();
      if (exportConfig.type) params.append('type', exportConfig.type);
      if (exportConfig.format) params.append('format', exportConfig.format);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/admin/analytics/export?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to export data');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.exportData(exportConfig);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
