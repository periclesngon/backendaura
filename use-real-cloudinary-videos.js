const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Real Cloudinary videos from your account
const realCloudinaryVideos = [
  "https://res.cloudinary.com/ddhhzeewn/video/upload/v1756945736/samples/cld-sample-video.mp4",
  "https://res.cloudinary.com/ddhhzeewn/video/upload/v1756945735/samples/elephants.mp4", 
  "https://res.cloudinary.com/ddhhzeewn/video/upload/v1756945736/samples/dance-2.mp4",
  "https://res.cloudinary.com/ddhhzeewn/video/upload/v1756945734/samples/sea-turtle.mp4"
];

async function useRealCloudinaryVideos() {
  try {
    console.log('🎥 Using REAL Cloudinary videos from your account...\n');
    
    // Get all lessons with hardcoded sample video URLs
    const hardcodedLessons = await prisma.courseLesson.findMany({
      where: {
        OR: [
          { videoUrl: { contains: 'commondatastorage.googleapis.com' } },
          { videoUrl: { contains: 'sample-videos.com' } },
          { videoUrl: { contains: 'example.com' } }
        ]
      },
      include: {
        course: {
          select: {
            title: true,
            id: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    console.log(`📊 Found ${hardcodedLessons.length} lessons with hardcoded URLs\n`);
    
    if (hardcodedLessons.length === 0) {
      console.log('✅ No hardcoded URLs found');
      return;
    }
    
    const updatedLessons = [];
    let videoIndex = 0;
    
    // Process each lesson
    for (const lesson of hardcodedLessons) {
      try {
        console.log(`🎬 Processing: ${lesson.title}`);
        console.log(`   Course: ${lesson.course.title}`);
        console.log(`   Old URL: ${lesson.videoUrl}`);
        
        // Use a real Cloudinary video from your account
        const newVideoUrl = realCloudinaryVideos[videoIndex % realCloudinaryVideos.length];
        
        // Update the database
        await prisma.courseLesson.update({
          where: { id: lesson.id },
          data: { videoUrl: newVideoUrl }
        });
        
        console.log(`   ✅ Updated with REAL Cloudinary video: ${newVideoUrl}`);
        
        updatedLessons.push({
          id: lesson.id,
          title: lesson.title,
          course: lesson.course.title,
          oldUrl: lesson.videoUrl,
          newUrl: newVideoUrl
        });
        
        videoIndex++;
        
      } catch (error) {
        console.error(`   ❌ Failed to update ${lesson.title}:`, error.message);
      }
    }
    
    // Summary
    console.log('\n📊 REAL CLOUDINARY VIDEOS SUMMARY:');
    console.log(`✅ Successfully updated: ${updatedLessons.length} lessons`);
    console.log(`❌ Failed: ${hardcodedLessons.length - updatedLessons.length} lessons`);
    
    if (updatedLessons.length > 0) {
      console.log('\n🎥 REAL CLOUDINARY VIDEO URLS:');
      updatedLessons.forEach((lesson, index) => {
        console.log(`   ${index + 1}. ${lesson.title} (${lesson.course})`);
        console.log(`      REAL Cloudinary URL: ${lesson.newUrl}`);
        console.log('');
      });
    }
    
    // Verify the changes
    console.log('🔍 Verifying changes...');
    const remainingHardcoded = await prisma.courseLesson.findMany({
      where: {
        OR: [
          { videoUrl: { contains: 'commondatastorage.googleapis.com' } },
          { videoUrl: { contains: 'sample-videos.com' } },
          { videoUrl: { contains: 'example.com' } }
        ]
      }
    });
    
    if (remainingHardcoded.length === 0) {
      console.log('✅ All hardcoded URLs have been replaced with REAL Cloudinary videos!');
    } else {
      console.log(`⚠️  ${remainingHardcoded.length} hardcoded URLs still remain`);
    }
    
    // Check for Cloudinary URLs
    const cloudinaryLessons = await prisma.courseLesson.findMany({
      where: {
        videoUrl: {
          contains: 'cloudinary.com'
        }
      }
    });
    
    console.log(`✅ Now using ${cloudinaryLessons.length} REAL Cloudinary videos!`);
    
    console.log('\n🎉 REAL Cloudinary video setup completed!');
    console.log('📝 Your platform now streams REAL videos from your Cloudinary account!');
    
  } catch (error) {
    console.error('❌ Error during Cloudinary video setup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
if (require.main === module) {
  useRealCloudinaryVideos()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { useRealCloudinaryVideos };
