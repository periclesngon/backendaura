import { 
  User, 
  Course, 
  Test, 
  LiveSession, 
  Subscription, 
  TestAttempt,
  CourseEnrollment,
  UserProgress,
  Notification,
  UserNotification,
  Achievement,
  UserAchievement,
  Favorite,
  Payment,
  UserRole,
  UserStatus,
  SubscriptionTier,
  SubscriptionStatus,
  CourseLevel,
  CourseCategory,
  TestType,
  TestStatus,
  TestAttemptStatus,
  LiveSessionStatus,
  NotificationType,
  NotificationStatus,
  ContentType,
  PaymentStatus
} from '@prisma/client';

// Re-export Prisma types
export {
  User,
  Course,
  Test,
  LiveSession,
  Subscription,
  TestAttempt,
  CourseEnrollment,
  UserProgress,
  Notification,
  UserNotification,
  Achievement,
  UserAchievement,
  Favorite,
  Payment,
  UserRole,
  UserStatus,
  SubscriptionTier,
  SubscriptionStatus,
  CourseLevel,
  CourseCategory,
  TestType,
  TestStatus,
  TestAttemptStatus,
  LiveSessionStatus,
  NotificationType,
  NotificationStatus,
  ContentType,
  PaymentStatus
};

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    message: string;
    code?: string;
    statusCode?: number;
    stack?: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Authentication types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  id: string; // Add id property for compatibility
  userId: string;
  email: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  country?: string;
  role?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// User types
export interface UserProfile extends Omit<User, 'passwordHash'> {
  subscription?: Subscription;
  courseEnrollments?: any[];
  testAttempts?: any[];
  stats?: {
    coursesCompleted: number;
    testsCompleted: number;
    totalTimeSpent: number;
    averageScore: number;
  };
}

export interface UpdateUserProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  city?: string;
  bio?: string;
  profileImage?: string;
  preferences?: any;
}

// Course types
export interface CourseWithDetails extends Partial<Omit<Course, 'lessons' | 'createdBy'>> {
  // Required fields
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Custom createdBy field
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    name?: string; // Optional name field for compatibility
  };

  // Optional fields
  enrollments?: CourseEnrollment[];
  lessons?: any[] | number;
  lesson_items?: any[]; // Add lesson_items for Prisma compatibility
  userProgress?: UserProgress;
  isFavorited?: boolean;
  isEnrolled?: boolean;
  progress?: {
    completedLessons: number;
    totalLessons: number;
    percentage: number;
  };
  _count?: {
    lesson_items?: number;
    enrollments?: number;
    lessons?: number; // For backward compatibility
  };
}

export interface CreateCourseRequest {
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  level: CourseLevel;
  category: CourseCategory;
  requiredTier: SubscriptionTier;
  duration: number;
  lessons: number;
  difficulty: number;
  image?: string;
  tags: string[];
}

export interface UpdateCourseRequest extends Partial<CreateCourseRequest> {
  isPublished?: boolean;
}

// Test types
export interface TestWithDetails extends Test {
  createdBy: Pick<User, 'id' | 'firstName' | 'lastName'>;
  questions?: any[];
  userAttempts?: TestAttempt[];
  isFavorited?: boolean;
  bestScore?: number;
  attemptsCount?: number;
}

export interface CreateTestRequest {
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  type: TestType;
  level: CourseLevel;
  category: CourseCategory;
  requiredTier: SubscriptionTier;
  duration: number;
  questionCount: number;
  difficulty: number;
  passingScore: number;
  maxAttempts?: number;
  tags: string[];
  aiPowered?: boolean;
  hasAIFeedback?: boolean;
  isOfficial?: boolean;
  image?: string;
  // instructions?: string;
  levels?: CourseLevel[];
  subscriptions?: SubscriptionTier[];
}

export interface TestQuestion {
  id: string;
  questionText: string;
  questionTextEn?: string;
  type: string;
  options?: any[];
  correctAnswer: any;
  points: number;
  explanation?: string;
  explanationEn?: string;
  order: number;
  level: CourseLevel;
  category: CourseCategory;
}

export interface StartTestResponse {
  attemptId: string;
  questions: Omit<TestQuestion, 'correctAnswer' | 'explanation' | 'explanationEn'>[];
  timeLimit: number;
}

export interface SubmitTestRequest {
  attemptId: string;
  answers: {
    questionId: string;
    answer: any;
    timeSpent?: number;
  }[];
}

// Live Session types
export interface LiveSessionWithDetails extends LiveSession {
  createdBy: Pick<User, 'id' | 'firstName' | 'lastName'>;
  participants?: any[];
  participantCount?: number;
  isRegistered?: boolean;
  isFavorited?: boolean;
}

export interface CreateLiveSessionRequest {
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  instructor: string;
  coInstructors?: string[];
  date: Date;
  duration: number;
  maxParticipants: number;
  price?: number;
  currency?: string;
  requiredTier: SubscriptionTier;
  level?: CourseLevel;
  category?: CourseCategory;
  tags: string[];
  image?: string;
  notifyFollowers?: boolean;
}

// Subscription types
export interface SubscriptionPlan {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  tier: SubscriptionTier;
  price: number;
  currency: string;
  billingCycle: string;
  features: string[];
  limitations?: string[];
  isPopular?: boolean;
}

export interface CreateSubscriptionRequest {
  tier: SubscriptionTier;
  billingCycle: string;
  paymentMethodId?: string;
}

// Notification types
export interface NotificationWithStatus extends Notification {
  userNotification?: UserNotification;
}

export interface CreateNotificationRequest {
  title: string;
  titleEn?: string;
  message: string;
  messageEn?: string;
  type: NotificationType;
  priority?: string;
  category?: string;
  actionUrl?: string;
  imageUrl?: string;
  data?: any;
  scheduledAt?: Date;
  expiresAt?: Date;
  userIds?: string[]; // If specified, send to specific users
  roles?: UserRole[]; // If specified, send to users with these roles
  subscriptionTiers?: SubscriptionTier[]; // If specified, send to users with these tiers
}

// Analytics types
export interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalCourses: number;
  totalTests: number;
  totalLiveSessions: number;
  subscriptionDistribution: Record<SubscriptionTier, number>;
  userGrowth: Array<{ date: string; count: number }>;
  courseCompletions: Array<{ courseId: string; title: string; completions: number }>;
  testScores: Array<{ testId: string; title: string; averageScore: number }>;
  revenueData: Array<{ date: string; amount: number }>;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  search?: string;
  level?: string;
  category?: string;
  tier?: string;
  status?: string;
  type?: string;
  role?: string;
}

// File upload types
export interface FileUploadResponse {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}

// Error types
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}
