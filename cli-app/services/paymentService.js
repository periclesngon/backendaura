import axios from 'axios';
import { ConfigManager } from '../utils/config.js';
import { AuthService } from './authService.js';

export class PaymentService {
  static async getSubscription() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/subscriptions`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch subscription');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getSubscription();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createSubscription(subscriptionData) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/subscriptions`, subscriptionData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create subscription');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createSubscription(subscriptionData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async updateSubscription(subscriptionData) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.put(`${ConfigManager.getApiUrl()}/subscriptions`, subscriptionData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update subscription');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.updateSubscription(subscriptionData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async cancelSubscription() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/subscriptions`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to cancel subscription');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.cancelSubscription();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getPaymentHistory(options = {}) {
    try {
      AuthService.requireAuth();
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/payments/history?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch payment history');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getPaymentHistory(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createCoursePaymentIntent(courseId, currency = 'usd') {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/payments/course/create-intent`, {
        courseId,
        currency
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create payment intent');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createCoursePaymentIntent(courseId, currency);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async createSubscriptionPaymentIntent(tier, billingCycle, currency = 'usd') {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/payments/subscription/create-intent`, {
        tier,
        billingCycle,
        currency
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create subscription payment intent');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.createSubscriptionPaymentIntent(tier, billingCycle, currency);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async confirmPayment(paymentIntentId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/payments/confirm`, {
        paymentIntentId
      }, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to confirm payment');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.confirmPayment(paymentIntentId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getPaymentMethods() {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/payments/methods`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch payment methods');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getPaymentMethods();
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async addPaymentMethod(paymentMethodData) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.post(`${ConfigManager.getApiUrl()}/payments/methods`, paymentMethodData, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to add payment method');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.addPaymentMethod(paymentMethodData);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async removePaymentMethod(paymentMethodId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.delete(`${ConfigManager.getApiUrl()}/payments/methods/${paymentMethodId}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to remove payment method');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.removePaymentMethod(paymentMethodId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async getInvoices(options = {}) {
    try {
      AuthService.requireAuth();
      
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.limit) params.append('limit', options.limit || '10');

      const response = await axios.get(`${ConfigManager.getApiUrl()}/payments/invoices?${params}`, {
        headers: ConfigManager.getAuthHeaders()
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch invoices');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.getInvoices(options);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  static async downloadInvoice(invoiceId) {
    try {
      AuthService.requireAuth();
      
      const response = await axios.get(`${ConfigManager.getApiUrl()}/payments/invoices/${invoiceId}/download`, {
        headers: ConfigManager.getAuthHeaders(),
        responseType: 'blob'
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        await AuthService.refreshToken();
        return this.downloadInvoice(invoiceId);
      }
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }
}
