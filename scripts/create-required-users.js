const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createRequiredUsers() {
  try {
    console.log('🧹 Creating required users only...');

    // Admin User
    const adminPassword = await bcrypt.hash('Password01', 12);
    const admin = await prisma.user.upsert({
      where: { email: 'mfondomerlin@gmail.com' },
      update: {},
      create: {
        email: 'mfondomerlin@gmail.com',
        passwordHash: adminPassword,
        firstName: 'mfondo',
        lastName: 'merlin',
        role: 'ADMIN',
        subscriptionTier: 'PRO',
        emailVerifiedAt: new Date()
      }
    });
    console.log('✅ Admin created:', admin.email);

    // Senior Manager
    const seniorPassword = await bcrypt.hash('pepe01', 12);
    const seniorManager = await prisma.user.upsert({
      where: { email: 'periclesngon01@gmail.com' },
      update: {},
      create: {
        email: 'periclesngon01@gmail.com',
        passwordHash: seniorPassword,
        firstName: 'pericles',
        lastName: 'ngon',
        role: 'SENIOR_MANAGER',
        subscriptionTier: 'PRO',
        emailVerifiedAt: new Date()
      }
    });
    console.log('✅ Senior Manager created:', seniorManager.email);

    // Junior Manager
    const juniorPassword = await bcrypt.hash('pepe01', 12);
    const juniorManager = await prisma.user.upsert({
      where: { email: 'stacyndoukeu@gmail.com' },
      update: {},
      create: {
        email: 'stacyndoukeu@gmail.com',
        passwordHash: juniorPassword,
        firstName: 'ndoukeu',
        lastName: 'stacy',
        role: 'JUNIOR_MANAGER',
        subscriptionTier: 'PREMIUM',
        emailVerifiedAt: new Date()
      }
    });
    console.log('✅ Junior Manager created:', juniorManager.email);

    console.log('\n🎉 All required users created successfully!');
    console.log('📊 Database now contains only the 3 required users');

  } catch (error) {
    console.error('❌ Error creating users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createRequiredUsers();
