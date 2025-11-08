import { prisma } from '@/database/connection';
import { EmailService } from './emailService';
import { logger } from '../utils/logger';

export interface UserLoginEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  loginTime: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface CourseEnrollmentEvent {
  userId: string;
  courseId: string;
  email: string;
  firstName: string;
  courseName: string;
  instructorName: string;
}

export interface TestCompletionEvent {
  userId: string;
  testId: string;
  email: string;
  firstName: string;
  testName: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  level: string;
}

export interface LiveSessionReminderEvent {
  userId: string;
  sessionId: string;
  email: string;
  firstName: string;
  sessionTitle: string;
  scheduledAt: Date;
  duration: number;
}

export interface NotificationEvent {
  userId: string;
  email: string;
  firstName: string;
  notificationTitle: string;
  notificationMessage: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  actionUrl?: string;
}

export class EventEmailService {
  /**
   * Handle user login event - send welcome back email
   */
  static async handleUserLogin(event: UserLoginEvent): Promise<void> {
    try {
      // Check if it's the user's first login today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const lastLogin = await prisma.user.findUnique({
        where: { id: event.userId },
        select: { lastLoginAt: true }
      });

      const isFirstLoginToday = !lastLogin?.lastLoginAt || 
                               lastLogin.lastLoginAt < today;

      if (isFirstLoginToday) {
        const subject = '👋 Bon retour sur TCF/TEF Learning Platform!';
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .stats { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👋 Bon retour ${event.firstName}!</h1>
                    <p>Continuons votre parcours d'apprentissage</p>
                </div>
                <div class="content">
                    <h2>Bonjour ${event.firstName},</h2>
                    
                    <p>Nous sommes ravis de vous revoir sur <strong>TCF/TEF Learning Platform</strong>!</p>
                    
                    <div class="stats">
                        <h3>📊 Votre session d'aujourd'hui:</h3>
                        <p><strong>Connexion:</strong> ${event.loginTime.toLocaleString('fr-FR')}</p>
                        <p><strong>Statut:</strong> ✅ Connecté(e)</p>
                    </div>

                    <p>🎯 <strong>Suggestions pour aujourd'hui:</strong></p>
                    <ul>
                        <li>Continuez votre cours en cours</li>
                        <li>Passez un test de niveau</li>
                        <li>Rejoignez une session en direct</li>
                        <li>Consultez vos résultats récents</li>
                    </ul>

                    <div style="text-align: center;">
                        <a href="http://localhost:3000/dashboard" class="button">🎓 Accéder au tableau de bord</a>
                    </div>

                    <p>💡 <strong>Astuce du jour:</strong> La régularité est la clé du succès en apprentissage des langues!</p>
                </div>
            </div>
        </body>
        </html>`;

        await EmailService.sendEmail({
          to: event.email,
          subject,
          html
        });

        logger.info('Login welcome email sent', { userId: event.userId, email: event.email });
      }

      // Update last login time
      await prisma.user.update({
        where: { id: event.userId },
        data: { lastLoginAt: event.loginTime }
      });

    } catch (error) {
      logger.error('Failed to handle user login event', { event, error });
    }
  }

  /**
   * Handle course enrollment event
   */
  static async handleCourseEnrollment(event: CourseEnrollmentEvent): Promise<void> {
    try {
      await EmailService.sendCourseEnrollmentEmail({
        firstName: event.firstName,
        email: event.email,
        courseName: event.courseName,
        courseUrl: `http://localhost:3000/courses/${event.courseId}`,
        instructorName: event.instructorName
      });

