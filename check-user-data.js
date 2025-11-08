const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getUserInfo() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'timaclaude@gmail.com' },
      select: { id: true, subscriptionTier: true }
    });
    console.log('User info:', user);
    
    if (user) {
      const immigrationCount = await prisma.immigrationSimulation.count({
        where: { userId: user.id }
      });
      console.log('Immigration simulations count:', immigrationCount);
      
      const voiceCount = await prisma.voiceSimulation.count({
        where: { userId: user.id }
      });
      console.log('Voice simulations count:', voiceCount);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

getUserInfo();
