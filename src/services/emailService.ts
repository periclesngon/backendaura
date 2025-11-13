import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import TemporaryTokenService from './temporaryTokenService';
import fs from 'fs';
import path from 'path';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
}

export interface WelcomeEmailData {
  firstName: string;
  lastName: string;
  email: string;
  loginUrl: string;
}

export interface CourseEnrollmentEmailData {
  firstName: string;
  email: string;
  courseName: string;
  courseUrl: string;
  instructorName: string;
}

export interface LiveSessionEmailData {
  firstName: string;
  email: string;
  sessionTitle: string;
  sessionDate: string;
  sessionTime: string;
  joinUrl: string;
  duration: number;
}

export interface TestResultEmailData {
  firstName: string;
  email: string;
  testName: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  level: string;
  recommendations: string[];
}

export interface VoiceSimulationBookingEmailData {
  firstName: string;
  email: string;
  scheduledDate: Date;
  voicePreference: string;
  duration: string;
  simulationId?: string;
  accessUrl?: string;
}

export interface VoiceSimulationReschedulingEmailData {
  firstName: string;
  email: string;
  scheduledDate: Date;
  voicePreference: string;
  duration: string;
  simulationId?: string;
  accessUrl?: string;
}

export interface VoiceSimulationReminderEmailData {
  firstName: string;
  email: string;
  scheduledDate: Date;
  simulationId: string;
  userId: string;
}

export interface VoiceSimulationResultsEmailData {
  firstName: string;
  email: string;
  overallScore: number;
  fluencyScore: number;
  grammarScore: number;
  vocabularyScore: number;
  pronunciationScore: number;
  coherenceScore: number;
  feedback: string;
  completedAt: Date;
}

export interface ImmigrationSimulationReschedulingEmailData {
  to: string;
  firstName: string;
  lastName: string;
  country: string;
  immigrationType: string;
  scheduledDate: Date;
  duration: string;
  simulationId: string;
  accessUrl: string;
}

export interface ImmigrationSimulationConfirmationEmailData {
  firstName: string;
  email: string;
  country: string;
  immigrationType: string;
  scheduledDate: Date;
  simulationId: string;
  userId: string;
}

export interface ImmigrationSimulationReminderEmailData {
  firstName: string;
  email: string;
  country: string;
  immigrationType: string;
  scheduledDate: Date;
  simulationId: string;
  userId: string;
}

export interface ImmigrationSimulationResultsEmailData {
  firstName: string;
  email: string;
  country: string;
  immigrationType: string;
  finalScore: number;
  feedback: string;
  completedAt: Date;
  simulationId: string;
}

export interface OneOnOneSessionEmailData {
  firstName: string;
  email: string;
  sessionTitle: string;
  instructorName: string;
  sessionDate: string;
  sessionTime: string;
  secureLink: string;
  duration: number;
}

