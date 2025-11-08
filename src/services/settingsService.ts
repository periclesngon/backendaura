import { prisma } from '@/database/connection';
import { logger } from '@/utils/logger';

export interface AdminSettings {
  general: {
    siteName: string;
    siteDescription: string;
    maintenanceMode: boolean;
    registrationEnabled: boolean;
    defaultLanguage: string;
    timezone: string;
  };
  users: {
    maxStudentsPerManager: number;
    autoApproveRegistrations: boolean;
    sessionTimeout: number;
    passwordPolicy: {
      minLength: number;
      requireSpecialChars: boolean;
      requireNumbers: boolean;
    };
  };
  content: {
    maxFileSize: number;
    allowedFileTypes: string[];
    autoModeration: boolean;
    contentApprovalRequired: boolean;
  };
  billing: {
    currency: string;
    taxRate: number;
    stripePublicKey: string;
    paymentMethods: string[];
  };
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    adminNotifications: boolean;
  };
  security: {
    twoFactorRequired: boolean;
    sessionTimeout: number;
    ipWhitelist: string[];
    auditLogging: boolean;
  };
  system: {
    backupFrequency: string;
    logLevel: string;
    cacheEnabled: boolean;
    cdnEnabled: boolean;
  };
}

export interface ManagerSettings {
  profile: {
    name: string;
    email: string;
    phone: string;
    bio: string;
    avatar: string;
  };
  notifications: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    studentMessages: boolean;
    courseUpdates: boolean;
    systemAlerts: boolean;
    weeklyReports: boolean;
    testApprovals: boolean;
    contentModeration: boolean;
    userManagement: boolean;
    analyticsReports: boolean;
    systemMaintenance: boolean;
    newFeatures: boolean;
  };
  preferences: {
    language: string;
    timezone: string;
    dateFormat: string;
    currency: string;
    theme: string;
    density: string;
    sidebar: string;
    animations: string;
    defaultLevel: string;
    defaultSubscription: string;
    autoSave: string;
    uploadQuality: string;
    autoPreview: boolean;
    validateBeforePublishing: boolean;
    aiSuggestions: boolean;
  };
}

export class SettingsService {
  // Default admin settings
  private static defaultAdminSettings: AdminSettings = {
    general: {
      siteName: "TCF/TEF Learning Platform",
      siteDescription: "French language learning platform for TCF and TEF preparation",
      maintenanceMode: false,
      registrationEnabled: true,
      defaultLanguage: "fr",
      timezone: "Europe/Paris"
    },
    users: {
      maxStudentsPerManager: 100,
      autoApproveRegistrations: false,
      sessionTimeout: 60,
      passwordPolicy: {
        minLength: 8,
        requireSpecialChars: true,
        requireNumbers: true
      }
    },
    content: {
      maxFileSize: 0, // No limit
      allowedFileTypes: ["pdf", "doc", "docx", "mp3", "mp4", "jpg", "png"],
      autoModeration: true,
      contentApprovalRequired: false
    },
    billing: {
      currency: "EUR",
      taxRate: 20,
      stripePublicKey: "",
      paymentMethods: ["card", "sepa"]
    },
    notifications: {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      adminNotifications: true
    },
    security: {
      twoFactorRequired: false,
      sessionTimeout: 15,
      ipWhitelist: [],
      auditLogging: true
    },
    system: {
      backupFrequency: "daily",
      logLevel: "info",
      cacheEnabled: true,
      cdnEnabled: true
    }
  };

  // Default manager settings
  private static defaultManagerSettings: ManagerSettings = {
    profile: {
      name: "",
      email: "",
      phone: "",
      bio: "",
      avatar: "/placeholder.svg?height=100&width=100"
    },
    notifications: {
      emailNotifications: true,
      pushNotifications: true,
      studentMessages: true,
      courseUpdates: true,
      systemAlerts: true,
      weeklyReports: false,
      testApprovals: true,
      contentModeration: false,
      userManagement: false,
      analyticsReports: false,
      systemMaintenance: true,
      newFeatures: true
    },
    preferences: {
      language: "fr",
      timezone: "Europe/Paris",
      dateFormat: "DD/MM/YYYY",
      currency: "CFA",
      theme: "dark",
      density: "comfortable",
      sidebar: "expanded",
      animations: "enabled",
      defaultLevel: "A1",
      defaultSubscription: "Gratuit",
      autoSave: "5",
      uploadQuality: "high",
      autoPreview: true,
      validateBeforePublishing: true,
      aiSuggestions: true
    }
  };

  static async getAdminSettings(): Promise<AdminSettings> {
    try {
      // For now, return default settings
      // In a real implementation, you would fetch from database
      logger.info('Fetching admin settings');
      return this.defaultAdminSettings;
    } catch (error) {
      logger.error('Error fetching admin settings:', error);
      throw new Error('Failed to fetch admin settings');
    }
  }

  static async updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    try {
      // For now, just merge with defaults and return
      // In a real implementation, you would save to database
      logger.info('Updating admin settings');
      const updatedSettings = { ...this.defaultAdminSettings, ...settings };
      return updatedSettings;
    } catch (error) {
      logger.error('Error updating admin settings:', error);
      throw new Error('Failed to update admin settings');
    }
  }

  static async getManagerSettings(userId: string): Promise<ManagerSettings> {
    try {
      // Fetch user data and merge with default settings
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const settings = { ...this.defaultManagerSettings };
      settings.profile.name = `${user.firstName} ${user.lastName}`;
      settings.profile.email = user.email;
      settings.profile.phone = user.phone || '';

      logger.info('Fetching manager settings for user:', userId);
      return settings;
    } catch (error) {
      logger.error('Error fetching manager settings:', error);
      throw new Error('Failed to fetch manager settings');
    }
  }

  static async updateManagerSettings(userId: string, settings: Partial<ManagerSettings>): Promise<ManagerSettings> {
    try {
      // Update user profile if provided
      if (settings.profile) {
        const nameParts = settings.profile.name?.split(' ') || [];
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        await prisma.user.update({
          where: { id: userId },
          data: {
            firstName,
            lastName,
            phone: settings.profile.phone
          }
        });
      }

      // For now, just merge with defaults and return
      // In a real implementation, you would save preferences to database
      logger.info('Updating manager settings for user:', userId);
      const updatedSettings = { ...this.defaultManagerSettings, ...settings };
      return updatedSettings;
    } catch (error) {
      logger.error('Error updating manager settings:', error);
      throw new Error('Failed to update manager settings');
    }
  }
}
