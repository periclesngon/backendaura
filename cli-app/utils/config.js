import fs from 'fs';
import path from 'path';
import os from 'os';

export class ConfigManager {
  static configDir = path.join(os.homedir(), '.tcf-cli');
  static configFile = path.join(this.configDir, 'config.json');
  static config = {};

  static init() {
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Load existing config or create default
    if (fs.existsSync(this.configFile)) {
      try {
        const configData = fs.readFileSync(this.configFile, 'utf8');
        this.config = JSON.parse(configData);
      } catch (error) {
        console.warn('Warning: Could not load config file, using defaults');
        this.config = this.getDefaultConfig();
      }
    } else {
      this.config = this.getDefaultConfig();
      this.saveConfig();
    }
  }

  static getDefaultConfig() {
    return {
      apiUrl: 'http://localhost:3001/api',
      timeout: 30000,
      retries: 3,
      auth: {
        token: null,
        refreshToken: null,
        user: null,
        expiresAt: null
      },
      preferences: {
        theme: 'default',
        language: 'en',
        pageSize: 10,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h'
      }
    };
  }

  static saveConfig() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.warn('Warning: Could not save config file');
    }
  }

  static getApiUrl() {
    return this.config.apiUrl || 'http://localhost:3001/api';
  }

  static setApiUrl(url) {
    this.config.apiUrl = url;
    this.saveConfig();
  }

  static getToken() {
    return this.config.auth?.token;
  }

  static setToken(token) {
    if (!this.config.auth) this.config.auth = {};
    this.config.auth.token = token;
    this.config.auth.expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    this.saveConfig();
  }

  static getRefreshToken() {
    return this.config.auth?.refreshToken;
  }

  static setRefreshToken(refreshToken) {
    if (!this.config.auth) this.config.auth = {};
    this.config.auth.refreshToken = refreshToken;
    this.saveConfig();
  }

  static getUser() {
    return this.config.auth?.user;
  }

  static setUser(user) {
    if (!this.config.auth) this.config.auth = {};
    this.config.auth.user = user;
    this.saveConfig();
  }

  static clearAuth() {
    this.config.auth = {
      token: null,
      refreshToken: null,
      user: null,
      expiresAt: null
    };
    this.saveConfig();
  }

  static getAuthHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  static isTokenExpired() {
    const expiresAt = this.config.auth?.expiresAt;
    return !expiresAt || Date.now() > expiresAt;
  }

  static getTimeout() {
    return this.config.timeout || 30000;
  }

  static setTimeout(timeout) {
    this.config.timeout = timeout;
    this.saveConfig();
  }

  static getRetries() {
    return this.config.retries || 3;
  }

  static setRetries(retries) {
    this.config.retries = retries;
    this.saveConfig();
  }

  static getPreference(key) {
    return this.config.preferences?.[key];
  }

  static setPreference(key, value) {
    if (!this.config.preferences) this.config.preferences = {};
    this.config.preferences[key] = value;
    this.saveConfig();
  }

  static getPageSize() {
    return this.getPreference('pageSize') || 10;
  }

  static setPageSize(size) {
    this.setPreference('pageSize', size);
  }

  static getTheme() {
    return this.getPreference('theme') || 'default';
  }

  static setTheme(theme) {
    this.setPreference('theme', theme);
  }

  static getLanguage() {
    return this.getPreference('language') || 'en';
  }

  static setLanguage(language) {
    this.setPreference('language', language);
  }

  static getDateFormat() {
    return this.getPreference('dateFormat') || 'YYYY-MM-DD';
  }

  static setDateFormat(format) {
    this.setPreference('dateFormat', format);
  }

  static getTimeFormat() {
    return this.getPreference('timeFormat') || '24h';
  }

  static setTimeFormat(format) {
    this.setPreference('timeFormat', format);
  }

  static resetConfig() {
    this.config = this.getDefaultConfig();
    this.saveConfig();
  }

  static exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  static importConfig(configString) {
    try {
      const importedConfig = JSON.parse(configString);
      this.config = { ...this.getDefaultConfig(), ...importedConfig };
      this.saveConfig();
      return true;
    } catch (error) {
      return false;
    }
  }

  static getConfigPath() {
    return this.configFile;
  }

  static getConfigDir() {
    return this.configDir;
  }

  static validateConfig() {
    const required = ['apiUrl'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required config: ${missing.join(', ')}`);
    }

    return true;
  }
}
