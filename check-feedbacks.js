const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFeedbacks() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'timaclaude@gmail.com' }
    });

    if (user) {
      console.log('User ID: ' + user.id);

      const feedbacks = await prisma.aIFeedback.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5
      });

      console.log('Feedbacks count: ' + feedbacks.length);
      feedbacks.forEach(f => {
        console.log('ID: ' + f.id);
        console.log('Confidence: ' + Math.round(f.aiConfidence * 100) + '%');
        console.log('Status: ' + f.status);
        console.log('Submittable: ' + (f.aiConfidence >= 0.9 && f.status === 'PENDING_HUMAN'));
        console.log('---');
      });
    } else {
      console.log('User not found');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkFeedbacks();
