const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanCourses() {
  try {
    console.log('🧹 Cleaning courses database...');
    
    // Delete all courses and related data
    await prisma.courseLesson.deleteMany();
    console.log('✅ Deleted all course lessons');
    
    await prisma.courseEnrollment.deleteMany();
    console.log('✅ Deleted all course enrollments');
    
    await prisma.userProgress.deleteMany();
    console.log('✅ Deleted all user progress');
    
    await prisma.course.deleteMany();
    console.log('✅ Deleted all courses');
    
    console.log('🎉 Database cleaned successfully!');
    console.log('📊 Course count is now: 0');
    console.log('🚀 Ready to test the new course duplication fix!');
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanCourses();
