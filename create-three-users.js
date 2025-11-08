const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function createThreeUsers() {
  try {
    console.log('🚀 Creating 3 new users (Student, Manager, Admin)...\n');

    const users = [];

    // 1. Create Student User
    const studentPassword = 'Student@123';
    const studentHashedPassword = await bcrypt.hash(studentPassword, 10);
    const student = await prisma.user.upsert({
      where: { email: 'student@aura.ca' },
      update: {},
      create: {
        email: 'student@aura.ca',
        passwordHash: studentHashedPassword,
        firstName: 'John',
        lastName: 'Student',
        role: 'STUDENT',
        status: 'ACTIVE',
        subscriptionTier: 'FREE',
        emailVerifiedAt: new Date()
      }
    });
    console.log('✅ Student created:', student.email);
    users.push({
      role: 'STUDENT',
      email: student.email,
      password: studentPassword,
      firstName: student.firstName,
      lastName: student.lastName,
      userId: student.id
    });

    // 2. Create Manager User (JUNIOR_MANAGER)
    const managerPassword = 'Manager@123';
    const managerHashedPassword = await bcrypt.hash(managerPassword, 8);
    const manager = await prisma.user.upsert({
      where: { email: 'manager@aura.ca' },
      update: {},
      create: {
        email: 'manager@aura.ca',
        passwordHash: managerHashedPassword,
        firstName: 'Jane',
        lastName: 'Manager',
        role: 'JUNIOR_MANAGER',
        status: 'ACTIVE',
        subscriptionTier: 'PREMIUM',
        emailVerifiedAt: new Date()
      }
    });
    console.log('✅ Manager created:', manager.email);
    users.push({
      role: 'JUNIOR_MANAGER',
      email: manager.email,
      password: managerPassword,
      firstName: manager.firstName,
      lastName: manager.lastName,
      userId: manager.id
    });

    // 3. Create Admin User
    const adminPassword = 'Admin@123';
    const adminHashedPassword = await bcrypt.hash(adminPassword, 8);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@aura.ca' },
      update: {},
      create: {
        email: 'admin@aura.ca',
        passwordHash: adminHashedPassword,
        firstName: 'Alice',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        subscriptionTier: 'PREMIUM',
        emailVerifiedAt: new Date()
      }
    });
    console.log('✅ Admin created:', admin.email);
    users.push({
      role: 'ADMIN',
      email: admin.email,
      password: adminPassword,
      firstName: admin.firstName,
      lastName: admin.lastName,
      userId: admin.id
    });

    // Save credentials to file
    const credentialsPath = path.join(__dirname, 'USER_CREDENTIALS.json');
    const credentialsContent = {
      createdAt: new Date().toISOString(),
      platform: 'AURA Learning Platform',
      users: users
    };

    fs.writeFileSync(credentialsPath, JSON.stringify(credentialsContent, null, 2));
    console.log('\n📄 Credentials saved to:', credentialsPath);

    // Also create a readable text file
    const textPath = path.join(__dirname, 'USER_CREDENTIALS.txt');
    let textContent = `AURA Learning Platform - User Credentials\n`;
    textContent += `Created: ${new Date().toISOString()}\n`;
    textContent += `${'='.repeat(60)}\n\n`;

    users.forEach((user, index) => {
      textContent += `User ${index + 1}: ${user.role}\n`;
      textContent += `${'─'.repeat(40)}\n`;
      textContent += `Email:     ${user.email}\n`;
      textContent += `Password:  ${user.password}\n`;
      textContent += `Name:      ${user.firstName} ${user.lastName}\n`;
      textContent += `User ID:   ${user.userId}\n`;
      textContent += `\n`;
    });

    fs.writeFileSync(textPath, textContent);
    console.log('📄 Readable credentials saved to:', textPath);

    console.log('\n🎉 All 3 users created successfully!');
    console.log('\n📋 Summary:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.role}: ${user.email} / ${user.password}`);
    });

  } catch (error) {
    console.error('❌ Error creating users:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createThreeUsers();

