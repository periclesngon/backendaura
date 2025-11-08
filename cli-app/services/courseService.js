import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';

export class CourseService {
  static async getCourses(options = {}) {
    try {
      const params = new URLSearchParams();
      
      if (options.level) params.append('level', options.level);
      if (options.category) params.append('category', options.category);
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

  static async getCourse(courseId) {
    try {
      const response = await axios.get(`${ConfigManager.getApiUrl()}/courses/${courseId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getCourse(courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getEnrolledCourses() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/courses/enrolled`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch enrolled courses');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getEnrolledCourses();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async enrollInCourse(courseId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/courses/${courseId}/enroll`, {}, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to enroll in course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.enrollInCourse(courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async unenrollFromCourse(courseId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/courses/${courseId}/enroll`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to unenroll from course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.unenrollFromCourse(courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createCourse(courseData) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/courses`, courseData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
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

  static async updateCourse(courseId, courseData) {
    try {
      AuthService.requireRole('JUNIOR_MANAGER');
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/courses/${courseId}`, courseData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateCourse(courseId, courseData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async deleteCourse(courseId) {
    try {
      AuthService.requireRole('SENIOR_MANAGER');
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/courses/${courseId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to delete course');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.deleteCourse(courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getCourseProgress(courseId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/courses/${courseId}/progress`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch course progress');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getCourseProgress(courseId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async searchCourses(query, filters = {}) {
    try {
      const params = new URLSearchParams();
      params.append('q', query);
      
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });

      const response = await axios.get(`${ConfigManager.getApiUrl()}/search/courses?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to search courses');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.searchCourses(query, filters);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
