import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  // Create Admin User
  const adminPassword = await bcrypt.hash('password01', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'mfondomerlin@gmail.com' },
    update: {},
    create: {
      email: 'mfondomerlin@gmail.com',
      passwordHash: adminPassword,
      firstName: 'Mfondo',
      lastName: 'Merlin',
      role: 'ADMIN',
      status: 'ACTIVE',
      subscriptionTier: 'PREMIUM',
      emailVerifiedAt: new Date(),
    },
  })

  // Create Senior Manager
  const seniorManagerPassword = await bcrypt.hash('pepe01', 12)
  const seniorManager = await prisma.user.upsert({
    where: { email: 'periclesngon01@gmail.com' },
    update: {},
    create: {
      email: 'periclesngon01@gmail.com',
      passwordHash: seniorManagerPassword,
      firstName: 'Pericles',
      lastName: 'Ngon',
      role: 'SENIOR_MANAGER',
      status: 'ACTIVE',
      subscriptionTier: 'PREMIUM',
      emailVerifiedAt: new Date(),
    },
  })

  // Create Junior Manager
  const juniorManagerPassword = await bcrypt.hash('pepe01', 12)
  const juniorManager = await prisma.user.upsert({
    where: { email: 'stacyjordan@gmail.com' },
    update: {},
    create: {
      email: 'stacyjordan@gmail.com',
      passwordHash: juniorManagerPassword,
      firstName: 'Stacy',
      lastName: 'Jordan',
      role: 'JUNIOR_MANAGER',
      status: 'ACTIVE',
      subscriptionTier: 'ESSENTIAL',
      emailVerifiedAt: new Date(),
    },
  })

  // Create Test Student
  const studentPassword = await bcrypt.hash('Lowersixthss1@', 12)
  const student = await prisma.user.upsert({
    where: { email: 'jeannotpericles@gmail.com' },
    update: {},
    create: {
      email: 'jeannotpericles@gmail.com',
      passwordHash: studentPassword,
      firstName: 'Jeannot',
      lastName: 'Pericles',
      role: 'STUDENT',
      status: 'ACTIVE',
      subscriptionTier: 'PRO',
      emailVerifiedAt: new Date(),
    },
  })

  // Create Tima Claude Student
  const timaPassword = await bcrypt.hash('password123', 12)
  const timaClaude = await prisma.user.upsert({
    where: { email: 'timaclaude@gmail.com' },
    update: {
      passwordHash: timaPassword,
      firstName: 'Tima',
      lastName: 'Claude',
      role: 'STUDENT',
      status: 'ACTIVE',
      subscriptionTier: 'PRO',
      emailVerifiedAt: new Date(),
    },
    create: {
      email: 'timaclaude@gmail.com',
      passwordHash: timaPassword,
      firstName: 'Tima',
      lastName: 'Claude',
      role: 'STUDENT',
      status: 'ACTIVE',
      subscriptionTier: 'PRO',
      emailVerifiedAt: new Date(),
    },
  })



  // Create sample analytics events for recent activities
  const analyticsEvents = [
    {
      eventType: 'USER_LOGIN',
      userId: admin.id,
      eventData: { userAgent: 'Mozilla/5.0', ip: '192.168.1.1' },
      createdAt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    },
    {
      eventType: 'COURSE_COMPLETED',
      userId: student.id,
      eventData: { courseId: 'course-123', score: 85 },
      createdAt: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
    },
    {
      eventType: 'SUBSCRIPTION_CREATED',
      userId: seniorManager.id,
      eventData: { tier: 'PREMIUM', amount: 9500 },
      createdAt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
    },
    {
      eventType: 'USER_REGISTRATION',
      userId: juniorManager.id,
      eventData: { source: 'organic', referrer: 'google.com' },
      createdAt: new Date(Date.now() - 45 * 60 * 1000) // 45 minutes ago
    }
  ]

  for (const event of analyticsEvents) {
    await prisma.analyticsEvent.create({
      data: event
    })
  }

  // Create sample courses
  const courses = await Promise.all([
    prisma.course.create({
      data: {
        title: 'Grammaire Française Niveau B1',
        titleEn: 'French Grammar Level B1',
        description: 'Maîtrisez les règles grammaticales essentielles du niveau B1',
        descriptionEn: 'Master essential grammar rules for B1 level',
        level: 'B1',
        category: 'GRAMMAR',
        requiredTier: 'FREE',
        duration: 45,
        tags: ['grammar', 'b1', 'fundamentals'],
        isPublished: true,
        createdById: admin.id
      }
    }),
    prisma.course.create({
      data: {
        title: 'Compréhension Orale Avancée',
        titleEn: 'Advanced Listening Comprehension',
        description: 'Développez vos compétences d\'écoute avec des documents authentiques',
        descriptionEn: 'Develop your listening skills with authentic documents',
        level: 'C1',
        category: 'LISTENING',
        requiredTier: 'PREMIUM',
        duration: 60,
        tags: ['listening', 'c1', 'advanced'],
        isPublished: true,
        createdById: seniorManager.id
      }
    }),
    prisma.course.create({
      data: {
        title: 'Expression Écrite B2',
        titleEn: 'Written Expression B2',
        description: 'Perfectionnez votre expression écrite pour le niveau B2',
        descriptionEn: 'Perfect your written expression for B2 level',
        level: 'B2',
        category: 'WRITING',
        requiredTier: 'ESSENTIAL',
        duration: 50,
        tags: ['writing', 'b2', 'expression'],
        isPublished: true,
        createdById: juniorManager.id
      }
    })
  ])

  // Create sample tests
  const tests = await Promise.all([
    prisma.test.create({
      data: {
        title: 'Test de Compréhension Orale TCF',
        titleEn: 'TCF Listening Comprehension Test',
        description: 'Évaluez votre compréhension orale avec ce test officiel TCF',
        descriptionEn: 'Evaluate your listening comprehension with this official TCF test',
        level: 'B1',
        category: 'LISTENING',
        requiredTier: 'FREE',
        type: 'OFFICIAL',
        duration: 30,
        questionCount: 25,
        tags: ['tcf', 'listening', 'official'],
        isPublished: true,
        isOfficial: true,
        createdById: admin.id
      }
    }),
    prisma.test.create({
      data: {
        title: 'Simulation TEF Expression Écrite',
        titleEn: 'TEF Written Expression Simulation',
        description: 'Préparez-vous à l\'épreuve d\'expression écrite du TEF',
        descriptionEn: 'Prepare for the TEF written expression test',
        level: 'B2',
        category: 'WRITING',
        requiredTier: 'PREMIUM',
        type: 'SIMULATION',
        duration: 60,
        questionCount: 3,
        tags: ['tef', 'writing', 'simulation'],
        isPublished: true,
        isOfficial: false,
        createdById: seniorManager.id
      }
    }),
    prisma.test.create({
      data: {
        title: 'Test Grammaire A2',
        titleEn: 'A2 Grammar Test',
        description: 'Testez vos connaissances grammaticales de niveau A2',
        descriptionEn: 'Test your A2 level grammar knowledge',
        level: 'A2',
        category: 'GRAMMAR',
        requiredTier: 'FREE',
        type: 'PRACTICE',
        duration: 20,
        questionCount: 15,
        tags: ['grammar', 'a2', 'practice'],
        isPublished: true,
        isOfficial: false,
        createdById: juniorManager.id
      }
    })
  ])

  console.log('✅ Database seeding completed!')
  console.log('👤 Created users:')
  console.log('   - Admin: mfondomerlin@gmail.com / password01')
  console.log('   - Senior Manager: periclesngon01@gmail.com / pepe01')
  console.log('   - Junior Manager: stacyjordan@gmail.com / pepe01')
  console.log('   - Student: jeannotpericles@gmail.com / Lowersixthss1@')
  console.log('   - Student: timaclaude@gmail.com / password123')
  console.log('📊 Created sample analytics events for recent activities')
  console.log(`📚 Created ${courses.length} courses`)
  console.log(`📝 Created ${tests.length} tests`)
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
