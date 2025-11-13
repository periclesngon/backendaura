import { prisma } from '@/database/connection';
import { ApiResponse } from '../types';

export interface TutorProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  bio: string;
  title?: string; // Professional title (e.g., "Formateur Expert")
  specialties: string[]; // TCF, TEF
  subjects?: string[]; // Grammaire, Expression Orale, etc. (sujets)
  languages: string[];
  availability: string[]; // Working time (disponibilité) - e.g., "Lun-Ven"
  workingHours?: string[]; // Specific time slots - e.g., ["09:00-12:00", "14:00-17:00"]
  location: string | null;
  phone?: string; // Phone number
  website?: string; // Website URL
  acceptsMessages?: boolean; // Whether tutor accepts messages from students
  profilePicture: string | null;
  isActive: boolean;
  status?: string; // Optional: User status (ONLINE, ACTIVE, etc.) for frontend online/offline display
}

export interface StudentRequest {
  id: string;
  studentId: string;
  tutorId: string;
  requestType: 'session' | 'message' | 'expertise';
  subject: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  requestedDate: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: string;
  // Additional fields for UI
  studentName?: string;
  studentEmail?: string;
  studentAvatar?: string;
  tutorName?: string;
  tutorEmail?: string;
  tutorAvatar?: string;
  feedbackId?: string;
  response?: string;
  completedDate?: string;
}

