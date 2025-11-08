import { PrismaClient, UserRole, UserStatus, SubscriptionTier } from '@prisma/client';
import { PasswordService } from '../src/utils/password';

const prisma = new PrismaClient();

async function createProStudent() {
  try {
    const email = 'ngon.pericles@ictuniversty.edu.cm';
    const password = 'password123';
    const firstName = 'NGON';
    const lastName = 'A NPEE';

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      console.log('❌ User already exists with email:', email);
      console.log('User ID:', existingUser.id);
      console.log('Current subscription:', existingUser.subscriptionTier);
      
      // Update existing user to PRO
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionTier: SubscriptionTier.PRO,
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE
        }
      });
      
      console.log('✅ Updated existing user to PRO subscription');
      console.log('User ID:', updatedUser.id);
      console.log('Email:', updatedUser.email);
      console.log('Subscription:', updatedUser.subscriptionTier);
      return;
    }

    // Hash password
    const passwordHash = await PasswordService.hashPassword(password, UserRole.STUDENT);

    // Create user with PRO subscription
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO // PRO subscription
      }
    });

    console.log('✅ PRO Student created successfully!');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Name:', `${user.firstName} ${user.lastName}`);
    console.log('Role:', user.role);
    console.log('Subscription:', user.subscriptionTier);
    console.log('Status:', user.status);

    // Create an active subscription record
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: SubscriptionTier.PRO,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        billingCycle: 'yearly',
        paymentMethod: 'admin_created'
      }
    });

    console.log('✅ PRO Subscription created');
    console.log('Subscription ID:', subscription.id);
    console.log('End Date:', subscription.endDate);

  } catch (error: any) {
    console.error('❌ Error creating PRO student:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createProStudent()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