      logger.info('Course enrollment email sent', { 
        userId: event.userId, 
        courseId: event.courseId,
        email: event.email 
      });
    } catch (error) {
      logger.error('Failed to handle course enrollment event', { event, error });
    }
  }

  /**
   * Handle test completion event
   */
  static async handleTestCompletion(event: TestCompletionEvent): Promise<void> {
    try {
      const recommendations = this.generateTestRecommendations(event.percentage, event.level);

      await EmailService.sendTestResultsEmail({
        firstName: event.firstName,
        email: event.email,
        testName: event.testName,
        score: event.score,
        totalQuestions: event.totalQuestions,
        percentage: event.percentage,
        level: event.level,
        recommendations
      });

      logger.info('Test completion email sent', { 
        userId: event.userId, 
        testId: event.testId,
        email: event.email,
        score: event.score 
      });
    } catch (error) {
      logger.error('Failed to handle test completion event', { event, error });
    }
  }

  /**
   * Handle live session reminder event
   */
  static async handleLiveSessionReminder(event: LiveSessionReminderEvent): Promise<void> {
    try {
      await EmailService.sendLiveSessionReminderEmail({
        firstName: event.firstName,
        email: event.email,
        sessionTitle: event.sessionTitle,
        sessionDate: event.scheduledAt.toLocaleDateString('fr-FR'),
        sessionTime: event.scheduledAt.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        joinUrl: `http://localhost:3000/live/${event.sessionId}`,
        duration: event.duration
      });

      logger.info('Live session reminder email sent', { 
        userId: event.userId, 
        sessionId: event.sessionId,
        email: event.email 
      });
    } catch (error) {
      logger.error('Failed to handle live session reminder event', { event, error });
    }
  }

  /**
   * Handle notification event - send important notifications via email
   */
  static async handleNotificationEvent(event: NotificationEvent): Promise<void> {
    try {
      // Only send email for HIGH and URGENT priority notifications
      if (!['HIGH', 'URGENT'].includes(event.priority)) {
        return;
      }

      const subject = event.priority === 'URGENT' ? 
        `🚨 URGENT: ${event.notificationTitle}` : 
        `⚠️ Important: ${event.notificationTitle}`;

      const priorityColor = event.priority === 'URGENT' ? '#F44336' : '#FF9800';
      const priorityIcon = event.priority === 'URGENT' ? '🚨' : '⚠️';

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, ${priorityColor} 0%, ${priorityColor}dd 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: ${priorityColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .notification { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid ${priorityColor}; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>${priorityIcon} Notification Importante</h1>
                  <p>Priorité: ${event.priority}</p>
              </div>
              <div class="content">
                  <h2>Bonjour ${event.firstName},</h2>
                  
                  <div class="notification">
                      <h3>${event.notificationTitle}</h3>
                      <p>${event.notificationMessage}</p>
                  </div>

                  ${event.actionUrl ? `
                  <div style="text-align: center;">
                      <a href="${event.actionUrl}" class="button">Voir les détails</a>
                  </div>
                  ` : ''}

                  <p><strong>Cette notification nécessite votre attention.</strong></p>
                  
                  <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                  
                  <p style="font-size: 14px; color: #666;">
                      Si vous avez des questions, contactez notre équipe support.
                  </p>
              </div>
          </div>
      </body>
      </html>`;

      await EmailService.sendEmail({
        to: event.email,
        subject,
        html
      });

      logger.info('Notification email sent', { 
        userId: event.userId, 
        priority: event.priority,
        email: event.email 
      });
    } catch (error) {
      logger.error('Failed to handle notification event', { event, error });
    }
  }

  /**
   * Generate personalized test recommendations
   */
  private static generateTestRecommendations(percentage: number, level: string): string[] {
    const recommendations: string[] = [];

    if (percentage >= 90) {
      recommendations.push("Excellent travail! Vous maîtrisez parfaitement ce niveau.");
      recommendations.push("Passez au niveau supérieur pour continuer votre progression.");
      recommendations.push("Considérez passer l'examen officiel TCF/TEF.");
    } else if (percentage >= 70) {
      recommendations.push("Très bon résultat! Vous avez une bonne maîtrise du niveau.");
      recommendations.push("Travaillez sur les points faibles identifiés.");
      recommendations.push("Pratiquez avec des exercices supplémentaires.");
    } else if (percentage >= 50) {
      recommendations.push("Résultat correct, mais il y a de la marge d'amélioration.");
      recommendations.push("Révisez les concepts fondamentaux de ce niveau.");
      recommendations.push("Participez à des sessions en direct pour plus de pratique.");
    } else {
      recommendations.push("Ce niveau nécessite plus de travail.");
      recommendations.push("Reprenez les cours de base de ce niveau.");
      recommendations.push("Demandez de l'aide à votre instructeur.");
      recommendations.push("Pratiquez régulièrement avec des exercices simples.");
    }

    // Add level-specific recommendations
    switch (level) {
      case 'A1':
        recommendations.push("Concentrez-vous sur le vocabulaire de base et les phrases simples.");
        break;
      case 'A2':
        recommendations.push("Travaillez sur les temps du passé et les expressions courantes.");
        break;
      case 'B1':
        recommendations.push("Améliorez votre expression écrite et la compréhension de textes complexes.");
        break;
      case 'B2':
        recommendations.push("Perfectionnez votre argumentation et votre vocabulaire spécialisé.");
        break;
      case 'C1':
        recommendations.push("Travaillez sur les nuances linguistiques et l'expression sophistiquée.");
        break;
      case 'C2':
        recommendations.push("Perfectionnez votre maîtrise native du français.");
        break;
    }

    return recommendations;
  }

  /**
   * Schedule live session reminders
   */
  static async scheduleLiveSessionReminders(sessionId: string): Promise<void> {
    try {
      const session = await prisma.liveSession.findUnique({
        where: { id: sessionId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true
                }
              }
            }
          }
        }
      });

      if (!session) {
        logger.warn('Session not found for reminder scheduling', { sessionId });
        return;
      }

      // Schedule reminders for all participants
      for (const participant of session.participants) {
        const reminderEvent: LiveSessionReminderEvent = {
          userId: participant.user.id,
          sessionId: session.id,
          email: participant.user.email,
          firstName: participant.user.firstName,
          sessionTitle: session.title,
          scheduledAt: session.date,
          duration: session.duration
        };

        // In a real implementation, you would use a job queue like Bull or Agenda
        // For now, we'll send the reminder immediately if the session is within 1 hour
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        if (session.date <= oneHourFromNow) {
          await this.handleLiveSessionReminder(reminderEvent);
        }
      }

      logger.info('Live session reminders scheduled', { 
        sessionId, 
        participantCount: session.participants.length 
      });
    } catch (error) {
      logger.error('Failed to schedule live session reminders', { sessionId, error });
    }
  }
}