export class MarketplaceService {
  // Get tutor profile for manager/admin
  static async getTutorProfile(userId: string): Promise<ApiResponse<TutorProfile | null>> {
    try {
      console.log('📋 getTutorProfile called for userId:', userId);
      
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        console.error('❌ User not found for getTutorProfile:', userId);
        return {
          success: false,
          error: { message: 'User not found', statusCode: 404 }
        };
      }

      console.log('✅ User found for getTutorProfile:', {
        userId: user.id,
        email: user.email,
        hasPreferences: !!user.preferences
      });

      // Create a basic tutor profile from user data
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Formateur';
      
      // Safely parse preferences (handle null, string, or object)
      let preferences: any = {};
      try {
        if (user.preferences) {
          if (typeof user.preferences === 'string') {
            preferences = JSON.parse(user.preferences);
          } else if (typeof user.preferences === 'object') {
            preferences = user.preferences;
          }
        }
      } catch (parseError: any) {
        console.error('❌ Error parsing user preferences:', {
          error: parseError.message,
          userId: user.id,
          preferencesType: typeof user.preferences,
          preferencesPreview: typeof user.preferences === 'string' ? user.preferences.substring(0, 100) : 'object'
        });
        // Continue with empty preferences object
        preferences = {};
      }
      
      const marketplaceProfile = preferences.marketplaceProfile || {};
      
      // Check activation status - must be explicitly true
      const isActive = marketplaceProfile.isActive === true;
      
      // Determine online status: ONLY ONLINE status means user is currently online
      // ACTIVE = user has account (not necessarily online)
      // ONLINE = user is currently logged in/online on platform
      // OFFLINE = user has account but not online
      const isCurrentlyOnline = user.status === 'ONLINE';
      const displayStatus = user.status || 'OFFLINE'; // Use actual status from DB
      
      // Get location from marketplace profile first, then user.city
      const profileLocation = marketplaceProfile.location || user.city || null;
      
      // Check if tutor accepts messages from students
      const acceptsMessages = marketplaceProfile.acceptsMessages !== false // Default to true
      
      const profile: TutorProfile = {
        id: user.id,
        userId: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        fullName: fullName,
        bio: marketplaceProfile.bio || user.bio || `Formateur expérimenté en français langue étrangère avec une expertise dans la préparation aux examens TCF/TEF.`,
        title: marketplaceProfile.title || undefined, // Professional title
        phone: marketplaceProfile.phone || undefined, // Phone number
        website: marketplaceProfile.website || undefined, // Website URL
        acceptsMessages: acceptsMessages, // Whether tutor accepts messages from students
        specialties: Array.isArray(marketplaceProfile.specialties) 
          ? marketplaceProfile.specialties 
          : marketplaceProfile.specialties 
          ? [marketplaceProfile.specialties] 
          : [],
        languages: Array.isArray(marketplaceProfile.languages) 
          ? marketplaceProfile.languages 
          : marketplaceProfile.languages 
          ? [marketplaceProfile.languages] 
          : ['Français', 'English'],
        subjects: Array.isArray(marketplaceProfile.subjects)
          ? marketplaceProfile.subjects
          : marketplaceProfile.subjects
          ? [marketplaceProfile.subjects]
          : [], // Subjects (sujets) - can be empty if not set
        availability: Array.isArray(marketplaceProfile.availability)
          ? marketplaceProfile.availability
          : marketplaceProfile.availability
          ? [marketplaceProfile.availability]
          : ['Disponible'],
        workingHours: Array.isArray(marketplaceProfile.workingHours)
          ? marketplaceProfile.workingHours
          : marketplaceProfile.workingHours
          ? [marketplaceProfile.workingHours]
          : [], // Working hours (specific time slots)
        location: profileLocation, // Real location from marketplaceProfile.location or user.city
        profilePicture: user.profilePicture || null,
        isActive: isActive, // Explicitly check if === true
        status: displayStatus // Include status so frontend shows online/offline correctly
      };
      
      console.log('✅ getTutorProfile - Profile created:', {
        userId: user.id,
        isActive: isActive,
        hasSpecialties: profile.specialties.length > 0,
        hasLocation: !!profile.location
      });

      return {
        success: true,
        data: profile
      };
    } catch (error: any) {
      console.error('❌ Error getting tutor profile:', {
        error: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack?.substring(0, 1000),
        userId,
        errorType: error.constructor?.name,
        errorKeys: Object.keys(error)
      });
      return {
        success: false,
        error: { 
          message: error.message || 'Failed to get tutor profile', 
          statusCode: 500,
          code: error.code
        }
      };
    }
  }

  // Get student requests for tutor
  static async getStudentRequests(tutorId: string, status?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED', requestType?: 'SESSION' | 'MESSAGE' | 'EXPERTISE'): Promise<ApiResponse<StudentRequest[]>> {
    try {
      console.log('📋 getStudentRequests called for tutorId:', tutorId, 'status:', status);
      
      // Validate tutorId
      if (!tutorId) {
        console.error('❌ tutorId is missing in getStudentRequests');
        return {
          success: false,
          error: { message: 'Tutor ID is required', statusCode: 400 }
        };
      }

      // Build where clause
      const where: any = { tutorId };
      if (status) {
        where.status = status;
      }
      if (requestType) {
        where.requestType = requestType;
      }

      // Query marketplace requests from database
      // Note: Prisma client uses camelCase, model is MarketplaceRequest, table is marketplace_requests
      let requests;
      try {
        // Check if marketplaceRequest exists on Prisma client
        const prismaAny = prisma as any;
        if (!prismaAny.marketplaceRequest) {
          console.error('❌ marketplaceRequest not found on Prisma client:', {
            prismaKeys: Object.keys(prisma).filter(k => !k.startsWith('$')),
            tutorId
          });
          return {
            success: false,
            error: { 
              message: 'MarketplaceRequest model not available. Please ensure database migrations are applied.', 
              statusCode: 500 
            }
          };
        }

        requests = await prismaAny.marketplaceRequest.findMany({
          where,
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profilePicture: true,
                subscriptionTier: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        });
      } catch (prismaError: any) {
        console.error('❌ Prisma query error in getStudentRequests:', {
          error: prismaError.message,
          code: prismaError.code,
          meta: prismaError.meta,
          tutorId,
          where,
          stack: prismaError.stack?.substring(0, 1000),
          prismaHasMarketplaceRequest: !!(prisma as any).marketplaceRequest,
          prismaKeys: Object.keys(prisma).filter(k => !k.startsWith('$') && k.includes('marketplace'))
        });
        
        // Handle specific Prisma errors
        if (prismaError.code === 'P2021' || prismaError.code === 'P2025') {
          // Table does not exist or record not found
          return {
            success: false,
            error: { 
              message: 'Marketplace table not found. Please run database migrations.', 
              statusCode: 500,
              code: prismaError.code
            }
          };
        }
        
        // For other Prisma errors, return a user-friendly message
        return {
          success: false,
          error: { 
            message: prismaError.message || 'Database error while fetching requests', 
            statusCode: 500,
            code: prismaError.code
          }
        };
      }

      console.log('✅ Found marketplace requests:', requests?.length || 0);

      // Handle case where requests is null/undefined
      if (!requests || !Array.isArray(requests)) {
        console.warn('⚠️ Requests query returned invalid data:', requests);
        return {
          success: true,
          data: []
        };
      }

      // Transform to StudentRequest format
      const studentRequests: StudentRequest[] = requests.map((request: any) => {
        try {
          if (!request || !request.student) {
            console.error('⚠️ Request missing student relation:', {
              requestId: request?.id || 'unknown',
              hasRequest: !!request,
              hasStudent: !!request?.student,
              requestKeys: request ? Object.keys(request) : []
            });
            return null;
          }

          // Safely transform with null checks
          const studentRequest: StudentRequest = {
            id: request.id,
            studentId: request.studentId,
            tutorId: request.tutorId,
            requestType: (request.requestType?.toLowerCase() || 'session') as 'session' | 'message' | 'expertise',
            subject: request.subject || '',
            description: request.description || '',
            urgency: (request.urgency?.toLowerCase() || 'medium') as 'low' | 'medium' | 'high',
            requestedDate: request.requestedDate?.toISOString() || request.createdAt?.toISOString() || new Date().toISOString(),
            status: (request.status?.toLowerCase() || 'pending') as 'pending' | 'accepted' | 'declined' | 'completed',
            createdAt: request.createdAt?.toISOString() || new Date().toISOString(),
            // Additional fields for UI
            studentName: `${request.student?.firstName || ''} ${request.student?.lastName || ''}`.trim() || 'Student',
            studentEmail: request.student?.email || '',
            studentAvatar: request.student?.profilePicture || undefined,
            feedbackId: request.feedbackId || undefined,
            response: request.response || undefined
          };
          
          return studentRequest;
        } catch (transformError: any) {
          console.error('❌ Error transforming request:', {
            requestId: request?.id || 'unknown',
            error: transformError.message,
            request: JSON.stringify(request).substring(0, 200)
          });
          return null;
        }
      }).filter((req: any) => req !== null) as StudentRequest[];
      
      console.log('✅ Retrieved student requests:', {
        tutorId,
        count: studentRequests.length,
        status,
        firstRequest: studentRequests.length > 0 ? studentRequests[0] : null
      });
      
      return {
        success: true,
        data: studentRequests
      };
    } catch (error: any) {
      console.error('❌ Error getting student requests:', {
        error: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack?.substring(0, 1000),
        tutorId,
        errorType: error.constructor?.name,
        errorKeys: Object.keys(error)
      });
      
      // Return error response instead of throwing
      // This ensures the route handler gets a proper response
      return {
        success: false,
        error: { 
          message: error.message || 'Failed to fetch student requests', 
          statusCode: 500,
          code: error.code
        }
      };
    }
  }

  // Get all active tutors for student marketplace
  static async getAllTutors(): Promise<ApiResponse<TutorProfile[]>> {
    try {
      console.log('📚 Fetching all tutors for marketplace...');
      
      // Fetch ALL managers/admins regardless of status
      // Status filter removed: we want to show all activated profiles, then display their actual status
      const tutors = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'] }
          // Removed status filter - fetch all and filter by marketplaceProfile.isActive only
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          bio: true,
          phone: true,
          city: true,
          role: true,
          status: true,
          profilePicture: true,
          profileImage: true, // Include profileImage field
          preferences: true,
          createdAt: true,
          lastActivityAt: true,
          _count: {
            select: {
              createdLiveSessions: true,
              createdCourses: true
            }
          }
        }
      });

      console.log(`✅ Found ${tutors.length} total tutors (ADMIN, SENIOR_MANAGER, JUNIOR_MANAGER)`);
      
      // Log all tutors found for debugging
      tutors.forEach(tutor => {
        console.log(`📋 Tutor found: ${tutor.email} (${tutor.role}, status=${tutor.status})`);
      });

      // Filter tutors to only include those with ACTIVATED marketplace profiles
      // ADMIN users are ALWAYS included (they should always be visible)
      // SENIOR_MANAGER must have isActive === true
      // JUNIOR_MANAGER is excluded (only for Pro users)
      const activatedTutors = tutors.filter(user => {
        // ADMIN users are ALWAYS included - they should always be visible
        if (user.role === 'ADMIN') {
          console.log(`✅ Including ADMIN ${user.email} (${user.firstName} ${user.lastName}) - always visible, status=${user.status}`);
          return true;
        }
        
        // Only ADMIN and SENIOR_MANAGER are eligible
        if (user.role !== 'SENIOR_MANAGER') {
          console.log(`⚠️ Excluding ${user.email} - role: ${user.role}`);
          return false;
        }
        
        // For SENIOR_MANAGER, check if marketplace profile is activated
        // Safely parse preferences (handle null, string, or object)
        let preferences: any = {};
        try {
          if (user.preferences) {
            if (typeof user.preferences === 'string') {
              preferences = JSON.parse(user.preferences);
            } else if (typeof user.preferences === 'object') {
              preferences = user.preferences;
            }
          }
        } catch (parseError: any) {
          console.error(`❌ Error parsing preferences for ${user.email}:`, parseError.message);
          preferences = {};
        }
        
        const marketplaceProfile = preferences.marketplaceProfile || {};
        const isActive = marketplaceProfile.isActive;
        
        console.log(`🔍 Checking ${user.email} (${user.role}): isActive=${isActive}, type=${typeof isActive}, strict=${isActive === true}`);
        
        // SENIOR_MANAGER must be explicitly activated (isActive === true)
        // Do NOT default to true - must be explicitly set
        const passes = isActive === true;
        if (!passes) {
          console.log(`   ❌ Filtered out: isActive is not exactly true`);
        }
        return passes;
      });

      console.log(`✅ Filtered to ${activatedTutors.length} activated tutors`);
      
      if (activatedTutors.length === 0) {
        console.warn('⚠️ WARNING: No activated tutors found! Check if profiles are activated.');
        console.log('📋 All tutors found:', tutors.map(u => {
          let prefs: any = {};
          try {
            if (u.preferences) {
              prefs = typeof u.preferences === 'string' ? JSON.parse(u.preferences) : u.preferences;
            }
          } catch (e) {}
          return `${u.email} (${u.role}, status=${u.status}, isActive=${prefs.marketplaceProfile?.isActive})`;
        }));
      } else {
        console.log('📋 Activated tutors:', activatedTutors.map(u => `${u.email} (${u.firstName} ${u.lastName}, ${u.role}, status=${u.status})`));
      }

      const tutorProfiles: TutorProfile[] = activatedTutors.map(user => {
        // Safely parse preferences (handle null, string, or object) - same as filter
        let preferences: any = {};
        try {
          if (user.preferences) {
            if (typeof user.preferences === 'string') {
              preferences = JSON.parse(user.preferences);
            } else if (typeof user.preferences === 'object') {
              preferences = user.preferences;
            }
          }
        } catch (parseError: any) {
          console.error(`❌ Error parsing preferences for ${user.email} in mapping:`, parseError.message);
          preferences = {};
        }
        
        const marketplaceProfile = preferences.marketplaceProfile || {};
        
        // Determine if profile is active - MUST be explicitly true (same as filter)
        // Only tutors that passed the filter (isActive === true) should be here
        const isActive = marketplaceProfile.isActive === true;
        
        // Build tutor name - just the name, no role prefix
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Formateur';
        
        // Get specialties from marketplace profile (required, no defaults)
        const specialties = Array.isArray(marketplaceProfile.specialties) 
          ? marketplaceProfile.specialties 
          : marketplaceProfile.specialties 
          ? [marketplaceProfile.specialties] 
          : []; // Empty array if not set - must be set by tutor
        
        // Determine online status: ONLY ONLINE status means user is currently online
        // ACTIVE = user has account (not necessarily online)
        // ONLINE = user is currently logged in/online on platform
        // OFFLINE = user has account but not online
        const isCurrentlyOnline = user.status === 'ONLINE';
        const displayStatus = user.status || 'OFFLINE'; // Use actual status from DB
        
        // Get location from marketplace profile, then user.city, then null
        const tutorLocation = marketplaceProfile.location || user.city || null;
        
        // Check if tutor accepts messages from students
        const acceptsMessages = marketplaceProfile.acceptsMessages !== false // Default to true
        
        return {
          id: user.id,
          userId: user.id,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          fullName: fullName,
          bio: marketplaceProfile.bio || user.bio || `Formateur expérimenté en français langue étrangère.`,
          title: marketplaceProfile.title || undefined, // Professional title
          phone: marketplaceProfile.phone || undefined, // Phone number
          website: marketplaceProfile.website || undefined, // Website URL
          acceptsMessages: acceptsMessages, // Whether tutor accepts messages from students
          specialties: specialties, // Must be set in marketplace profile
          location: tutorLocation, // Real location from profile or user.city
          profilePicture: user.profileImage || user.profilePicture || null, // Prioritize profileImage, fallback to profilePicture
          status: displayStatus, // CRITICAL: Include status for frontend online/offline check
          isActive: isActive, // CRITICAL: Include isActive in response
          languages: Array.isArray(marketplaceProfile.languages) 
            ? marketplaceProfile.languages 
            : marketplaceProfile.languages 
            ? [marketplaceProfile.languages] 
            : ['Français', 'English'],
          subjects: Array.isArray(marketplaceProfile.subjects)
            ? marketplaceProfile.subjects
            : marketplaceProfile.subjects
            ? [marketplaceProfile.subjects]
            : [], // Subjects (sujets)
          availability: Array.isArray(marketplaceProfile.availability)
            ? marketplaceProfile.availability
            : marketplaceProfile.availability
            ? [marketplaceProfile.availability]
            : ['Disponible'],
          workingHours: Array.isArray(marketplaceProfile.workingHours)
            ? marketplaceProfile.workingHours
            : marketplaceProfile.workingHours
            ? [marketplaceProfile.workingHours]
            : [] // Working hours (specific time slots)
        };
      });

      console.log(`✅ Returning ${tutorProfiles.length} tutor profiles`);
      if (tutorProfiles.length > 0) {
        console.log('📋 Sample tutor profile:', {
          id: tutorProfiles[0].id,
          fullName: tutorProfiles[0].fullName,
          isActive: tutorProfiles[0].isActive,
          status: tutorProfiles[0].status,
          specialties: tutorProfiles[0].specialties,
          location: tutorProfiles[0].location
        });
      } else {
        console.warn('⚠️ WARNING: No tutor profiles returned despite filtering!');
      }

      return {
        success: true,
        data: tutorProfiles
      };
    } catch (error: any) {
      console.error('❌ Error getting all tutors:', error);
      console.error('Error stack:', error.stack);
      return {
        success: false,
        error: { message: error.message || 'Failed to get tutors', statusCode: 500 }
      };
    }
  }

  // Update tutor profile
  static async updateTutorProfile(userId: string, updates: Partial<TutorProfile>): Promise<ApiResponse<TutorProfile>> {
    try {
      // Get current user to access preferences
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: { message: 'User not found', statusCode: 404 }
        };
      }

      // Get current preferences or initialize empty object
      let currentPreferences: any = {};
      try {
        if (user.preferences) {
          if (typeof user.preferences === 'string') {
            currentPreferences = JSON.parse(user.preferences);
          } else if (typeof user.preferences === 'object') {
            currentPreferences = user.preferences;
          }
        }
      } catch (parseError) {
        console.error('Error parsing preferences:', parseError);
        currentPreferences = {};
      }

      // Update marketplace profile in preferences
      const updatedPreferences = {
        ...currentPreferences,
        marketplaceProfile: {
          ...(currentPreferences.marketplaceProfile || {}),
          ...(updates.bio !== undefined && { bio: updates.bio }),
          ...(updates.acceptsMessages !== undefined && { acceptsMessages: updates.acceptsMessages }),
          ...(updates.title !== undefined && { title: updates.title }), // Save title
          ...(updates.phone !== undefined && { phone: updates.phone }), // Save phone
          ...(updates.website !== undefined && { website: updates.website }), // Save website
          ...(updates.location !== undefined && { location: updates.location }), // Always save location in marketplaceProfile
          ...(updates.specialties !== undefined && { specialties: updates.specialties }),
          ...(updates.subjects !== undefined && { subjects: updates.subjects }), // Save subjects (sujets)
          ...(updates.languages !== undefined && { languages: updates.languages }),
          ...(updates.availability !== undefined && { availability: updates.availability }), // Save working time periods (disponibilité)
          ...(updates.workingHours !== undefined && { workingHours: updates.workingHours }) // Save working hours (specific time slots)
        }
      };
      
      console.log('💾 Saving location update:', {
        userId,
        location: updates.location,
        currentLocation: currentPreferences.marketplaceProfile?.location,
        updatedLocation: updatedPreferences.marketplaceProfile?.location,
        willUpdateCity: updates.location !== undefined
      });

      // Update user basic info and preferences
      // IMPORTANT: Save location to both user.city AND marketplaceProfile.location for consistency
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          bio: updates.bio !== undefined ? updates.bio : user.bio,
          city: updates.location !== undefined ? (updates.location || null) : user.city, // Also update user.city
          preferences: updatedPreferences as any // Save location in marketplaceProfile.location
        },
        include: {
          _count: {
            select: {
              createdLiveSessions: true,
              createdCourses: true
            }
          }
        }
      });

      console.log('✅ Tutor profile updated:', {
        userId,
        hasSpecialties: !!updates.specialties,
        specialtiesCount: updates.specialties?.length || 0,
        location: updates.location,
        hasLocation: !!updates.location,
        savedLocation: updatedPreferences.marketplaceProfile?.location
      });

      // Return updated profile
      const profile = await this.getTutorProfile(userId);
      return profile;
    } catch (error: any) {
      console.error('Error updating tutor profile:', error);
      return {
        success: false,
        error: { message: error.message || 'Failed to update tutor profile', statusCode: 500 }
      };
    }
  }

  // Activate/deactivate tutor profile
  static async activateTutorProfile(userId: string, isActive: boolean): Promise<ApiResponse<TutorProfile | null>> {
    try {
      // Check if user is manager or admin
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(user.role)) {
        return {
          success: false,
          error: { message: 'Unauthorized: Only managers and admins can manage marketplace profiles', statusCode: 403 }
        };
      }

      // Get current preferences or initialize empty object
      // IMPORTANT: If preferences is null, we need to create a new object
      const currentPreferences = user.preferences 
        ? (typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences)
        : {};
      
      // Update marketplace activation status in preferences
      const updatedPreferences = {
        ...currentPreferences,
        marketplaceProfile: {
          ...(currentPreferences.marketplaceProfile || {}),
          isActive: isActive, // Explicitly set to true or false
          activatedAt: isActive ? new Date().toISOString() : (currentPreferences.marketplaceProfile?.activatedAt || null),
          deactivatedAt: !isActive ? new Date().toISOString() : (currentPreferences.marketplaceProfile?.deactivatedAt || null)
        }
      };

      console.log('🔧 Activating tutor profile:', {
        userId,
        isActive,
        currentPreferences: JSON.stringify(currentPreferences),
        updatedPreferences: JSON.stringify(updatedPreferences),
        preferencesType: typeof user.preferences
      });

      // Update user with marketplace activation status
      await prisma.user.update({
        where: { id: userId },
        data: {
          preferences: updatedPreferences as any, // Cast to any for Prisma JSON field
          lastActivityAt: new Date()
        }
      });

      console.log('✅ Preferences updated in database for user:', userId);

      console.log(`✅ Tutor profile ${isActive ? 'activated' : 'deactivated'} for user ${userId}`);

      // Return updated profile
      const profile = await this.getTutorProfile(userId);
      return {
        success: true,
        data: profile.data,
        message: `Profile ${isActive ? 'activated' : 'deactivated'} successfully`
      };
    } catch (error: any) {
      console.error('❌ Error activating tutor profile:', {
        error: error.message,
        stack: error.stack,
        userId
      });
      return {
        success: false,
        error: { message: 'Failed to activate tutor profile', statusCode: 500 }
      };
    }
  }

  // Create student request
  static async createStudentRequest(
    studentId: string,
    tutorId: string,
    requestData: {
      requestType: 'SESSION' | 'MESSAGE' | 'EXPERTISE';
      subject: string;
      description: string;
      urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
      requestedDate?: Date;
      feedbackId?: string;
      metadata?: any;
    }
  ): Promise<ApiResponse<StudentRequest>> {
    try {
      console.log('📝 Creating student request:', { studentId, tutorId, requestData });

      // Validate student has Pro+ subscription
      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { subscriptionTier: true, role: true }
      });

      if (!student || !['PRO', 'PREMIUM'].includes(student.subscriptionTier)) {
        return {
          success: false,
          error: { message: 'Pro+ subscription required to request tutors', statusCode: 403 }
        };
      }

      // Validate tutor exists and is a manager/admin
      const tutor = await prisma.user.findUnique({
        where: { id: tutorId },
        select: { role: true, status: true }
      });

      if (!tutor || !['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(tutor.role)) {
        return {
          success: false,
          error: { message: 'Invalid tutor selected', statusCode: 404 }
        };
      }

      // Create request
      const request = await (prisma as any).marketplaceRequest.create({
        data: {
          studentId,
          tutorId,
          requestType: requestData.requestType,
          subject: requestData.subject,
          description: requestData.description,
          urgency: requestData.urgency || 'MEDIUM',
          requestedDate: requestData.requestedDate || null,
          feedbackId: requestData.feedbackId || null,
          metadata: requestData.metadata || null,
          status: 'PENDING'
        },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profilePicture: true
            }
          }
        }
      });

      // Transform to StudentRequest format
      const studentRequest: StudentRequest = {
        id: request.id,
        studentId: request.studentId,
        tutorId: request.tutorId,
        requestType: request.requestType.toLowerCase() as 'session' | 'message' | 'expertise',
        subject: request.subject,
        description: request.description,
        urgency: request.urgency.toLowerCase() as 'low' | 'medium' | 'high',
        requestedDate: request.requestedDate?.toISOString() || request.createdAt.toISOString(),
        status: request.status.toLowerCase() as 'pending' | 'accepted' | 'declined' | 'completed',
        createdAt: request.createdAt.toISOString(),
        studentName: `${request.student.firstName} ${request.student.lastName}`,
        studentEmail: request.student.email,
        studentAvatar: request.student.profilePicture || undefined,
        feedbackId: request.feedbackId || undefined
      };

      console.log('✅ Student request created:', { requestId: request.id });

      // Send notification to tutor about new request
      try {
        const { NotificationService } = await import('./notificationService');
        const { NotificationType } = await import('@prisma/client');
        
        await NotificationService.sendSystemNotification(
          tutorId,
          'Nouvelle demande d\'expertise',
          `${request.student.firstName} ${request.student.lastName} a soumis une nouvelle demande "${request.subject}" (${request.requestType.toLowerCase()}).`,
          NotificationType.INFO,
          {
            requestId: request.id,
            studentId: request.studentId,
            studentName: `${request.student.firstName} ${request.student.lastName}`,
            subject: request.subject,
            requestType: request.requestType,
            urgency: request.urgency
          }
        );

        console.log(`📧 Notification sent to tutor ${tutorId} about new request ${request.id}`);
      } catch (notificationError: any) {
        // Don't fail the request if notification fails
        console.error('❌ Failed to send notification to tutor:', {
          error: notificationError.message,
          requestId: request.id,
          tutorId
        });
      }

      return {
        success: true,
        data: studentRequest,
        message: 'Request submitted successfully'
      };
    } catch (error: any) {
      console.error('❌ Error creating student request:', {
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: { 
          message: error.message || 'Failed to create student request', 
          statusCode: 500 
        }
      };
    }
  }

  // Handle student request action (accept/decline/complete)
  static async handleStudentRequest(
    requestId: string, 
    action: 'accept' | 'decline' | 'complete',
    managerId: string,
    response?: string
  ): Promise<ApiResponse<any>> {
    try {
      console.log(`🔧 Handling request ${requestId} with action: ${action} by manager: ${managerId}`);

      // Check if manager exists and is authorized
      const manager = await prisma.user.findUnique({
        where: { id: managerId }
      });

      if (!manager || !['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(manager.role)) {
        return {
          success: false,
          error: { message: 'Unauthorized: Only managers and admins can handle requests', statusCode: 403 }
        };
      }

      // Find the request
      const request = await (prisma as any).marketplaceRequest.findUnique({
        where: { id: requestId },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!request) {
        return {
          success: false,
          error: { message: 'Request not found', statusCode: 404 }
        };
      }

      // Verify tutor ownership (only the assigned tutor can handle the request, or admin)
      if (request.tutorId !== managerId && manager.role !== 'ADMIN') {
        return {
          success: false,
          error: { message: 'Unauthorized: You can only handle requests assigned to you', statusCode: 403 }
        };
      }

      // Update request status
      const statusMap: { [key: string]: 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED' } = {
        'accept': 'ACCEPTED',
        'decline': 'DECLINED',
        'complete': 'COMPLETED',
        'cancel': 'CANCELLED'
      };

      const updateData: any = {
        status: statusMap[action] || 'PENDING',
        updatedAt: new Date()
      };

      if (response) {
        updateData.response = response;
      }

      if (action === 'complete') {
        updateData.completedDate = new Date();
      }

      const updatedRequest = await (prisma as any).marketplaceRequest.update({
        where: { id: requestId },
        data: updateData,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      console.log(`✅ Request ${requestId} ${action}ed successfully`);

      // Send notification to student about request status change
      try {
        const { NotificationService } = await import('./notificationService');
        const prismaClient = await import('@prisma/client');
        const NotificationType = prismaClient.NotificationType;
        
        let notificationTitle = '';
        let notificationMessage = '';
        let notificationType: typeof NotificationType[keyof typeof NotificationType] = NotificationType.INFO;

        if (action === 'accept') {
          notificationTitle = 'Demande acceptée';
          notificationMessage = `${request.student.firstName}, votre demande "${updatedRequest.subject}" a été acceptée par ${manager.firstName} ${manager.lastName}.${updatedRequest.response ? ` Réponse: ${updatedRequest.response}` : ''}`;
          notificationType = NotificationType.SUCCESS as typeof NotificationType[keyof typeof NotificationType];
        } else if (action === 'decline') {
          notificationTitle = 'Demande déclinée';
          notificationMessage = `${request.student.firstName}, votre demande "${updatedRequest.subject}" a été déclinée par ${manager.firstName} ${manager.lastName}.${updatedRequest.response ? ` Raison: ${updatedRequest.response}` : ''}`;
          notificationType = NotificationType.WARNING as typeof NotificationType[keyof typeof NotificationType];
        } else if (action === 'complete') {
          notificationTitle = 'Demande complétée';
          notificationMessage = `${request.student.firstName}, votre demande "${updatedRequest.subject}" a été marquée comme complétée par ${manager.firstName} ${manager.lastName}.${updatedRequest.response ? ` Notes: ${updatedRequest.response}` : ''}`;
          notificationType = NotificationType.SUCCESS as typeof NotificationType[keyof typeof NotificationType];
        }

        // Send notification to student
        await NotificationService.sendSystemNotification(
          request.studentId,
          notificationTitle,
          notificationMessage,
          notificationType,
          {
            requestId: updatedRequest.id,
            action,
            tutorId: managerId,
            tutorName: `${manager.firstName} ${manager.lastName}`,
            subject: updatedRequest.subject,
            requestType: updatedRequest.requestType,
            response: updatedRequest.response
          }
        );

        console.log(`📧 Notification sent to student ${request.studentId} about request ${requestId} ${action}`);
      } catch (notificationError: any) {
        // Don't fail the request if notification fails
        console.error('❌ Failed to send notification:', {
          error: notificationError.message,
          requestId,
          studentId: request.studentId
        });
      }

      return {
        success: true,
        data: {
          id: updatedRequest.id,
          status: updatedRequest.status.toLowerCase(),
          action,
          managerId,
          handledAt: updatedRequest.updatedAt.toISOString(),
          response: updatedRequest.response,
          completedDate: updatedRequest.completedDate?.toISOString()
        },
        message: `Request ${action}ed successfully`
      };
    } catch (error: any) {
      console.error('❌ Error handling student request:', {
        error: error.message,
        stack: error.stack,
        requestId,
        action
      });
      return {
        success: false,
        error: { 
          message: error.message || 'Failed to handle student request', 
          statusCode: 500 
        }
      };
    }
  }

  // Get student's own requests
  static async getStudentOwnRequests(studentId: string, status?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED'): Promise<ApiResponse<StudentRequest[]>> {
    try {
      const where: any = { studentId };
      if (status) {
        where.status = status;
      }

      const requests = await (prisma as any).marketplaceRequest.findMany({
        where,
        include: {
          tutor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profilePicture: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const studentRequests: StudentRequest[] = requests.map(request => ({
        id: request.id,
        studentId: request.studentId,
        tutorId: request.tutorId,
        requestType: request.requestType.toLowerCase() as 'session' | 'message' | 'expertise',
        subject: request.subject,
        description: request.description,
        urgency: request.urgency.toLowerCase() as 'low' | 'medium' | 'high',
        requestedDate: request.requestedDate?.toISOString() || request.createdAt.toISOString(),
        status: request.status.toLowerCase() as 'pending' | 'accepted' | 'declined' | 'completed',
        createdAt: request.createdAt.toISOString(),
        tutorName: `${request.tutor.firstName} ${request.tutor.lastName}`,
        tutorEmail: request.tutor.email,
        tutorAvatar: request.tutor.profilePicture || undefined,
        feedbackId: request.feedbackId || undefined,
        response: request.response || undefined
      }));

      return {
        success: true,
        data: studentRequests
      };
    } catch (error: any) {
      console.error('❌ Error getting student own requests:', error);
      return {
        success: false,
        error: { message: 'Failed to get student requests', statusCode: 500 }
      };
    }
  }

  // Get all unique specialties from all tutors
  // Returns only TCF and TEF as these are the only valid specialties
  static async getAllSpecialties(): Promise<ApiResponse<string[]>> {
    try {
      console.log('📋 Returning available specialties: TCF, TEF');
      
      // Only TCF and TEF are valid specialties
      const specialtiesArray = ['TCF', 'TEF'];
      
      return {
        success: true,
        data: specialtiesArray
      };
    } catch (error: any) {
      console.error('❌ Error getting all specialties:', error);
      return {
        success: false,
        error: { message: error.message || 'Failed to get specialties', statusCode: 500 }
      };
    }
  }

  // Get all unique subjects from tutors (Grammaire, Expression Orale, etc.)
  // Collects all unique subjects from tutor profiles
  static async getAllSubjects(): Promise<ApiResponse<string[]>> {
    try {
      console.log('📚 Getting all unique subjects from tutors...');
      
      const tutors = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'] },
          status: { in: ['ACTIVE', 'ONLINE'] }
        },
        select: {
          preferences: true
        }
      });

      const allSubjects = new Set<string>();
      
      tutors.forEach(user => {
        try {
          let preferences: any = {};
          if (user.preferences) {
            preferences = typeof user.preferences === 'string' 
              ? JSON.parse(user.preferences) 
              : user.preferences;
          }
          
          const marketplaceProfile = preferences.marketplaceProfile || {};
          const subjects = marketplaceProfile.subjects || marketplaceProfile.specialties || [];
          
          if (Array.isArray(subjects)) {
            subjects.forEach((subject: string) => {
              if (subject && typeof subject === 'string') {
                allSubjects.add(subject);
              }
            });
          }
        } catch (err) {
          console.error('Error parsing preferences for subjects:', err);
        }
      });

      // Default subjects if none found
      const defaultSubjects = [
        'Grammaire', 
        'Expression Orale', 
        'Méthodologie TCF/TEF', 
        'Vocabulaire', 
        'Phonétique', 
        'Conversation', 
        'Compréhension Orale', 
        'Compréhension Écrite', 
        'Expression Écrite',
        'TCF',
        'TEF'
      ];

      const subjectsArray = Array.from(allSubjects);
      const finalSubjects = subjectsArray.length > 0 ? subjectsArray : defaultSubjects;

      console.log(`✅ Returning ${finalSubjects.length} subjects`);
      return {
        success: true,
        data: finalSubjects
      };
    } catch (error: any) {
      console.error('❌ Error getting all subjects:', error);
      return {
        success: false,
        error: { message: error.message || 'Failed to get subjects', statusCode: 500 }
      };
    }
  }

  // Get all unique availability options from tutors
  static async getAllAvailabilityOptions(): Promise<ApiResponse<string[]>> {
    try {
      console.log('📅 Getting all unique availability options from tutors...');
      
      const tutors = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'] },
          status: { in: ['ACTIVE', 'ONLINE'] }
        },
        select: {
          preferences: true
        }
      });

      const allAvailability = new Set<string>();
      
      tutors.forEach(user => {
        try {
          let preferences: any = {};
          if (user.preferences) {
            preferences = typeof user.preferences === 'string' 
              ? JSON.parse(user.preferences) 
              : user.preferences;
          }
          
          const marketplaceProfile = preferences.marketplaceProfile || {};
          const availability = marketplaceProfile.availability || [];
          
          if (Array.isArray(availability)) {
            availability.forEach((avail: string) => {
              if (avail && typeof avail === 'string') {
                allAvailability.add(avail);
              }
            });
          }
        } catch (err) {
          console.error('Error parsing preferences for availability:', err);
        }
      });

      // Default availability options if none found
      const defaultAvailability = [
        'Lun-Ven',
        'Mar-Sam',
        'Lun-Dim',
        'Mer-Dim',
        'Lun-Sam',
        'Lun-Ven 18h-23h',
        'Week-end',
        'Soirées',
        'Disponible maintenant'
      ];

      const availabilityArray = Array.from(allAvailability);
      const finalAvailability = availabilityArray.length > 0 ? availabilityArray : defaultAvailability;

      console.log(`✅ Returning ${finalAvailability.length} availability options`);
      return {
        success: true,
        data: finalAvailability
      };
    } catch (error: any) {
      console.error('❌ Error getting availability options:', error);
      return {
        success: false,
        error: { message: error.message || 'Failed to get availability options', statusCode: 500 }
      };
    }
  }
}
