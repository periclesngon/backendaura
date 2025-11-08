/**
 * Seed Test Data Script
 * Creates test courses, users, and other data for comprehensive testing
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

async function seedTestData() {
  console.log('🌱 Starting test data seeding...');

  try {
    // Create test admin user
    console.log('👑 Creating admin user...');
    const adminPasswordHash = await hashPassword('AdminTest123!');
    
    const admin = await prisma.user.upsert({
      where: { email: 'admin@tcftef.com' },
      update: {},
      create: {
        email: 'admin@tcftef.com',
        passwordHash: adminPasswordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        status: 'ACTIVE',
        subscriptionTier: 'PREMIUM',
        country: 'France'
      }
    });
    console.log(`✅ Admin user created: ${admin.email}`);

    // Create test senior manager
    console.log('👥 Creating senior manager...');
    const seniorManagerPasswordHash = await hashPassword('SeniorManager123!');
    
    const seniorManager = await prisma.user.upsert({
      where: { email: 'senior.manager@tcftef.com' },
      update: {},
      create: {
        email: 'senior.manager@tcftef.com',
        passwordHash: seniorManagerPasswordHash,
        firstName: 'Senior',
        lastName: 'Manager',
        role: 'SENIOR_MANAGER',
        status: 'ACTIVE',
        subscriptionTier: 'PREMIUM',
        country: 'France'
      }
    });
    console.log(`✅ Senior manager created: ${seniorManager.email}`);

    // Create test junior manager
    console.log('📚 Creating junior manager...');
    const juniorManagerPasswordHash = await hashPassword('JuniorManager123!');
    
    const juniorManager = await prisma.user.upsert({
      where: { email: 'junior.manager@tcftef.com' },
      update: {},
      create: {
        email: 'junior.manager@tcftef.com',
        passwordHash: juniorManagerPasswordHash,
        firstName: 'Junior',
        lastName: 'Manager',
        role: 'JUNIOR_MANAGER',
        status: 'ACTIVE',
        subscriptionTier: 'ESSENTIAL',
        country: 'France'
      }
    });
    console.log(`✅ Junior manager created: ${juniorManager.email}`);

    // Create test courses
    console.log('📖 Creating test courses...');
    
    const courses = [
      {
        title: 'TCF Preparation Course - Beginner',
        description: 'Complete preparation course for TCF (Test de Connaissance du Français) for beginners',
        level: 'BEGINNER',
        price: 99.99,
        thumbnail: 'https://example.com/tcf-beginner.jpg',
        category: 'TCF_PREPARATION',
        duration: 40,
        language: 'French',
        createdById: seniorManager.id
      },
      {
        title: 'TEF Preparation Course - Intermediate',
        description: 'Comprehensive TEF (Test d\'Évaluation de Français) preparation for intermediate learners',
        level: 'INTERMEDIATE',
        price: 149.99,
        thumbnail: 'https://example.com/tef-intermediate.jpg',
        category: 'TEF_PREPARATION',
        duration: 60,
        language: 'French',
        createdById: seniorManager.id
      },
      {
        title: 'French Grammar Mastery',
        description: 'Master French grammar with comprehensive exercises and explanations',
        level: 'INTERMEDIATE',
        price: 79.99,
        thumbnail: 'https://example.com/grammar-mastery.jpg',
        category: 'GRAMMAR',
        duration: 30,
        language: 'French',
        createdById: juniorManager.id
      },
      {
        title: 'French Conversation Practice',
        description: 'Improve your French speaking skills with interactive conversation practice',
        level: 'ADVANCED',
        price: 199.99,
        thumbnail: 'https://example.com/conversation-practice.jpg',
        category: 'CONVERSATION',
        duration: 50,
        language: 'French',
        createdById: seniorManager.id
      },
      {
        title: 'French Pronunciation Workshop',
        description: 'Perfect your French pronunciation with expert guidance and practice',
        level: 'BEGINNER',
        price: 59.99,
        thumbnail: 'https://example.com/pronunciation.jpg',
        category: 'PRONUNCIATION',
        duration: 20,
        language: 'French',
        createdById: juniorManager.id
      }
    ];

    for (const courseData of courses) {
      // Check if course already exists
      const existingCourse = await prisma.course.findFirst({
        where: { title: courseData.title }
      });

      let course;
      if (existingCourse) {
        course = existingCourse;
        console.log(`⚠️  Course already exists: ${course.title}`);
      } else {
        course = await prisma.course.create({
          data: courseData
        });
        console.log(`✅ Course created: ${course.title}`);
      }

      // Add some lessons to each course
      const lessons = [
        {
          title: `${courseData.title} - Lesson 1`,
          description: 'Introduction and basic concepts',
          content: JSON.stringify({
            type: 'VIDEO',
            videoUrl: 'https://example.com/lesson1.mp4',
            exercises: ['Exercise 1', 'Exercise 2']
          }),
          duration: 15,
          order: 1,
          courseId: course.id,
          videoUrl: 'https://example.com/lesson1.mp4'
        },
        {
          title: `${courseData.title} - Lesson 2`,
          description: 'Practice exercises and examples',
          content: JSON.stringify({
            type: 'EXERCISE',
            exercises: ['Exercise 1', 'Exercise 2', 'Exercise 3']
          }),
          duration: 20,
          order: 2,
          courseId: course.id
        },
        {
          title: `${courseData.title} - Quiz`,
          description: 'Test your knowledge',
          content: JSON.stringify({
            type: 'QUIZ',
            questions: ['Question 1', 'Question 2', 'Question 3']
          }),
          duration: 10,
          order: 3,
          courseId: course.id
        }
      ];

      for (const lessonData of lessons) {
        // Check if lesson already exists
        const existingLesson = await prisma.lesson.findFirst({
          where: {
            courseId: course.id,
            order: lessonData.order
          }
        });

        if (!existingLesson) {
          await prisma.lesson.create({
            data: lessonData
          });
        }
      }
    }

    // Create some test students
    console.log('🎓 Creating test students...');
    const students = [
      {
        email: 'student1@tcftef.com',
        firstName: 'Marie',
        lastName: 'Dubois',
        country: 'Canada'
      },
      {
        email: 'student2@tcftef.com',
        firstName: 'Jean',
        lastName: 'Martin',
        country: 'Belgium'
      }
    ];

    const studentPasswordHash = await hashPassword('Student123!');
    
    for (const studentData of students) {
      const student = await prisma.user.upsert({
        where: { email: studentData.email },
        update: {},
        create: {
          ...studentData,
          passwordHash: studentPasswordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          subscriptionTier: 'FREE'
        }
      });
      console.log(`✅ Student created: ${student.email}`);
    }

    // Create some test live sessions
    console.log('📹 Creating test live sessions...');
    const liveSessions = [
      {
        title: 'French Conversation Practice Session',
        description: 'Interactive conversation practice with native speakers',
        instructor: `${seniorManager.firstName} ${seniorManager.lastName}`,
        date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        duration: 60,
        maxParticipants: 20,
        level: 'INTERMEDIATE',
        category: 'CONVERSATION',
        tags: ['Conversation', 'Pronunciation'],
        createdById: seniorManager.id
      },
      {
        title: 'TCF Exam Preparation Workshop',
        description: 'Intensive workshop for TCF exam preparation',
        instructor: `${juniorManager.firstName} ${juniorManager.lastName}`,
        date: new Date(Date.now() + 48 * 60 * 60 * 1000), // Day after tomorrow
        duration: 90,
        maxParticipants: 15,
        level: 'ADVANCED',
        category: 'TCF_PREPARATION',
        tags: ['TCF', 'Exam Strategy'],
        createdById: juniorManager.id
      }
    ];

    for (const sessionData of liveSessions) {
      // Check if session already exists
      const existingSession = await prisma.liveSession.findFirst({
        where: { title: sessionData.title }
      });

      let session;
      if (existingSession) {
        session = existingSession;
        console.log(`⚠️  Live session already exists: ${session.title}`);
      } else {
        session = await prisma.liveSession.create({
          data: sessionData
        });
        console.log(`✅ Live session created: ${session.title}`);
      }
    }

    console.log('🎉 Test data seeding completed successfully!');
    console.log('\n📋 Test Accounts Created:');
    console.log('👑 Admin: admin@tcftef.com / AdminTest123!');
    console.log('👥 Senior Manager: senior.manager@tcftef.com / SeniorManager123!');
    console.log('📚 Junior Manager: junior.manager@tcftef.com / JuniorManager123!');
    console.log('🎓 Student 1: student1@tcftef.com / Student123!');
    console.log('🎓 Student 2: student2@tcftef.com / Student123!');
    console.log('\n📖 Test Courses: 5 courses with lessons created');
    console.log('📹 Test Live Sessions: 2 upcoming sessions created');

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedTestData().catch(console.error);
}

module.exports = { seedTestData };
