import { prisma } from '@/lib/prisma';
import { logger } from '@/utils/logger';

interface TeacherFilters {
  search?: string;
  specialties?: string;
  availability?: string;
  rating?: number;
  sortBy?: string;
}

interface TeacherProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  specialties: string[];
  rating: number;
  totalSessions: number;
  languages: string[];
  availability: string[];
  profileImage?: string;
  isAvailable: boolean;
  experience: number; // years
  certifications: string[];
  hourlyRate?: number;
  responseTime: string; // e.g., "2-4 hours"
}

export class TeacherService {
  /**
   * Get available teachers for Pro+ users
   */
  static async getAvailableTeachers(userId: string, filters: TeacherFilters): Promise<TeacherProfile[]> {
    try {
      // First, verify user has Pro+ subscription
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });

      if (!user || user.subscriptionTier !== 'PRO') {
        throw new Error('Pro+ subscription required to access teachers');
      }

      // Build where clause for filtering
      const where: any = {
        role: {
          in: ['JUNIOR_MANAGER', 'SENIOR_MANAGER']
        },
        status: 'ACTIVE'
      };

      // Add search filter
      if (filters.search) {
        where.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { bio: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      // Add specialties filter
      if (filters.specialties) {
        const specialties = filters.specialties.split(',');
        where.specialties = {
          hasSome: specialties
        };
      }

      // Add rating filter
      if (filters.rating) {
        where.rating = {
          gte: filters.rating
        };
      }

      // Get teachers from database
      const teachers = await prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          bio: true,
          profileImage: true,
          createdAt: true,
          status: true
        },
        orderBy: this.getSortOrder(filters.sortBy)
      });

      // Transform data to match interface
      const transformedTeachers: TeacherProfile[] = teachers.map(teacher => ({
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        bio: teacher.bio || 'Experienced French teacher',
        specialties: ['Grammaire', 'Expression Orale'],
        rating: 4.5,
        totalSessions: 0,
        languages: ['Français', 'Anglais'],
        availability: ['Lun-Ven'],
        profileImage: teacher.profileImage,
        isAvailable: true,
        experience: 2,
        certifications: ['TCF/TEF Certified'],
        hourlyRate: 25000,
        responseTime: '2-4 hours'
      }));

      return transformedTeachers;
    } catch (error) {
      logger.error('Error fetching teachers:', error);
      throw error;
    }
  }

  /**
   * Get specific teacher profile
   */
  static async getTeacherProfile(teacherId: string, userId: string): Promise<TeacherProfile> {
    try {
      // Verify user has Pro+ subscription
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });

      if (!user || user.subscriptionTier !== 'PRO') {
        throw new Error('Pro+ subscription required to access teacher profiles');
      }

      // Get teacher profile
      const teacher = await prisma.user.findFirst({
        where: {
          id: teacherId,
          role: {
            in: ['JUNIOR_MANAGER', 'SENIOR_MANAGER']
          },
          status: 'ACTIVE'
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          bio: true,
          profileImage: true,
          createdAt: true,
          status: true
        }
      });

      if (!teacher) {
        throw new Error('Teacher not found');
      }

      return {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        bio: teacher.bio || 'Experienced French teacher',
        specialties: ['Grammaire', 'Expression Orale'],
        rating: 4.5,
        totalSessions: 0,
        languages: ['Français', 'Anglais'],
        availability: ['Lun-Ven'],
        profileImage: teacher.profileImage,
        isAvailable: true,
        experience: 2,
        certifications: ['TCF/TEF Certified'],
        hourlyRate: 25000,
        responseTime: '2-4 hours'
      };
    } catch (error) {
      logger.error('Error fetching teacher profile:', error);
      throw error;
    }
  }

  /**
   * Get teacher availability
   */
  static async getTeacherAvailability(teacherId: string, date?: string): Promise<any> {
    try {
      // Get teacher's availability schedule
      const teacher = await prisma.user.findFirst({
        where: {
          id: teacherId,
          role: {
            in: ['JUNIOR_MANAGER', 'SENIOR_MANAGER']
          }
        },
        select: {
          id: true,
          status: true
        }
      });

      if (!teacher) {
        throw new Error('Teacher not found');
      }

      // Return availability data
      return {
        teacherId,
        availability: ['Lun-Ven'],
        timezone: 'UTC',
        availableSlots: this.generateAvailableSlots(date)
      };
    } catch (error) {
      logger.error('Error fetching teacher availability:', error);
      throw error;
    }
  }

  /**
   * Book a session with teacher
   */
  static async bookSession(teacherId: string, userId: string, bookingData: any): Promise<any> {
    try {
      // Verify user has Pro+ subscription
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });

      if (!user || user.subscriptionTier !== 'PRO') {
        throw new Error('Pro+ subscription required to book sessions');
      }

      // Create live session booking
      const session = await prisma.liveSession.create({
        data: {
          title: `Session 1-on-1 - ${bookingData.subject}`,
          description: `Session privée avec ${bookingData.teacherName || 'Formateur'}`,
          instructor: bookingData.teacherName || 'Formateur',
          coInstructors: [],
          date: new Date(bookingData.date),
          duration: bookingData.duration || 60,
          maxParticipants: 1,
          requiredTier: 'PRO',
          level: bookingData.level,
          category: 'ORAL',
          tags: [bookingData.subject, 'one-on-one'],
          createdById: teacherId,
          status: 'SCHEDULED'
        }
      });

      // Create session participant
      await prisma.liveSessionParticipant.create({
        data: {
          liveSessionId: session.id,
          userId: userId,
          joinedAt: new Date()
        }
      });

      return {
        sessionId: session.id,
        teacherId,
        userId,
        date: session.date,
        duration: session.duration,
        subject: bookingData.subject,
        level: bookingData.level
      };
    } catch (error) {
      logger.error('Error booking session:', error);
      throw error;
    }
  }

  // Helper methods
  private static getSortOrder(sortBy?: string): any {
    switch (sortBy) {
      case 'rating':
        return { rating: 'desc' };
      case 'experience':
        return { experience: 'desc' };
      case 'availability':
        return { availability: 'asc' };
      default:
        return { rating: 'desc' };
    }
  }

  private static checkAvailability(availability?: string[]): boolean {
    if (!availability || availability.length === 0) return false;
    
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Simple availability check - can be enhanced
    return availability.some(avail => {
      if (avail.includes('Lun-Ven')) {
        return dayOfWeek >= 1 && dayOfWeek <= 5;
      }
      if (avail.includes('Mar-Sam')) {
        return dayOfWeek >= 2 && dayOfWeek <= 6;
      }
      return true; // Default to available
    });
  }

  private static generateAvailableSlots(date?: string): string[] {
    // Generate time slots for the given date
    const slots = [];
    const startHour = 9;
    const endHour = 18;
    
    for (let hour = startHour; hour < endHour; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    
    return slots;
  }
}
