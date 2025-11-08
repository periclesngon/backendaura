const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createMinimalTestData() {
  try {
    console.log('🧪 Creating minimal test data for comprehensive testing...');

    // Get existing users
    const admin = await prisma.user.findUnique({
      where: { email: 'mfondomerlin@gmail.com' }
    });

    const seniorManager = await prisma.user.findUnique({
      where: { email: 'periclesngon01@gmail.com' }
    });

    const juniorManager = await prisma.user.findUnique({
      where: { email: 'stacyndoukeu@gmail.com' }
    });

    if (!admin || !seniorManager || !juniorManager) {
      throw new Error('Required users not found. Run create-required-users.js first.');
    }

    // Create 2 test courses (one by each manager)
    console.log('📚 Creating test courses...');
    
    // Check if course already exists
    let course1 = await prisma.course.findFirst({
      where: { title: 'TCF Preparation - Grammar Basics' }
    });

    if (!course1) {
      course1 = await prisma.course.create({
        data: {
          title: 'TCF Preparation - Grammar Basics',
          description: 'Essential French grammar for TCF exam preparation',
          level: 'A1',
          category: 'GRAMMAR',
          duration: 30,
          isPublished: true,
          createdById: seniorManager.id
        }
      });
    }
    console.log('✅ Course 1 created:', course1.title);

    let course2 = await prisma.course.findFirst({
      where: { title: 'French Listening Comprehension' }
    });

    if (!course2) {
      course2 = await prisma.course.create({
        data: {
          title: 'French Listening Comprehension',
          description: 'Improve your French listening skills for TEF/TCF',
          level: 'B1',
          category: 'LISTENING',
          duration: 45,
          isPublished: true,
          createdById: juniorManager.id
        }
      });
    }
    console.log('✅ Course 2 created:', course2.title);

    // Create multiple test live sessions with different tier requirements
    console.log('📹 Creating test live sessions...');

    // 1. FREE tier session (A1-A2 level)
    let freeSession = await prisma.liveSession.findFirst({
      where: { title: 'Free French Basics Session' }
    });

    if (!freeSession) {
      freeSession = await prisma.liveSession.create({
        data: {
          title: 'Free French Basics Session',
          description: 'Basic French practice for beginners (A1-A2)',
          instructor: 'ndoukeu stacy',
          date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // In 2 days
          duration: 45,
          maxParticipants: 30,
          requiredTier: 'FREE',
          level: 'A1',
          category: 'ORAL',
          tags: ['free', 'basics', 'A1'],
          status: 'SCHEDULED',
          createdById: juniorManager.id
        }
      });
    }
    console.log('✅ Free session created:', freeSession.title);

    // 2. ESSENTIAL tier session (B1 level) - Junior Manager limit
    let essentialSession = await prisma.liveSession.findFirst({
      where: { title: 'B1 Intermediate Practice' }
    });

    if (!essentialSession) {
      essentialSession = await prisma.liveSession.create({
        data: {
          title: 'B1 Intermediate Practice',
          description: 'Intermediate French practice for B1 level students',
          instructor: 'ndoukeu stacy',
          date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // In 3 days
          duration: 60,
          maxParticipants: 20,
          requiredTier: 'ESSENTIAL',
          level: 'B1',
          category: 'ORAL',
          tags: ['essential', 'B1', 'intermediate'],
          status: 'SCHEDULED',
          createdById: juniorManager.id
        }
      });
    }
    console.log('✅ Essential session created:', essentialSession.title);

    // 3. PREMIUM tier session (B2-C2 level) - Senior Manager only
    let premiumSession = await prisma.liveSession.findFirst({
      where: { title: 'Advanced French Mastery' }
    });

    if (!premiumSession) {
      premiumSession = await prisma.liveSession.create({
        data: {
          title: 'Advanced French Mastery',
          description: 'Advanced French practice for B2-C2 level students',
          instructor: 'pericles ngon',
          date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // In 4 days
          duration: 90,
          maxParticipants: 15,
          requiredTier: 'PREMIUM',
          level: 'B2',
          category: 'ORAL',
          tags: ['premium', 'advanced', 'B2', 'C1'],
          status: 'SCHEDULED',
          createdById: seniorManager.id
        }
      });
    }
    console.log('✅ Premium session created:', premiumSession.title);

    // 4. PRO tier 1-on-1 session - Senior Manager/Admin only
    let proSession = await prisma.liveSession.findFirst({
      where: { title: '1-on-1 Personalized Coaching' }
    });

    if (!proSession) {
      proSession = await prisma.liveSession.create({
        data: {
          title: '1-on-1 Personalized Coaching',
          description: 'Individual coaching session with senior manager',
          instructor: 'pericles ngon',
          date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // In 5 days
          duration: 60,
          maxParticipants: 1, // 1-on-1 session
          requiredTier: 'PRO',
          level: 'C1',
          category: 'ORAL',
          tags: ['pro', '1-on-1', 'coaching', 'personalized'],
          status: 'SCHEDULED',
          createdById: seniorManager.id
        }
      });
    }
    console.log('✅ Pro 1-on-1 session created:', proSession.title);

    // Create 1 basic test
    console.log('📝 Creating test assessment...');
    
    let test = await prisma.test.findFirst({
      where: { title: 'Basic French Grammar Test' }
    });

    if (!test) {
      test = await prisma.test.create({
        data: {
          title: 'Basic French Grammar Test',
          description: 'Test your basic French grammar knowledge',
          level: 'A1',
          category: 'GRAMMAR',
          type: 'PRACTICE',
          duration: 20,
          questionCount: 10,
          passingScore: 70,
          isPublished: true,
          createdById: seniorManager.id
        }
      });
    }
    console.log('✅ Test created:', test.title);

    console.log('\n🎉 Minimal test data created successfully!');
    console.log('📊 Summary:');
    console.log('   • 2 Courses created');
    console.log('   • 1 Live Session scheduled');
    console.log('   • 1 Test assessment created');
    console.log('   • All data linked to existing managers');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createMinimalTestData();
