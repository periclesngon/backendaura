import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicateCourses() {
  try {
    console.log('🔍 Starting duplicate course cleanup...');

    // Get all courses with their lessons_data
    const allCourses = await prisma.course.findMany({
      include: {
        lessons_data: true,
      },
      orderBy: {
        createdAt: 'asc', // Keep oldest course
      },
    });

    console.log(`📊 Found ${allCourses.length} total courses`);

    // Group courses by normalized title
    const courseGroups = new Map<string, typeof allCourses>();
    
    for (const course of allCourses) {
      const normalizedTitle = course.title.trim().toLowerCase();
      
      if (!courseGroups.has(normalizedTitle)) {
        courseGroups.set(normalizedTitle, []);
      }
      courseGroups.get(normalizedTitle)!.push(course);
    }

    console.log(`📊 Found ${courseGroups.size} unique course titles`);

    let totalDeleted = 0;
    let totalUpdated = 0;

    // Process each group
    for (const [normalizedTitle, courseGroup] of courseGroups.entries()) {
      if (courseGroup.length <= 1) {
        continue; // No duplicates
      }

      console.log(`\n🔄 Processing "${courseGroup[0].title}" (${courseGroup.length} duplicates)`);

      // Find the primary course (one with most lessons, or oldest if equal)
      const primaryCourse = courseGroup.reduce((best, current) => {
        const bestLessons = best.lessons_data?.length || 0;
        const currentLessons = current.lessons_data?.length || 0;
        
        if (currentLessons > bestLessons) return current;
        if (currentLessons === bestLessons && current.createdAt < best.createdAt) return current;
        return best;
      });

      // Aggregate all levels and subscriptions
      const allLevelsSet = new Set<string>();
      const allSubscriptionsSet = new Set<string>();

      courseGroup.forEach(c => {
        // Check if course has availableLevels array (new system)
        if ((c as any).availableLevels && Array.isArray((c as any).availableLevels) && (c as any).availableLevels.length > 0) {
          (c as any).availableLevels.forEach((level: string) => allLevelsSet.add(level));
        } else {
          // Old system: use single level field
          allLevelsSet.add(c.level);
        }

        // Check if course has availableSubscriptions array (new system)
        if ((c as any).availableSubscriptions && Array.isArray((c as any).availableSubscriptions) && (c as any).availableSubscriptions.length > 0) {
          (c as any).availableSubscriptions.forEach((tier: string) => allSubscriptionsSet.add(tier));
        } else {
          // Old system: use single requiredTier field
          allSubscriptionsSet.add(c.requiredTier);
        }
      });

      const aggregatedLevels = Array.from(allLevelsSet);
      const aggregatedSubscriptions = Array.from(allSubscriptionsSet);

      console.log(`  ✅ Primary course: ${primaryCourse.id} (${primaryCourse.lessons_data.length} lessons)`);
      console.log(`  📋 Aggregated levels: ${aggregatedLevels.join(', ')}`);
      console.log(`  💳 Aggregated subscriptions: ${aggregatedSubscriptions.join(', ')}`);

      // Update primary course with aggregated data
      await prisma.course.update({
        where: { id: primaryCourse.id },
        data: {
          availableLevels: aggregatedLevels as any,
          availableSubscriptions: aggregatedSubscriptions as any,
          level: aggregatedLevels[0] as any,
          requiredTier: aggregatedSubscriptions[0] as any,
        } as any,
      });

      totalUpdated++;

      // Delete all other duplicate courses
      const duplicatesToDelete = courseGroup.filter(c => c.id !== primaryCourse.id);
      
      for (const duplicate of duplicatesToDelete) {
        console.log(`  🗑️  Deleting duplicate: ${duplicate.id} (${duplicate.level} / ${duplicate.requiredTier})`);
        
        // Delete course (lessons_data will be cascade deleted)
        await prisma.course.delete({
          where: { id: duplicate.id },
        });
        
        totalDeleted++;
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   - Updated: ${totalUpdated} primary courses`);
    console.log(`   - Deleted: ${totalDeleted} duplicate courses`);
    console.log(`   - Remaining: ${allCourses.length - totalDeleted} courses`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupDuplicateCourses()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

