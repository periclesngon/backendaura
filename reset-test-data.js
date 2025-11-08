const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetTestData() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'timaclaude@gmail.com' },
      select: { id: true }
    });
    
    if (!user) {
      console.log('Test user not found');
      return;
    }
    
    console.log('Resetting test data for user:', user.id);
    
    // Delete immigration simulations
    const deletedImmigration = await prisma.immigrationSimulation.deleteMany({
      where: { userId: user.id }
    });
    console.log('Deleted immigration simulations:', deletedImmigration.count);
    
    // Delete voice simulations
    const deletedVoice = await prisma.voiceSimulation.deleteMany({
      where: { userId: user.id }
    });
    console.log('Deleted voice simulations:', deletedVoice.count);
    
    // Delete simulation bookings
    const deletedBookings = await prisma.simulationBooking.deleteMany({
      where: { userId: user.id }
    });
    console.log('Deleted simulation bookings:', deletedBookings.count);
    
    console.log('Test data reset complete!');
    
  } catch (error) {
    console.error('Error resetting test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetTestData();
