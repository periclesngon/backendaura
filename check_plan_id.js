// Quick script to check plan structure
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPlans() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      select: {
        id: true,
        name: true,
        tier: true,
        maxSimulations: true
      }
    });
    console.log('Plans in database:');
    console.log(JSON.stringify(plans, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkPlans();
