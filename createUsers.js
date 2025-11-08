const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'mfondomerlin@gmail.com' },
    update: {
      passwordHash: '$2b$10$OSI4uAmmgyC08nIYSdqOsujfvhzJcGGcK6S2peCP77NCyo/Dy2oe6'
    },
    create: {
      email: 'mfondomerlin@gmail.com',
      passwordHash: '$2b$10$OSI4uAmmgyC08nIYSdqOsujfvhzJcGGcK6S2peCP77NCyo/Dy2oe6',
      firstName: 'merlin',
      lastName: 'mfondo',
      role: 'ADMIN',
      phone: '696666488',
      status: 'ACTIVE',
    }
  });

  await prisma.user.upsert({
    where: { email: 'timaclaude@gmail.com' },
    update: {
      passwordHash: '$2b$10$Exgr1q.GoG4dbt8ri2lDgek8Q1pWuanV..VcBpWeeWNmN.xJoZPA.'
    },
    create: {
      email: 'timaclaude@gmail.com',
      passwordHash: '$2b$10$Exgr1q.GoG4dbt8ri2lDgek8Q1pWuanV..VcBpWeeWNmN.xJoZPA.',
      firstName: 'tima',
      lastName: 'claude',
      role: 'STUDENT',
      phone: '682659802',
      subscriptionTier: 'PRO',
      status: 'ACTIVE',
    }
  });

  await prisma.$disconnect();
  console.log('Users created/updated successfully');
}

main();
