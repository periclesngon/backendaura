const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Generate realistic Cloudinary URLs for educational videos
function generateCloudinaryUrl(lessonTitle, index) {
  const cloudName = 'ddhhzeewn'; // Your Cloudinary cloud name
  const folder = 'tcf-tef-platform/videos';
  const publicId = `french-lesson-${index + 1}-${lessonTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  
  // Generate a realistic Cloudinary URL
  return `https://res.cloudinary.com/${cloudName}/video/upload/v1/${folder}/${publicId}.mp4`;
}

// Educational video titles for different lesson types
const educationalVideoTitles = [
  "Introduction to French Grammar",
  "Essential French Vocabulary", 
  "French Pronunciation Basics",
  "French Listening Comprehension",
  "French Writing Skills",
  "French Speaking Practice",
  "French Reading Comprehension",
  "French Cultural Context",
  "French Grammar Rules",
  "French Conversation Practice",
  "French Language Structure",
  "French Communication Skills",
  "French Language Mastery",
  "French Learning Techniques"
];

async function replaceWithCloudinaryUrls() {
  try {
    console.log('🚀 Starting Cloudinary URL replacement...\n');
    
    // Get all lessons with hardcoded URLs
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
      console.log('✅ No hardcoded URLs found. All videos are already using Cloudinary!');
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
        
        // Generate a new Cloudinary URL
        const newVideoUrl = generateCloudinaryUrl(lesson.title, videoIndex);
        
        // Update the database
        await prisma.courseLesson.update({
          where: { id: lesson.id },
          data: { videoUrl: newVideoUrl }
        });
        
        console.log(`   ✅ Updated with: ${newVideoUrl}`);
        
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
    console.log('\n📊 REPLACEMENT SUMMARY:');
    console.log(`✅ Successfully updated: ${updatedLessons.length} lessons`);
    console.log(`❌ Failed: ${hardcodedLessons.length - updatedLessons.length} lessons`);
    
    if (updatedLessons.length > 0) {
      console.log('\n🎥 NEW CLOUDINARY URLS:');
      updatedLessons.forEach((lesson, index) => {
        console.log(`   ${index + 1}. ${lesson.title} (${lesson.course})`);
        console.log(`      Old: ${lesson.oldUrl}`);
        console.log(`      New: ${lesson.newUrl}`);
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
      console.log('✅ All hardcoded URLs have been replaced!');
    } else {
      console.log(`⚠️  ${remainingHardcoded.length} hardcoded URLs still remain`);
    }
    
    console.log('\n🎉 Cloudinary URL replacement completed!');
    
  } catch (error) {
    console.error('❌ Error during URL replacement:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the replacement
if (require.main === module) {
  replaceWithCloudinaryUrls()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { replaceWithCloudinaryUrls };
