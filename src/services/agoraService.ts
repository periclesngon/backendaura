import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from 'agora-token';
import axios from 'axios';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';

export interface AgoraTokenRequest {
  channelName: string;
  uid: string | number;
  role: 'publisher' | 'subscriber';
  tokenType: 'rtc' | 'rtm';
  expiry?: number;
}

export interface AgoraTokenResponse {
  token: string;
  appId: string;
  channelName: string;
  uid: number; // Always numeric (converted from string if needed)
  originalUid?: string | number; // Original UID for reference
  role: string;
  expiry: number;
  timestamp: number;
}

export interface LiveSessionConfig {
  channelName: string;
  uid: string;
  role: 'host' | 'audience';
  enableRecording?: boolean;
  maxParticipants?: number;
}

export interface CloudRecordingConfig {
  channelName: string;
  uid: string;
  recordingConfig: {
    maxIdleTime: number;
    streamTypes: number;
    audioProfile: number;
    channelType: number;
    videoStreamType: number;
    subscribeVideoUids: string[];
    subscribeAudioUids: string[];
  };
  storageConfig: {
    vendor: number;
    region: number;
    bucket: string;
    accessKey: string;
    secretKey: string;
    fileNamePrefix: string[];
  };
}

export class AgoraService {
  private static appId = process.env.AGORA_APP_ID;
  private static appCertificate = process.env.AGORA_APP_CERTIFICATE;
  private static customerId = process.env.AGORA_CUSTOMER_ID;
  private static customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  private static baseUrl = 'https://api.agora.io';

