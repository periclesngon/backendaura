const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestAdmin() {
  try {
    console.log('🔧 Creating test admin user for content upload testing...');
    
    // Check if test admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'test-admin@aura.ca' }
    });
    
    if (existingAdmin) {
      console.log('✅ Test admin already exists, updating password...');
      
      // Update password to known value
      const hashedPassword = await bcrypt.hash('test123', 8); // Admin salt rounds

      await prisma.user.update({
        where: { email: 'test-admin@aura.ca' },
        data: { passwordHash: hashedPassword }
      });
      
      console.log('✅ Test admin password updated!');
      console.log('📧 Email: test-admin@aura.ca');
      console.log('🔑 Password: test123');
      
    } else {
      console.log('🆕 Creating new test admin...');
      
      // Create new test admin
      const hashedPassword = await bcrypt.hash('test123', 8); // Admin salt rounds

      const testAdmin = await prisma.user.create({
        data: {
          email: 'test-admin@aura.ca',
          passwordHash: hashedPassword,
          firstName: 'Test',
          lastName: 'Admin',
          role: 'ADMIN',
          status: 'ACTIVE',
          subscriptionTier: 'PRO'
        }
      });
      
      console.log('✅ Test admin created successfully!');
      console.log('📧 Email: test-admin@aura.ca');
      console.log('🔑 Password: test123');
      console.log('👤 User ID:', testAdmin.id);
    }
    
    // Update manager passwords
    console.log('\n🔍 Updating manager passwords...');

    // Update Senior Manager password
    const seniorManager = await prisma.user.findUnique({
      where: { email: 'periclesngon01@gmail.com' }
    });

    if (seniorManager) {
      console.log('📧 Senior Manager found: periclesngon01@gmail.com');
      console.log('🔑 Updating Senior Manager password to: pepe01');

      const hashedPassword = await bcrypt.hash('pepe01', 8); // Manager salt rounds
      await prisma.user.update({
        where: { email: 'periclesngon01@gmail.com' },
        data: { passwordHash: hashedPassword }
      });

      console.log('✅ Senior Manager password updated!');
    }

    // Update Junior Manager password
    const juniorManager = await prisma.user.findUnique({
      where: { email: 'stacyjordan@gmail.com' }
    });

    if (juniorManager) {
      console.log('📧 Junior Manager found: stacyjordan@gmail.com');
      console.log('🔑 Updating Junior Manager password to: pepe01');

      const hashedPassword = await bcrypt.hash('pepe01', 8); // Manager salt rounds
      await prisma.user.update({
        where: { email: 'stacyjordan@gmail.com' },
        data: { passwordHash: hashedPassword }
      });

      console.log('✅ Junior Manager password updated!');
    }

    // Update Student password
    const student = await prisma.user.findUnique({
      where: { email: 'timaclaude@gmail.com' }
    });

    if (student) {
      console.log('📧 Student found: timaclaude@gmail.com');
      console.log('🔑 Updating Student password to: password123');

      const hashedPassword = await bcrypt.hash('password123', 10); // Student salt rounds
      await prisma.user.update({
        where: { email: 'timaclaude@gmail.com' },
        data: { passwordHash: hashedPassword }
      });

      console.log('✅ Student password updated!');
    }
    
  } catch (error) {
    console.error('❌ Error creating test admin:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestAdmin();
