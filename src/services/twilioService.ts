import twilio from 'twilio';
import { logger } from '@/utils/logger';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export class TwilioService {
  /**
   * Check if Twilio is configured
   */
  static isConfigured(): boolean {
    return client !== null && !!twilioPhoneNumber;
  }

  /**
   * Send SMS message
   */
  static async sendSMS(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isConfigured()) {
      logger.warn('Twilio not configured, SMS sending skipped', { to });
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      // Format phone number (ensure it starts with +)
      const formattedPhone = to.startsWith('+') ? to : `+${to}`;

      const result = await client!.messages.create({
        body: message,
        from: twilioPhoneNumber!,
        to: formattedPhone
      });

      logger.info('SMS sent successfully', {
        to: formattedPhone,
        messageId: result.sid
      });

      return {
        success: true,
        messageId: result.sid
      };
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        to,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      };
    }
  }

  /**
   * Send password reset code via SMS
   */
  static async sendPasswordResetCode(phone: string, code: string, firstName?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const name = firstName ? `${firstName}, ` : '';
    const message = `${name}Votre code de réinitialisation AURA.CA est: ${code}. Ce code expire dans 5 minutes. Ne partagez jamais ce code.`;

    return this.sendSMS(phone, message);
  }

  /**
   * Send password reset code via SMS (English)
   */
  static async sendPasswordResetCodeEn(phone: string, code: string, firstName?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const name = firstName ? `${firstName}, ` : '';
    const message = `${name}Your AURA.CA password reset code is: ${code}. This code expires in 5 minutes. Never share this code.`;

    return this.sendSMS(phone, message);
  }
}

export default TwilioService;