  /**
   * Generate RTC token for video/audio calls
   */
  static generateRTCToken(request: AgoraTokenRequest): AgoraTokenResponse {
    try {
      const { channelName, uid, role, expiry = 3600 } = request;

      if (!this.appId || !this.appCertificate) {
        throw new ValidationError('Agora service is not configured. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE environment variables.');
      }

      if (!channelName) {
        throw new ValidationError('Channel name is required');
      }

      if (!uid) {
        throw new ValidationError('UID is required');
      }

      // Convert role to Agora role
      const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
      
      // Calculate expiration time
      const currentTime = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTime + expiry;

      // Generate token
      // IMPORTANT: Agora RTC requires numeric UID (0 to 2^32-1)
      // If string is provided, convert to number using hash, otherwise use the number directly
      let numericUid: number;
      if (typeof uid === 'string') {
        // Convert string to numeric UID using hash function
        let hash = 0;
        for (let i = 0; i < uid.length; i++) {
          const char = uid.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        numericUid = Math.abs(hash) % 2147483647; // Ensure within valid range
      } else {
        numericUid = uid;
      }
      
      const token = RtcTokenBuilder.buildTokenWithUid(
        this.appId,
        this.appCertificate,
        channelName,
        numericUid,
        agoraRole,
        privilegeExpiredTs,
        privilegeExpiredTs
      );

      logger.info('RTC token generated successfully', {
        channelName,
        originalUid: uid,
        numericUid: numericUid,
        role,
        expiry: privilegeExpiredTs
      });

      return {
        token,
        appId: this.appId,
        channelName,
        uid: numericUid, // Return numeric UID so frontend can use it for joining
        originalUid: uid, // Keep original for reference
        role,
        expiry: privilegeExpiredTs,
        timestamp: currentTime
      };
    } catch (error) {
      logger.error('Failed to generate RTC token', { request, error });
      throw error;
    }
  }

  /**
   * Generate RTM token for messaging
   */
  static generateRTMToken(uid: string, expiry: number = 3600): AgoraTokenResponse {
    try {
      if (!uid) {
        throw new ValidationError('UID is required for RTM token');
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTime + expiry;

      const token = RtmTokenBuilder.buildToken(
        this.appId,
        this.appCertificate,
        uid,
        privilegeExpiredTs
      );

      logger.info('RTM token generated successfully', { uid, expiry: privilegeExpiredTs });

      return {
        token,
        appId: this.appId,
        channelName: '',
        uid,
        role: 'rtm_user',
        expiry: privilegeExpiredTs,
        timestamp: currentTime
      };
    } catch (error) {
      logger.error('Failed to generate RTM token', { uid, error });
      throw error;
    }
  }

  /**
   * Start cloud recording for a live session
   */
  static async startCloudRecording(config: CloudRecordingConfig): Promise<{
    resourceId: string;
    sid: string;
  }> {
    try {
      // Check if cloud recording is configured
      if (!this.customerId || !this.customerSecret) {
        throw new ValidationError('Cloud recording is not configured. Customer ID and Secret are required.');
      }

      // Step 1: Acquire resource
      const resourceResponse = await this.acquireRecordingResource(config.channelName, config.uid);
      const resourceId = resourceResponse.resourceId;

      // Step 2: Start recording
      const startResponse = await this.startRecording(resourceId, config);

      logger.info('Cloud recording started successfully', {
        channelName: config.channelName,
        resourceId,
        sid: startResponse.sid
      });

      return {
        resourceId,
        sid: startResponse.sid
      };
    } catch (error) {
      logger.error('Failed to start cloud recording', { config, error });
      throw error;
    }
  }

  /**
   * Stop cloud recording
   */
  static async stopCloudRecording(
    channelName: string,
    uid: string,
    resourceId: string,
    sid: string
  ): Promise<{
    resourceId: string;
    sid: string;
    serverResponse: any;
  }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`,
        {
          cname: channelName,
          uid,
          clientRequest: {}
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(`${this.customerId}:${this.customerSecret}`).toString('base64')}`
          }
        }
      );

      logger.info('Cloud recording stopped successfully', {
        channelName,
        resourceId,
        sid,
        response: response.data
      });

      return {
        resourceId,
        sid,
        serverResponse: (response.data as any).serverResponse
      };
    } catch (error) {
      logger.error('Failed to stop cloud recording', { channelName, resourceId, sid, error });
      throw error;
    }
  }

  /**
   * Get recording status
   */
  static async getRecordingStatus(
    resourceId: string,
    sid: string
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/query`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.customerId}:${this.customerSecret}`).toString('base64')}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to get recording status', { resourceId, sid, error });
      throw error;
    }
  }

  /**
   * Private method to acquire recording resource
   */
  private static async acquireRecordingResource(channelName: string, uid: string): Promise<{
    resourceId: string;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/acquire`,
      {
        cname: channelName,
        uid,
        clientRequest: {
          resourceExpiredHour: 24,
          scene: 0
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.customerId}:${this.customerSecret}`).toString('base64')}`
        }
      }
    );

    return {
      resourceId: (response.data as any).resourceId || ''
    };
  }

  /**
   * Private method to start recording
   */
  private static async startRecording(resourceId: string, config: CloudRecordingConfig): Promise<{
    sid: string;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`,
      {
        cname: config.channelName,
        uid: config.uid,
        clientRequest: {
          token: this.generateRTCToken({
            channelName: config.channelName,
            uid: config.uid,
            role: 'publisher',
            tokenType: 'rtc',
            expiry: 3600
          }).token,
          recordingConfig: config.recordingConfig,
          storageConfig: config.storageConfig
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.customerId}:${this.customerSecret}`).toString('base64')}`
        }
      }
    );

    return {
      sid: (response.data as any).sid || ''
    };
  }

  /**
   * Validate Agora configuration
   */
  static validateConfiguration(): {
    isValid: boolean;
    missingFields: string[];
  } {
    const requiredFields = [
      { key: 'AGORA_APP_ID', value: this.appId },
      { key: 'AGORA_APP_CERTIFICATE', value: this.appCertificate }
    ];

    const missingFields = requiredFields
      .filter(field => !field.value)
      .map(field => field.key);

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Get Agora configuration for frontend
   */
  static getClientConfig(): {
    appId: string;
    mode: string;
    codec: string;
  } {
    return {
      appId: this.appId,
      mode: 'rtc',
      codec: 'vp8'
    };
  }
}
