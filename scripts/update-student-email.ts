import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateStudentEmail() {
  try {
    const oldEmail = 'ngon.pericles@ictuniversty.edu.cm';
    const newEmail = 'ngon.pericles@ictuniversity.edu.cm';

    // Find the user by old email
    const user = await prisma.user.findUnique({
      where: { email: oldEmail.toLowerCase() }
    });

    if (!user) {
      console.log('❌ User not found with email:', oldEmail);
      return;
    }

    console.log('✅ Found user:', {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      currentEmail: user.email,
      role: user.role,
      subscriptionTier: user.subscriptionTier
    });

    // Check if new email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() }
    });

    if (existingUser && existingUser.id !== user.id) {
      console.log('❌ Email already exists for another user:', newEmail);
      return;
    }

    // Update the email
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail.toLowerCase()
      }
    });

    console.log('✅ Email updated successfully!');
    console.log('Old email:', oldEmail);
    console.log('New email:', updatedUser.email);
    console.log('User ID:', updatedUser.id);
    console.log('Name:', `${updatedUser.firstName} ${updatedUser.lastName}`);

  } catch (error: any) {
    console.error('❌ Error updating email:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateStudentEmail()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
