import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';

export class ManagerService {
  static async getDashboard() {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/dashboard`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch manager dashboard');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getDashboard();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getStudents(options = {}) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');
      if (options.search) params.append('search', options.search);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/students?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch students');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getStudents(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getCourses(options = {}) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/courses?${params}`, {
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

  static async getLiveSessions(options = {}) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');
      if (options.status) params.append('status', options.status);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/live-sessions?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch live sessions');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getLiveSessions(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createLiveSession(sessionData) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/live-sessions`, sessionData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create live session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createLiveSession(sessionData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateLiveSession(sessionId, sessionData) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}`, sessionData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update live session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateLiveSession(sessionId, sessionData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async deleteLiveSession(sessionId) {
    try {
      AuthService.requireRole('SENIOR_MANAGER');
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/live-sessions/${sessionId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to delete live session');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.deleteLiveSession(sessionId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getAnalytics(options = {}) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (options.period) params.append('period', options.period);
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/analytics?${params}`, {
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

  static async generateReport(reportConfig) {
    try {
      AuthService.requireRole('SENIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/manager/analytics/reports`, reportConfig, {
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
      AuthService.requireRole('SENIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (exportConfig.type) params.append('type', exportConfig.type);
      if (exportConfig.format) params.append('format', exportConfig.format);

      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/analytics/export?${params}`, {
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

  static async getActivity(options = {}) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/manager/activity?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch activity');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getActivity(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async assignCourse(studentId, courseId) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/manager/assign-course`, {
        studentId,
        courseId
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to assign course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.assignCourse(studentId, courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async unassignCourse(studentId, courseId) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/manager/assign-course`, {
        data: { studentId, courseId },
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to unassign course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.unassignCourse(studentId, courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
