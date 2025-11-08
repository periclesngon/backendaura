const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdminUsers() {
  try {
    console.log('🔍 Checking admin users in database...');
    
    const adminUsers = await prisma.user.findMany({
      where: {
        role: 'ADMIN'
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true
      }
    });
    
    console.log('👥 Admin users found:', adminUsers.length);
    adminUsers.forEach(user => {
      console.log(`📧 ${user.email} - ${user.firstName} ${user.lastName} (Status: ${user.status})`);
    });

    // Also check all users to see what we have
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true
      },
      take: 10
    });

    console.log('\n👥 All users (first 10):');
    allUsers.forEach(user => {
      console.log(`📧 ${user.email} - ${user.firstName} ${user.lastName} (${user.role}) (Status: ${user.status})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminUsers();