export class EmailService {
  private static transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.TWILIO_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || process.env.TWILIO_SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.TWILIO_SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || process.env.TWILIO_SMTP_USER,
      pass: process.env.SMTP_PASS || process.env.TWILIO_SMTP_PASS
    },
    // Configuration Twilio SendGrid si disponible
    ...(process.env.TWILIO_SMTP_HOST && {
      pool: true,
      maxConnections: 1,
      rateDelta: 1000,
      rateLimit: 14
    })
  });

  private static fromAddress = `${process.env.EMAIL_FROM_NAME || 'AURA.CA'} <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || process.env.TWILIO_SMTP_USER || 'noreply@tcftef.com'}>`;
  
  private static replyToAddress = process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM_ADDRESS || 'periclesngon01@gmail.com';

  /**
   * Get logo as base64 data URI for emails (embedded directly)
   */
  private static getLogoDataUri(): string {
    try {
      // Try multiple possible paths for the logo
      const possiblePaths = [
        path.join(process.cwd(), '../../frontend/public/logo/AURA.CA.png'),
        path.join(process.cwd(), '../frontend/public/logo/AURA.CA.png'),
        path.join(process.cwd(), 'frontend/public/logo/AURA.CA.png'),
        path.join(process.cwd(), 'public/logo/AURA.CA.png'),
        path.join(__dirname, '../../frontend/public/logo/AURA.CA.png'),
        path.join(__dirname, '../../../frontend/public/logo/AURA.CA.png'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          const logoBuffer = fs.readFileSync(logoPath);
          const base64 = logoBuffer.toString('base64');
          logger.info('Logo loaded successfully from:', logoPath);
          return `data:image/png;base64,${base64}`;
        }
      }
      
      // If logo not found, log warning and return empty string
      logger.warn('Logo file not found in any of the expected paths. Using text fallback.');
      return '';
    } catch (error) {
      logger.error('Error loading logo for email', { error });
      return '';
    }
  }

  /**
   * Wrap email HTML content with professional design (no emojis, clean layout)
   */
  private static wrapEmailWithProfessionalDesign(htmlContent: string): string {
    const logoDataUri = this.getLogoDataUri();
    
    // Extract body content from existing HTML (remove DOCTYPE, html, head, body tags if present)
    let bodyContent = htmlContent;
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      bodyContent = bodyMatch[1];
    }
    
    // Remove any existing wrapper divs that might be in the content
    bodyContent = bodyContent.replace(/<div[^>]*class="[^"]*container[^"]*"[^>]*>/gi, '');
    bodyContent = bodyContent.replace(/<\/div>/gi, '');
    
    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email AURA Learning Platform</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: Inter, "Noto Sans", sans-serif;
                background-color: #f5f8f6;
                margin: 0;
                padding: 0;
            }
            .email-container {
                max-width: 960px;
                margin: 0 auto;
                padding: 20px;
            }
            .email-wrapper { 
                background: white;
                border-radius: 0.75rem;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
            .email-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 40px;
                border-bottom: 1px solid #e5e7eb;
            }
            .logo-section {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            .logo-icon {
                width: 24px;
                height: 24px;
                color: #1A1A1A;
            }
            .logo-text {
                color: #1A1A1A;
                font-size: 18px;
                font-weight: 700;
                line-height: 1.2;
                letter-spacing: -0.015em;
            }
            .email-main {
                padding: 40px;
            }
            .email-footer {
                border-top: 1px solid #e5e7eb;
                padding: 24px 40px;
                margin-top: 24px;
            }
            .footer-links {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 24px;
                text-align: center;
            }
            .footer-link {
                color: #64748b;
                font-size: 14px;
                text-decoration: none;
                transition: color 0.2s;
            }
            .footer-link:hover {
                color: #06f957;
            }
            .footer-divider {
                color: #cbd5e1;
            }
            .footer-copyright {
                text-align: center;
                font-size: 12px;
                color: #94a3b8;
                margin-top: 16px;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="email-wrapper">
                <header class="email-header">
                    <div class="logo-section">
                        ${logoDataUri ? `<img src="${logoDataUri}" alt="AURA Learning Platform" style="width: 24px; height: 24px; object-fit: contain;" />` : `<svg class="logo-icon" fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_6_319)"><path d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z"></path></g><defs><clippath id="clip0_6_319"><rect fill="white" height="48" width="48"></rect></clippath></defs></svg>`}
                        <h2 class="logo-text">AURA Learning Platform</h2>
                    </div>
                </header>
                <main class="email-main">
                    ${bodyContent}
                </main>
                <footer class="email-footer">
                    <div class="footer-links">
                        <a href="#" class="footer-link">Centre d'aide</a>
                        <span class="footer-divider">|</span>
                        <a href="#" class="footer-link">Contacter le support</a>
                    </div>
                    <p class="footer-copyright">© 2024 AURA Learning Platform. Tous droits réservés.</p>
                </footer>
            </div>
        </div>
    </body>
    </html>`;
  }

  /**
   * Generate professional email content with proper styling
   */
  private static generateEmailContent(title: string, greeting: string, content: string, buttonText?: string, buttonUrl?: string, checklist?: string[]): string {
    let html = `
      <div class="flex flex-wrap justify-between gap-3 pb-4">
        <div class="flex w-full flex-col gap-3">
          <p class="text-[#1A1A1A] text-4xl font-black leading-tight tracking-[-0.033em]" style="color: #1A1A1A; font-size: 2.25rem; font-weight: 900; line-height: 1.2; letter-spacing: -0.033em; margin-bottom: 0.5rem;">${title}</p>
          <p class="text-slate-600 text-base font-normal leading-normal pt-2" style="color: #64748b; font-size: 1rem; font-weight: 400; line-height: 1.5; padding-top: 0.5rem;">${greeting}</p>
        </div>
      </div>
      
      <div class="text-[#1A1A1A] text-base font-normal leading-normal pb-6" style="color: #1A1A1A; font-size: 1rem; font-weight: 400; line-height: 1.5; padding-bottom: 1.5rem;">
        ${content}
      </div>`;

    if (buttonText && buttonUrl) {
      html += `
      <div class="flex py-3 justify-center" style="display: flex; padding: 0.75rem 0; justify-content: center;">
        <a href="${buttonUrl}" class="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary text-[#111813] text-base font-bold leading-normal tracking-[0.015em] hover:opacity-90 transition-opacity" style="display: flex; width: 100%; cursor: pointer; align-items: center; justify-content: center; overflow: hidden; border-radius: 0.5rem; height: 3rem; padding: 0 1.25rem; background-color: #06f957; color: #111813; font-size: 1rem; font-weight: 700; line-height: 1.5; letter-spacing: 0.015em; text-decoration: none; transition: opacity 0.2s;">
          <span class="truncate" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${buttonText}</span>
        </a>
      </div>`;
    }

    if (checklist && checklist.length > 0) {
      html += `
      <div class="pt-8" style="padding-top: 2rem;">
        <p class="text-slate-600 text-base font-normal leading-normal pb-4" style="color: #64748b; font-size: 1rem; font-weight: 400; line-height: 1.5; padding-bottom: 1rem;">Pour garantir la meilleure expérience, veuillez vérifier les points suivants :</p>
        <ul class="space-y-3" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem;">`;
      
      checklist.forEach(item => {
        html += `
          <li class="flex items-center gap-3" style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="material-symbols-outlined text-primary" style="color: #06f957; font-size: 1.25rem;">check_circle</span>
            <span class="text-[#1A1A1A] text-sm" style="color: #1A1A1A; font-size: 0.875rem;">${item}</span>
          </li>`;
      });
      
      html += `
        </ul>
      </div>`;
    }

    html += `
      <div class="pt-8" style="padding-top: 2rem;">
        <p class="text-slate-600 text-base font-normal leading-normal" style="color: #64748b; font-size: 1rem; font-weight: 400; line-height: 1.5;">Bonne chance,</p>
        <p class="text-[#1A1A1A] text-base font-semibold leading-normal pt-1" style="color: #1A1A1A; font-size: 1rem; font-weight: 600; line-height: 1.5; padding-top: 0.25rem;">L'équipe de la plateforme d'apprentissage AURA</p>
      </div>`;

    return html;
  }

  /**
   * Send a generic email
   */
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.fromAddress,
        replyTo: this.replyToAddress,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: result.messageId
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Send welcome email to new users
   */
  static async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    const subject = 'Bienvenue sur AURA Learning Platform';
    
    const content = `
      <p style="margin-bottom: 1rem;">Félicitations! Votre compte sur <strong>AURA Learning Platform</strong> a été créé avec succès. Nous sommes ravis de vous accompagner dans votre préparation aux examens TCF et TEF.</p>
      <p style="margin-bottom: 1rem;"><strong>Vos informations de connexion:</strong></p>
      <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
        <li style="margin-bottom: 0.5rem;">Email: ${data.email}</li>
        <li style="margin-bottom: 0.5rem;">Plateforme: <a href="${data.loginUrl}" style="color: #06f957; text-decoration: none;">AURA Learning Platform</a></li>
      </ul>
      <p style="margin-bottom: 1rem;"><strong>Conseil:</strong> Commencez par passer notre test de niveau pour obtenir un parcours personnalisé.</p>`;

    const html = this.generateEmailContent(
      'Bienvenue sur AURA Learning Platform',
      `Bonjour ${data.firstName} ${data.lastName},`,
      content,
      'Commencer maintenant',
      data.loginUrl
    );

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Send course enrollment confirmation email
   */
  static async sendCourseEnrollmentEmail(data: CourseEnrollmentEmailData): Promise<boolean> {
    const subject = `Inscription confirmée: ${data.courseName}`;
    
    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Cours</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.courseName}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Instructeur</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.instructorName}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Statut</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">Inscrit(e)</p>
        </div>
      </div>`;

    const content = `
      <p style="margin-bottom: 1rem;">Félicitations! Votre inscription au cours <strong>"${data.courseName}"</strong> a été confirmée avec succès.</p>
      ${detailsHtml}
      <p style="margin-top: 1rem;"><strong>Prochaines étapes:</strong></p>
      <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
        <li style="margin-bottom: 0.5rem;">Accédez à votre cours via le lien ci-dessous</li>
        <li style="margin-bottom: 0.5rem;">Consultez le programme et les ressources</li>
        <li style="margin-bottom: 0.5rem;">Commencez votre première leçon</li>
        <li style="margin-bottom: 0.5rem;">Rejoignez la communauté d'apprenants</li>
      </ul>
      <p style="margin-top: 1rem;"><strong>Astuce:</strong> Activez les notifications pour ne manquer aucune mise à jour du cours.</p>`;

    const html = this.generateEmailContent(
      `Inscription confirmée: ${data.courseName}`,
      `Bonjour ${data.firstName},`,
      content,
      'Accéder au cours',
      data.courseUrl
    );

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Send live session reminder confirmation email (when reminder is set)
   */
  static async sendLiveSessionReminderConfirmationEmail(data: LiveSessionEmailData & { reminderMinutes?: number }): Promise<boolean> {
    const subject = `Rappel programmé: "${data.sessionTitle}"`;
    
    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Titre de la session</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.sessionTitle}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Date</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.sessionDate}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Heure</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.sessionTime}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Durée</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.duration} minutes</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Rappel</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">Vous recevrez un email ${data.reminderMinutes || 5} minutes avant le début de la session.</p>
        </div>
      </div>`;

    const content = `
      <p style="margin-bottom: 1rem;">Ceci est un rappel pour votre session en direct programmée. Veuillez trouver les détails ci-dessous.</p>
      ${detailsHtml}
      <p style="margin-top: 1rem;">Nous vous enverrons un rappel par email ${data.reminderMinutes || 5} minutes avant le début de la session pour ne rien manquer.</p>`;

    const html = this.generateEmailContent(
      'Rappel : Vous avez ajouté un rappel',
      `Bonjour ${data.firstName},`,
      content
    );

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Send live session reminder email (before session starts)
   */
  static async sendLiveSessionReminderEmail(data: LiveSessionEmailData & { reminderMinutes?: number }): Promise<boolean> {
    const reminderText = data.reminderMinutes ? `${data.reminderMinutes} minutes` : 'bientôt';
    const subject = `Rappel: Session en direct "${data.sessionTitle}" dans ${reminderText}`;
    
    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Titre</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.sessionTitle}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Date</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.sessionDate}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Heure</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.sessionTime}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Durée</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.duration} minutes</p>
        </div>
      </div>`;

    const content = `
      <p style="margin-bottom: 1rem; color: #dc2626; font-weight: 600;">Rappel Important: Votre session en direct commence dans ${reminderText}.</p>
      <p style="margin-bottom: 1rem;">Veuillez trouver les détails de la session ci-dessous.</p>
      ${detailsHtml}
      <p style="margin-top: 1rem;">Rejoignez la session maintenant pour éviter tout problème technique.</p>`;

    const checklist = [
      'Testez votre connexion internet',
      'Vérifiez votre micro et caméra',
      'Préparez vos questions',
      'Ayez un carnet et un stylo à portée de main'
    ];

    const html = this.generateEmailContent(
      `Rappel : Session en direct "${data.sessionTitle}"`,
      `Bonjour ${data.firstName},`,
      content,
      'Rejoindre la session',
      data.joinUrl,
      checklist
    );

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Send test results email
   */
  static async sendTestResultsEmail(data: TestResultEmailData): Promise<boolean> {
    const subject = `Résultats de votre test: ${data.testName}`;
    const passStatus = data.percentage >= 70 ? 'Excellent' : data.percentage >= 50 ? 'Bien' : 'À améliorer';
    
    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Score</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.score}/${data.totalQuestions}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Pourcentage</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.percentage}%</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Niveau</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.level}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Statut</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${passStatus}</p>
        </div>
      </div>`;

    let recommendationsHtml = '';
    if (data.recommendations && data.recommendations.length > 0) {
      recommendationsHtml = `
        <div style="margin-top: 1rem; margin-bottom: 1rem;">
          <p style="margin-bottom: 0.5rem; font-weight: 600;">Recommandations personnalisées:</p>
          <ul style="padding-left: 1.5rem;">
            ${data.recommendations.map(rec => `<li style="margin-bottom: 0.5rem;">${rec}</li>`).join('')}
          </ul>
        </div>`;
    }

    const content = `
      <p style="margin-bottom: 1rem;">Voici les résultats de votre test <strong>"${data.testName}"</strong>:</p>
      ${detailsHtml}
      ${recommendationsHtml}
      <p style="margin-top: 1rem;"><strong>Prochaines étapes:</strong></p>
      <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
        <li style="margin-bottom: 0.5rem;">Consultez le détail de vos réponses</li>
        <li style="margin-bottom: 0.5rem;">Travaillez sur les points à améliorer</li>
        <li style="margin-bottom: 0.5rem;">Passez au niveau suivant si éligible</li>
        <li style="margin-bottom: 0.5rem;">Planifiez votre prochain test</li>
      </ul>
      <p style="margin-top: 1rem;">Continuez vos efforts! Chaque test vous rapproche de votre objectif.</p>`;

    const html = this.generateEmailContent(
      `Résultats de votre test: ${data.testName}`,
      `Bonjour ${data.firstName},`,
      content
    );

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Test email configuration
   */
  static async testEmailConfiguration(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email configuration is valid');
      return true;
    } catch (error) {
      logger.error('Email configuration is invalid', { error });
      return false;
    }
  }

  /**
   * Send voice simulation booking confirmation email
   */
  static async sendVoiceSimulationBookingEmail(data: VoiceSimulationBookingEmailData & { accessUrl?: string; simulationId?: string }): Promise<boolean> {
    const subject = 'Confirmation de votre simulation vocale TCF/TEF';
    
    const scheduledDate = new Date(data.scheduledDate);
    const formattedDate = scheduledDate.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = scheduledDate.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Date et heure</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${formattedDate} à ${formattedTime}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Durée</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.duration}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Voix préférée</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.voicePreference === 'MALE' || data.voicePreference?.includes('Masculine') ? 'Masculine' : 'Féminine'}</p>
        </div>
      </div>`;

    let accessSection = '';
    if (data.accessUrl) {
      accessSection = `
        <div style="margin-top: 1rem; margin-bottom: 1rem; padding: 1rem; background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 0.5rem;">
          <p style="margin-bottom: 0.5rem; font-weight: 600;">Important:</p>
          <ul style="padding-left: 1.5rem; margin-bottom: 0.5rem;">
            <li style="margin-bottom: 0.25rem;">Ce lien sera accessible 5 minutes avant le début de votre simulation</li>
            <li style="margin-bottom: 0.25rem;">Le lien expire après la fin de la simulation</li>
            <li style="margin-bottom: 0.25rem;">Ce lien est personnel et sécurisé - ne le partagez pas</li>
          </ul>
        </div>`;
    }

    const content = `
      <p style="margin-bottom: 1rem;">Votre simulation vocale TCF/TEF a été confirmée avec succès.</p>
      ${detailsHtml}
      ${accessSection}
      <p style="margin-top: 1rem;"><strong>Ce qui vous attend:</strong></p>
      <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
        <li style="margin-bottom: 0.5rem;">Entretien oral interactif avec IA</li>
        <li style="margin-bottom: 0.5rem;">Questions adaptées à votre niveau</li>
        <li style="margin-bottom: 0.5rem;">Évaluation complète de vos compétences orales</li>
        <li style="margin-bottom: 0.5rem;">Rapport détaillé envoyé par email</li>
      </ul>
      <p style="margin-top: 1rem;"><strong>Rappel:</strong> Vous recevrez un email de rappel 30 minutes avant votre simulation.</p>`;

    const checklist = [
      'Testez votre microphone et connexion internet',
      'Trouvez un endroit calme',
      'Préparez-vous mentalement en français',
      'Assurez-vous que votre caméra fonctionne',
      'Arrivez 5 minutes avant l\'heure'
    ];

    const html = this.generateEmailContent(
      'Confirmation de votre simulation vocale TCF/TEF',
      `Bonjour ${data.firstName},`,
      content,
      data.accessUrl ? 'Accéder à la simulation' : undefined,
      data.accessUrl || undefined,
      checklist
    );

    try {
      console.log('📧 EmailService: Sending voice simulation booking email to:', data.email);
      const result = await this.sendEmail({
        to: data.email,
        subject,
        html: this.wrapEmailWithProfessionalDesign(html)
      });
      
      if (result) {
        console.log('✅ EmailService: Voice simulation booking email sent successfully to:', data.email);
      } else {
        console.error('❌ EmailService: Failed to send voice simulation booking email to:', data.email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ EmailService: Error sending voice simulation booking email:', {
        error: error?.message,
        email: data.email
      });
      return false;
    }
  }

  /**
   * Send voice simulation rescheduling confirmation email
   */
  static async sendVoiceSimulationReschedulingEmail(data: VoiceSimulationReschedulingEmailData & { accessUrl?: string; simulationId?: string }): Promise<boolean> {
    const subject = 'Confirmation de reprogrammation - Simulation vocale TCF/TEF';
    
    const scheduledDate = new Date(data.scheduledDate);
    const formattedDate = scheduledDate.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = scheduledDate.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Nouvelle date et heure</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${formattedDate} à ${formattedTime}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Durée</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.duration}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Voix préférée</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.voicePreference}</p>
        </div>
      </div>`;

    const content = `
      <p style="margin-bottom: 1rem;">Votre simulation vocale TCF/TEF a été reprogrammée avec succès.</p>
      ${detailsHtml}
      ${data.accessUrl ? `<p style="margin-top: 1rem; margin-bottom: 1rem; color: #dc2626; font-weight: 600;">Ce lien est valide jusqu'à 2 minutes après la fin de votre simulation.</p>` : ''}
      <p style="margin-top: 1rem;"><strong>Important:</strong></p>
      <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
        <li style="margin-bottom: 0.5rem;">Assurez-vous d'être disponible à la nouvelle date et heure</li>
        <li style="margin-bottom: 0.5rem;">Vérifiez que votre microphone fonctionne correctement</li>
        <li style="margin-bottom: 0.5rem;">Préparez-vous dans un environnement calme</li>
        <li style="margin-bottom: 0.5rem;">Testez votre connexion internet avant la simulation</li>
      </ul>
      <p style="margin-top: 1rem;">Si vous avez des questions ou besoin d'aide, n'hésitez pas à nous contacter.</p>`;

    const html = this.generateEmailContent(
      'Confirmation de reprogrammation - Simulation vocale TCF/TEF',
      `Bonjour ${data.firstName},`,
      content,
      data.accessUrl ? 'Accéder à la simulation' : undefined,
      data.accessUrl || undefined
    );

    try {
      const result = await this.sendEmail({
        to: data.email,
        subject,
        html: this.wrapEmailWithProfessionalDesign(html)
      });
      
      if (result) {
        console.log('✅ EmailService: Voice simulation rescheduling email sent successfully to:', data.email);
      } else {
        console.error('❌ EmailService: Failed to send voice simulation rescheduling email to:', data.email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ EmailService: Error sending voice simulation rescheduling email:', {
        error: error?.message,
        email: data.email
      });
      return false;
    }
  }

  /**
   * Send voice simulation reminder email
   */
  static async sendVoiceSimulationReminderEmail(data: VoiceSimulationReminderEmailData): Promise<boolean> {
    try {
      // Generate temporary token for direct access
      const temporaryToken = await TemporaryTokenService.generateToken(
        data.userId,
        data.simulationId,
        'voice',
        2 // 2 hours expiration
      );

      // Create direct access link with temporary token
      const directAccessLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/voice-simulation/${data.simulationId}?token=${temporaryToken}`;

      const scheduledDate = new Date(data.scheduledDate);
      const formattedDate = scheduledDate.toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const formattedTime = scheduledDate.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const subject = 'Rappel : Votre simulation vocale débute bientôt';

      const detailsHtml = `
        <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
          <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
            <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Titre de la simulation</p>
            <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">Simulation Vocale: Préparation d'Entretien</p>
          </div>
          <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
            <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Heure de début</p>
            <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${formattedDate} à ${formattedTime}</p>
          </div>
          <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
            <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Durée</p>
            <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">Environ 20 minutes</p>
          </div>
        </div>`;

      const content = `
        <p style="margin-bottom: 1rem;">Ceci est un rappel pour votre simulation vocale programmée. Veuillez trouver les détails ci-dessous.</p>
        ${detailsHtml}
        <p style="margin-top: 1rem; margin-bottom: 1rem; color: #dc2626; font-weight: 600;">Ce lien est valide pendant 2 heures et à usage unique.</p>`;

      const checklist = [
        'Microphone fonctionnel',
        'Connexion internet stable',
        'Environnement calme',
        'Navigateur à jour'
      ];

      const html = this.generateEmailContent(
        'Rappel : Votre simulation vocale débute bientôt',
        `Bonjour ${data.firstName},`,
        content,
        'Commencer la simulation',
        directAccessLink,
        checklist
      );

      return this.sendEmail({
        to: data.email,
        subject,
        html: this.wrapEmailWithProfessionalDesign(html)
      });
    } catch (error) {
      console.error('Error sending voice simulation reminder email:', error);
      return false;
    }
  }

  /**
   * Send voice simulation results email
   */
  static async sendVoiceSimulationResultsEmail(data: VoiceSimulationResultsEmailData): Promise<boolean> {
    const subject = 'Résultats de votre simulation vocale TCF/TEF';

    const getScoreLevel = (score: number) => {
      if (score >= 90) return 'Excellent';
      if (score >= 80) return 'Très bien';
      if (score >= 70) return 'Bien';
      if (score >= 60) return 'Satisfaisant';
      if (score >= 50) return 'Passable';
      return 'À améliorer';
    };
    
    const detailsHtml = `
      <div class="grid grid-cols-1 divide-y divide-gray-200 border-t border-b border-gray-200 mb-8" style="display: grid; grid-template-columns: 1fr; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem;">
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Score Global</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.overallScore.toFixed(1)}/100 - ${getScoreLevel(data.overallScore)}</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Fluidité</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.fluencyScore.toFixed(1)}/100</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Grammaire</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.grammarScore.toFixed(1)}/100</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Vocabulaire</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.vocabularyScore.toFixed(1)}/100</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Prononciation</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.pronunciationScore.toFixed(1)}/100</p>
        </div>
        <div class="grid grid-cols-[1fr_2fr] gap-x-6 py-5" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0 1.5rem; padding: 1.25rem 0;">
          <p class="text-slate-500 text-sm font-normal leading-normal" style="color: #64748b; font-size: 0.875rem; font-weight: 400; line-height: 1.5;">Cohérence du discours</p>
          <p class="text-[#1A1A1A] text-sm font-bold leading-normal" style="color: #1A1A1A; font-size: 0.875rem; font-weight: 700; line-height: 1.5;">${data.coherenceScore.toFixed(1)}/100</p>
        </div>
      </div>`;

    const content = `
      <p style="margin-bottom: 1rem;">Félicitations! Vous avez terminé votre simulation vocale. Voici vos résultats détaillés:</p>
      ${detailsHtml}
      <div style="margin-top: 1rem; margin-bottom: 1rem; padding: 1rem; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 0.5rem;">
        <p style="margin-bottom: 0.5rem; font-weight: 600;">Commentaires personnalisés:</p>
        <p style="color: #1A1A1A;">${data.feedback}</p>
      </div>
      <p style="margin-top: 1rem;"><strong>Prochaines étapes recommandées:</strong></p>
      <ul style="margin-bottom: 1rem; padding-left: 1.5rem;">
        <li style="margin-bottom: 0.5rem;">Continuez à pratiquer régulièrement</li>
        <li style="margin-bottom: 0.5rem;">Concentrez-vous sur vos points faibles</li>
        <li style="margin-bottom: 0.5rem;">Utilisez nos cours ciblés</li>
        <li style="margin-bottom: 0.5rem;">Planifiez votre prochaine simulation</li>
      </ul>
      <p style="margin-top: 1rem; font-size: 0.875rem; color: #64748b;">Simulation terminée le ${new Date(data.completedAt).toLocaleString('fr-FR')}</p>
      <p style="margin-top: 1rem;">Continuez vos efforts, vous progressez bien!</p>`;

    const html = this.generateEmailContent(
      'Résultats de votre simulation vocale TCF/TEF',
      `Bonjour ${data.firstName},`,
      content
    );

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Send immigration simulation confirmation email
   */
  static async sendImmigrationSimulationConfirmationEmail(data: ImmigrationSimulationConfirmationEmailData): Promise<boolean> {
    try {
      // Generate temporary token for direct access
      const temporaryToken = await TemporaryTokenService.generateToken(
        data.userId,
        data.simulationId,
        'immigration',
        24 // 24 hours expiration for confirmation
      );

      // Create direct access link with temporary token
      const directAccessLink = `${process.env.FRONTEND_URL || 'http://localhost:3004'}/immigration-simulation/${data.simulationId}?token=${temporaryToken}`;

      const countryNames = {
        'canada': 'Canada',
        'france': 'France',
        'belgium': 'Belgique'
      };

      const typeNames = {
        'skilled_worker': 'Travailleur qualifié',
        'student': 'Étudiant international',
        'family_reunification': 'Réunification familiale',
        'work_permit': 'Permis de travail',
        'family': 'Regroupement familial',
        'work': 'Permis de travail'
      };

      const countryName = countryNames[data.country] || data.country;
      const typeName = typeNames[data.immigrationType] || data.immigrationType;

      const subject = `✅ Confirmation : Simulation d'immigration ${countryName}`;

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .info-box { background: #e8f5e8; border: 1px solid #4caf50; padding: 20px; border-radius: 5px; margin: 20px 0; }
              .button { display: inline-block; background: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; text-align: center; }
              .access-section { background: #e3f2fd; border: 1px solid #2196f3; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🌍 Simulation d'Immigration Confirmée</h1>
              </div>
              <div class="content">
                  <p>Bonjour ${data.firstName},</p>

                  <div class="info-box">
                      <h3>✅ Votre simulation d'immigration est confirmée !</h3>
                      <p><strong>Pays de destination :</strong> ${countryName}</p>
                      <p><strong>Type de demande :</strong> ${typeName}</p>
                      <p><strong>Date prévue :</strong> ${new Date(data.scheduledDate).toLocaleString('fr-FR')}</p>
                  </div>

                  <div class="access-section">
                      <h3>🚀 Accès direct à votre simulation</h3>
                      <p>Cliquez sur le lien ci-dessous pour accéder directement à votre simulation (aucune connexion requise) :</p>
                      <a href="${directAccessLink}" class="button">🎯 Commencer la simulation</a>
                      <p><small>⚠️ Ce lien est valide pendant 24 heures et à usage unique</small></p>
                  </div>

                  <h3>📋 Préparation recommandée :</h3>
                  <ul>
                      <li>Préparez vos documents d'identité</li>
                      <li>Révisez les procédures d'immigration de ${countryName}</li>
                      <li>Préparez vos motivations et votre projet</li>
                      <li>Assurez-vous d'avoir un environnement calme</li>
                      <li>Vérifiez votre connexion internet</li>
                  </ul>

                  <p>Bonne chance pour votre simulation !</p>

                  <p>L'équipe TCF/TEF Learning Platform</p>
              </div>
          </div>
      </body>
      </html>`;

      return this.sendEmail({
        to: data.email,
        subject,
        html: this.wrapEmailWithProfessionalDesign(html)
      });
    } catch (error) {
      console.error('Error sending immigration simulation confirmation email:', error);
      return false;
    }
  }

  /**
   * Send immigration simulation rescheduling email
   */
  static async sendImmigrationSimulationReschedulingEmail(data: ImmigrationSimulationReschedulingEmailData): Promise<boolean> {
    try {
      const subject = '🔄 Confirmation de reprogrammation - Simulation d\'immigration';
      
      // Format date
      const scheduledDate = new Date(data.scheduledDate);
      const dateStr = scheduledDate.toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const countryNames: { [key: string]: string } = {
        'canada': 'Canada',
        'france': 'France',
        'belgium': 'Belgique',
        'germany': 'Allemagne',
        'australia': 'Australie',
        'uk': 'Royaume-Uni'
      };

      const typeNames: { [key: string]: string } = {
        'skilled_worker': 'Travailleur qualifié',
        'student': 'Étudiant international',
        'family_reunification': 'Réunification familiale',
        'work_permit': 'Permis de travail',
        'visa_interview': 'Entretien de visa',
        'cultural_test': 'Test culturel',
        'documents_check': 'Vérification de documents',
        'citizenship_test': 'Test de citoyenneté'
      };

      const countryName = countryNames[data.country.toLowerCase()] || data.country;
      const typeName = typeNames[data.immigrationType] || data.immigrationType;

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #00B140 0%, #00a038 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .highlight { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .button { display: inline-block; background: #00B140; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
              .access-section { background: #e8f5e8; border: 2px solid #00B140; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
              .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #856404; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🔄 Simulation Reprogrammée</h1>
              </div>
              <div class="content">
                  <p>Bonjour ${data.firstName} ${data.lastName},</p>

                  <p>Votre simulation d'immigration a été reprogrammée avec succès !</p>

                  <div class="highlight">
                      <h3>📅 Nouveaux détails de votre simulation :</h3>
                      <p><strong>Pays :</strong> ${countryName}</p>
                      <p><strong>Type :</strong> ${typeName}</p>
                      <p><strong>Nouvelle date et heure :</strong> ${dateStr}</p>
                      <p><strong>Durée :</strong> ${data.duration}</p>
                  </div>

                  <div class="access-section">
                      <h3>🚀 Accès à votre simulation</h3>
                      <p>Cliquez sur le bouton ci-dessous pour accéder à votre simulation :</p>
                      <a href="${data.accessUrl}" class="button">🌍 Accéder à la simulation</a>
                      <p><small>⚠️ Ce lien est valide jusqu'à 2 minutes après la fin de votre simulation</small></p>
                  </div>

                  <div class="warning">
                      <h3>⚠️ Important</h3>
                      <ul>
                          <li>Assurez-vous d'être disponible à la nouvelle date et heure</li>
                          <li>Préparez vos documents d'identité</li>
                          <li>Révisez les procédures d'immigration de ${countryName}</li>
                          <li>Vérifiez votre connexion internet</li>
                      </ul>
                  </div>

                  <p>Si vous avez des questions ou besoin d'aide, n'hésitez pas à nous contacter.</p>

                  <p>Bonne chance pour votre simulation !</p>

                  <p>L'équipe TCF/TEF Learning Platform</p>
              </div>
          </div>
      </body>
      </html>`;

      const result = await this.sendEmail({
        to: data.to,
        subject,
        html: this.wrapEmailWithProfessionalDesign(html)
      });
      
      if (result) {
        console.log('✅ EmailService: Immigration simulation rescheduling email sent successfully to:', data.to);
      } else {
        console.error('❌ EmailService: Failed to send immigration simulation rescheduling email to:', data.to);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ EmailService: Error sending immigration simulation rescheduling email:', {
        error: error?.message,
        email: data.to
      });
      return false;
    }
  }

  /**
   * Send immigration simulation reminder email
   */
  static async sendImmigrationSimulationReminderEmail(data: ImmigrationSimulationReminderEmailData): Promise<boolean> {
    try {
      // Generate temporary token for direct access
      const temporaryToken = await TemporaryTokenService.generateToken(
        data.userId,
        data.simulationId,
        'immigration',
        2 // 2 hours expiration
      );

      // Create direct access link with temporary token
      const directAccessLink = `${process.env.FRONTEND_URL || 'http://localhost:3004'}/immigration-simulation/${data.simulationId}?token=${temporaryToken}`;

      const countryNames = {
        'canada': 'Canada',
        'france': 'France',
        'belgium': 'Belgique'
      };

      const typeNames = {
        'skilled_worker': 'Travailleur qualifié',
        'student': 'Étudiant international',
        'family_reunification': 'Réunification familiale',
        'work_permit': 'Permis de travail',
        'family': 'Regroupement familial',
        'work': 'Permis de travail'
      };

      const countryName = countryNames[data.country] || data.country;
      const typeName = typeNames[data.immigrationType] || data.immigrationType;

      const subject = `⏰ Rappel : Simulation d'immigration ${countryName} dans 30 minutes`;

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .urgent { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .button { display: inline-block; background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; text-align: center; }
              .access-section { background: #e8f5e8; border: 1px solid #4caf50; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>⏰ Simulation dans 30 minutes !</h1>
              </div>
              <div class="content">
                  <p>Bonjour ${data.firstName},</p>

                  <div class="urgent">
                      <h3>🚨 Votre simulation d'immigration commence bientôt !</h3>
                      <p><strong>Pays :</strong> ${countryName}</p>
                      <p><strong>Type :</strong> ${typeName}</p>
                      <p><strong>Heure de début :</strong> ${new Date(data.scheduledDate).toLocaleString('fr-FR')}</p>
                      <p><strong>Dans :</strong> 30 minutes</p>
                  </div>

                  <div class="access-section">
                      <h3>🚀 Accès direct à votre simulation</h3>
                      <p>Cliquez sur le lien ci-dessous pour accéder directement à votre simulation :</p>
                      <a href="${directAccessLink}" class="button">🎯 Commencer la simulation</a>
                      <p><small>⚠️ Ce lien est valide pendant 2 heures et à usage unique</small></p>
                  </div>

                  <h3>✅ Dernières vérifications :</h3>
                  <ul>
                      <li>Documents d'identité à portée de main</li>
                      <li>Environnement calme et professionnel</li>
                      <li>Connexion internet stable</li>
                      <li>Microphone fonctionnel</li>
                      <li>Navigateur à jour</li>
                  </ul>

                  <p>Bonne chance pour votre entretien d'immigration !</p>

                  <p>L'équipe TCF/TEF Learning Platform</p>
              </div>
          </div>
      </body>
      </html>`;

      return this.sendEmail({
        to: data.email,
        subject,
        html: this.wrapEmailWithProfessionalDesign(html)
      });
    } catch (error) {
      console.error('Error sending immigration simulation reminder email:', error);
      return false;
    }
  }

  /**
   * Send immigration simulation results email
   */
  static async sendImmigrationSimulationResultsEmail(data: ImmigrationSimulationResultsEmailData): Promise<boolean> {
    try {
      const countryNames = {
        'canada': 'Canada',
        'france': 'France',
        'belgium': 'Belgique'
      };

      const typeNames = {
        'skilled_worker': 'Travailleur qualifié',
        'student': 'Étudiant international',
        'family_reunification': 'Réunification familiale',
        'work_permit': 'Permis de travail',
        'family': 'Regroupement familial',
        'work': 'Permis de travail'
      };

      const countryName = countryNames[data.country] || data.country;
      const typeName = typeNames[data.immigrationType] || data.immigrationType;

      const subject = `📊 Résultats : Simulation d'immigration ${countryName}`;

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .score-box { background: #e8f5e8; border: 1px solid #4caf50; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
              .feedback-box { background: #fff; border: 1px solid #ddd; padding: 20px; border-radius: 5px; margin: 20px 0; }
              .score { font-size: 2em; font-weight: bold; color: #27ae60; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>📊 Résultats de votre Simulation</h1>
              </div>
              <div class="content">
                  <p>Bonjour ${data.firstName},</p>

                  <p>Voici les résultats de votre simulation d'immigration pour <strong>${countryName}</strong> (${typeName}) :</p>

                  <div class="score-box">
                      <h3>🎯 Score Final</h3>
                      <div class="score">${data.finalScore}/100</div>
                      <p>Simulation terminée le ${new Date(data.completedAt).toLocaleString('fr-FR')}</p>
                  </div>

                  <div class="feedback-box">
                      <h3>💬 Évaluation détaillée :</h3>
                      <p>${data.feedback}</p>
                  </div>

                  <h3>📈 Prochaines étapes recommandées :</h3>
                  <ul>
                      <li>Analysez les points à améliorer</li>
                      <li>Préparez mieux votre dossier d'immigration</li>
                      <li>Renforcez vos connaissances du pays</li>
                      <li>Pratiquez vos entretiens d'immigration</li>
                      <li>Consultez nos ressources spécialisées</li>
                  </ul>

                  <p>Continuez à vous préparer pour maximiser vos chances de succès !</p>

                  <p>L'équipe TCF/TEF Learning Platform</p>
              </div>
          </div>
      </body>
      </html>`;

      return this.sendEmail({
        to: data.email,
        subject,
        html
      });
    } catch (error) {
      console.error('Error sending immigration simulation results email:', error);
      return false;
    }
  }

  /**
   * Send one-on-one session invitation email
   */
  static async sendOneOnOneSessionEmail(data: OneOnOneSessionEmailData): Promise<boolean> {
    const subject = `🎥 Invitation à une session privée: ${data.sessionTitle}`;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invitation à une session privée</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .content { padding: 20px 0; }
            .cta-button { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
            .session-details { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎥 Session Privée TCF/TEF</h1>
                <p>Votre instructeur vous a invité à une session individuelle</p>
            </div>
            
            <div class="content">
                <h2>Bonjour ${data.firstName} !</h2>
                
                <p><strong>${data.instructorName}</strong> vous a invité à une session privée de préparation TCF/TEF.</p>
                
                <div class="session-details">
                    <h3>📋 Détails de la session</h3>
                    <p><strong>Titre:</strong> ${data.sessionTitle}</p>
                    <p><strong>Instructeur:</strong> ${data.instructorName}</p>
                    <p><strong>Date:</strong> ${data.sessionDate}</p>
                    <p><strong>Heure:</strong> ${data.sessionTime}</p>
                    <p><strong>Durée:</strong> ${data.duration} minutes</p>
                </div>
                
                <p>Cette session est privée et personnalisée pour vous. Cliquez sur le bouton ci-dessous pour rejoindre la session :</p>
                
                <div style="text-align: center;">
                    <a href="${data.secureLink}" class="cta-button">🎥 Rejoindre la Session</a>
                </div>
                
                <p><strong>Note importante:</strong> Ce lien est personnel et sécurisé. Ne le partagez pas avec d'autres personnes.</p>
                
                <p>Si vous avez des questions, n'hésitez pas à contacter votre instructeur via la messagerie de la plateforme.</p>
            </div>
            
            <div class="footer">
                <p>TCF/TEF Learning Platform</p>
                <p>Préparez-vous efficacement pour vos examens TCF/TEF</p>
            </div>
        </div>
    </body>
    </html>`;

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }

  /**
   * Send password reset code via email
   */
  static async sendPasswordResetCode(data: { email: string; code: string; firstName?: string; lang?: 'fr' | 'en' }): Promise<boolean> {
    const isFrench = data.lang !== 'en';
    const subject = isFrench 
      ? '🔐 Code de réinitialisation de mot de passe AURA.CA'
      : '🔐 AURA.CA Password Reset Code';
    
    const greeting = isFrench ? 'Bonjour' : 'Hello';
    const name = data.firstName || '';
    const codeDisplay = `<div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2ECC71; text-align: center; padding: 20px; background: #f0f9f4; border-radius: 8px; margin: 20px 0;">${data.code}</div>`;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                background-color: #f5f7fa;
                margin: 0;
                padding: 20px 0;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .header h1 {
                color: #2ECC71;
                font-size: 24px;
                margin-bottom: 10px;
            }
            .content {
                margin-bottom: 30px;
            }
            .content h2 {
                color: #333;
                font-size: 20px;
                margin-bottom: 15px;
            }
            .content p {
                color: #666;
                margin-bottom: 15px;
            }
            .code-container {
                text-align: center;
                margin: 30px 0;
            }
            .code-box {
                display: inline-block;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #2ECC71;
                padding: 20px 30px;
                background: #f0f9f4;
                border: 2px solid #2ECC71;
                border-radius: 8px;
                margin: 20px 0;
            }
            .warning {
                background: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            .warning p {
                color: #856404;
                margin: 0;
            }
            .footer {
                text-align: center;
                color: #999;
                font-size: 14px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #eee;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 ${isFrench ? 'Réinitialisation de mot de passe' : 'Password Reset'}</h1>
            </div>
            
            <div class="content">
                <h2>${greeting}${name ? ` ${name}` : ''} !</h2>
                
                <p>${isFrench 
                  ? 'Vous avez demandé à réinitialiser votre mot de passe pour votre compte AURA.CA.'
                  : 'You have requested to reset your password for your AURA.CA account.'}</p>
                
                <p>${isFrench 
                  ? 'Utilisez le code suivant pour réinitialiser votre mot de passe :'
                  : 'Use the following code to reset your password:'}</p>
                
                <div class="code-container">
                    <div class="code-box">${data.code}</div>
                </div>
                
                <div class="warning">
                    <p><strong>${isFrench ? '⚠️ Important :' : '⚠️ Important:'}</strong></p>
                    <p>${isFrench 
                      ? 'Ce code expire dans 5 minutes. Ne partagez jamais ce code avec personne. Si vous n\'avez pas demandé cette réinitialisation, ignorez cet email.'
                      : 'This code expires in 5 minutes. Never share this code with anyone. If you did not request this reset, please ignore this email.'}</p>
                </div>
                
                <p>${isFrench 
                  ? 'Si vous avez des questions ou besoin d\'aide, n\'hésitez pas à nous contacter.'
                  : 'If you have any questions or need assistance, please don\'t hesitate to contact us.'}</p>
            </div>
            
            <div class="footer">
                <p><strong>AURA.CA</strong></p>
                <p>${isFrench 
                  ? 'Plateforme IA de préparation TCF/TEF'
                  : 'TCF/TEF AI Preparation Platform'}</p>
            </div>
        </div>
    </body>
    </html>`;

    return this.sendEmail({
      to: data.email,
      subject,
      html: this.wrapEmailWithProfessionalDesign(html)
    });
  }
}

export default new EmailService();
