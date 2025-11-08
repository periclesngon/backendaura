import { Request, Response } from 'express';
import { AgoraService } from '../services/agoraService';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export class AgoraController {
  /**
   * Generate RTC token for video/audio calls
   */
  static async generateRTCToken(req: Request, res: Response): Promise<void> {
    try {
      const { channelName, uid, role, expiry } = req.body;

      if (!channelName) {
        throw new ValidationError('Channel name is required');
      }

      if (!uid) {
        throw new ValidationError('UID is required');
      }

      if (!role || !['publisher', 'subscriber'].includes(role)) {
        throw new ValidationError('Role must be either "publisher" or "subscriber"');
      }

      const tokenResponse = AgoraService.generateRTCToken({
        channelName,
        uid,
        role,
        tokenType: 'rtc',
        expiry: expiry ? parseInt(expiry) : 3600
      });

      res.status(200).json({
        success: true,
        data: tokenResponse,
        message: 'RTC token generated successfully'
      });
    } catch (error) {
      logger.error('Failed to generate RTC token', { body: req.body, error });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to generate RTC token',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'TOKEN_GENERATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Generate RTM token for messaging
   */
  static async generateRTMToken(req: Request, res: Response): Promise<void> {
    try {
      const { uid, expiry } = req.body;

      if (!uid) {
        throw new ValidationError('UID is required');
      }

      const tokenResponse = AgoraService.generateRTMToken(
        uid,
        expiry ? parseInt(expiry) : 3600
      );

      res.status(200).json({
        success: true,
        data: tokenResponse,
        message: 'RTM token generated successfully'
      });
    } catch (error) {
      logger.error('Failed to generate RTM token', { body: req.body, error });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to generate RTM token',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'TOKEN_GENERATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Start cloud recording for a live session
   */
  static async startRecording(req: Request, res: Response): Promise<void> {
    try {
      const { channelName, uid, recordingConfig, storageConfig } = req.body;

      if (!channelName) {
        throw new ValidationError('Channel name is required');
      }

      if (!uid) {
        throw new ValidationError('UID is required');
      }

      const recordingResponse = await AgoraService.startCloudRecording({
        channelName,
        uid,
        recordingConfig: recordingConfig || {
          maxIdleTime: 30,
          streamTypes: 2,
          audioProfile: 1,
          channelType: 0,
          videoStreamType: 0,
          subscribeVideoUids: [],
          subscribeAudioUids: []
        },
        storageConfig: storageConfig || {
          vendor: 1,
          region: 0,
          bucket: process.env.AGORA_RECORDING_BUCKET || 'agora-recordings',
          accessKey: process.env.AGORA_RECORDING_ACCESS_KEY || '',
          secretKey: process.env.AGORA_RECORDING_SECRET_KEY || '',
          fileNamePrefix: ['recordings']
        }
      });

      res.status(200).json({
        success: true,
        data: recordingResponse,
        message: 'Cloud recording started successfully'
      });
    } catch (error) {
      logger.error('Failed to start cloud recording', { body: req.body, error });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to start cloud recording',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'RECORDING_START_ERROR'
          }
        });
      }
    }
  }

  /**
   * Stop cloud recording
   */
  static async stopRecording(req: Request, res: Response): Promise<void> {
    try {
      const { channelName, uid, resourceId, sid } = req.body;

      if (!channelName || !uid || !resourceId || !sid) {
        throw new ValidationError('Channel name, UID, resource ID, and SID are required');
      }

      const stopResponse = await AgoraService.stopCloudRecording(
        channelName,
        uid,
        resourceId,
        sid
      );

      res.status(200).json({
        success: true,
        data: stopResponse,
        message: 'Cloud recording stopped successfully'
      });
    } catch (error) {
      logger.error('Failed to stop cloud recording', { body: req.body, error });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to stop cloud recording',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'RECORDING_STOP_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get recording status
   */
  static async getRecordingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { resourceId, sid } = req.params;

      if (!resourceId || !sid) {
        throw new ValidationError('Resource ID and SID are required');
      }

      const status = await AgoraService.getRecordingStatus(resourceId, sid);

      res.status(200).json({
        success: true,
        data: status,
        message: 'Recording status retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get recording status', { params: req.params, error });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get recording status',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'RECORDING_STATUS_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get Agora configuration for frontend
   */
  static async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = AgoraService.getClientConfig();
      const validation = AgoraService.validateConfiguration();

      res.status(200).json({
        success: true,
        data: {
          ...config,
          isConfigured: validation.isValid,
          missingFields: validation.missingFields
        },
        message: 'Agora configuration retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get Agora configuration', { error });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get Agora configuration',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'CONFIG_ERROR'
        }
      });
    }
  }

  /**
   * Health check for Agora service
   */
  static async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const validation = AgoraService.validateConfiguration();

      res.status(200).json({
        success: true,
        data: {
          service: 'agora',
          status: validation.isValid ? 'healthy' : 'misconfigured',
          features: {
            rtcTokenGeneration: validation.isValid,
            rtmTokenGeneration: validation.isValid,
            cloudRecording: validation.isValid && !!process.env.AGORA_CUSTOMER_ID,
            liveStreaming: validation.isValid
          },
          configuration: {
            appIdConfigured: !!process.env.AGORA_APP_ID,
            appCertificateConfigured: !!process.env.AGORA_APP_CERTIFICATE,
            customerIdConfigured: !!process.env.AGORA_CUSTOMER_ID,
            customerSecretConfigured: !!process.env.AGORA_CUSTOMER_SECRET
          },
          missingFields: validation.missingFields
        },
        message: validation.isValid ? 'Agora service is healthy' : 'Agora service needs configuration'
      });
    } catch (error) {
      logger.error('Agora health check failed', { error });

      res.status(500).json({
        success: false,
        error: {
          message: 'Agora health check failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'HEALTH_CHECK_ERROR'
        }
      });
    }
  }
}
