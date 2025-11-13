import { prisma } from '@/lib/prisma';
import { EmailService } from './emailService';
import { logger } from '../utils/logger';

/**
 * Service to handle scheduled reminder emails for live sessions
 */
export class ReminderSchedulerService {
  /**
   * Check and send pending reminders
   * This should be called periodically (e.g., every minute via cron or setInterval)
   */
  static async processPendingReminders(): Promise<void> {
    try {
      const now = new Date();
      const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000); // Check reminders due in the next minute

      // Find all reminders that are due and not yet sent
      const pendingReminders = await prisma.sessionReminder.findMany({
        where: {
          emailSent: false,
          reminderDate: {
            lte: oneMinuteFromNow, // Due now or in the next minute
            gte: new Date(now.getTime() - 5 * 60 * 1000) // But not older than 5 minutes (to avoid processing very old reminders)
          },
          reminderType: 'scheduled' // Only process scheduled reminders (not status_change)
        },
        include: {
          session: {
            include: {
              createdBy: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      logger.info(`📧 Processing ${pendingReminders.length} pending reminders`);

      for (const reminder of pendingReminders) {
        try {
          const sessionDate = new Date(reminder.session.date);
          
          const emailData = {
            firstName: reminder.user.firstName || 'Étudiant',
            email: reminder.user.email,
            sessionTitle: reminder.session.title,
            sessionDate: sessionDate.toLocaleDateString('fr-FR', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            }),
            sessionTime: sessionDate.toLocaleTimeString('fr-FR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            joinUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/live`,
            duration: reminder.session.duration || 60,
            reminderMinutes: reminder.reminderTime
          };

          // Send reminder email
          const emailSent = await EmailService.sendLiveSessionReminderEmail(emailData);

          if (emailSent) {
            // Mark reminder as sent
            await prisma.sessionReminder.update({
              where: { id: reminder.id },
              data: {
                emailSent: true,
                sentAt: new Date()
              }
            });

            logger.info(`✅ Reminder email sent successfully`, {
              reminderId: reminder.id,
              userId: reminder.userId,
              sessionId: reminder.sessionId,
              reminderTime: reminder.reminderTime
            });
          } else {
            logger.error(`❌ Failed to send reminder email`, {
              reminderId: reminder.id,
              userId: reminder.userId,
              sessionId: reminder.sessionId
            });
          }
        } catch (error: any) {
          logger.error(`❌ Error processing reminder ${reminder.id}:`, {
            error: error.message,
            reminderId: reminder.id,
            userId: reminder.userId,
            sessionId: reminder.sessionId
          });
        }
      }
    } catch (error: any) {
      logger.error('❌ Error in processPendingReminders:', error);
    }
  }

  /**
   * Start the reminder scheduler (runs every minute)
   */
  static startScheduler(): NodeJS.Timeout {
    logger.info('🕐 Starting reminder scheduler (runs every minute)');
    
    // Process immediately on start
    this.processPendingReminders().catch(err => {
      logger.error('Error in initial reminder processing:', err);
    });

    // Then process every minute
    const interval = setInterval(() => {
      this.processPendingReminders().catch(err => {
        logger.error('Error in scheduled reminder processing:', err);
      });
    }, 60 * 1000); // Every minute

    return interval;
  }

  /**
   * Stop the reminder scheduler
   */
  static stopScheduler(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    logger.info('🛑 Reminder scheduler stopped');
  }
}

