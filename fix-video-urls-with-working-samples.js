const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Working sample video URLs that actually exist and can be streamed
const workingVideoUrls = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", 
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Zenith.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
];

async function fixVideoUrlsWithWorkingSamples() {
  try {
    console.log('🔧 Fixing video URLs with working sample videos...\n');
    
    // Get all lessons with Cloudinary URLs that don't exist
    const cloudinaryLessons = await prisma.courseLesson.findMany({
      where: {
        videoUrl: {
          contains: 'cloudinary.com'
        }
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
    
    console.log(`📊 Found ${cloudinaryLessons.length} lessons with Cloudinary URLs\n`);
    
    if (cloudinaryLessons.length === 0) {
      console.log('✅ No Cloudinary URLs found to fix');
      return;
    }
    
    const updatedLessons = [];
    let videoIndex = 0;
    
    // Process each lesson
    for (const lesson of cloudinaryLessons) {
      try {
        console.log(`🎬 Processing: ${lesson.title}`);
        console.log(`   Course: ${lesson.course.title}`);
        console.log(`   Old URL: ${lesson.videoUrl}`);
        
        // Use a working sample video URL
        const newVideoUrl = workingVideoUrls[videoIndex % workingVideoUrls.length];
        
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
    console.log('\n📊 FIX SUMMARY:');
    console.log(`✅ Successfully updated: ${updatedLessons.length} lessons`);
    console.log(`❌ Failed: ${cloudinaryLessons.length - updatedLessons.length} lessons`);
    
    if (updatedLessons.length > 0) {
      console.log('\n🎥 NEW WORKING VIDEO URLS:');
      updatedLessons.forEach((lesson, index) => {
        console.log(`   ${index + 1}. ${lesson.title} (${lesson.course})`);
        console.log(`      New: ${lesson.newUrl}`);
        console.log('');
      });
    }
    
    // Verify the changes
    console.log('🔍 Verifying changes...');
    const remainingCloudinary = await prisma.courseLesson.findMany({
      where: {
        videoUrl: {
          contains: 'cloudinary.com'
        }
      }
    });
    
    if (remainingCloudinary.length === 0) {
      console.log('✅ All Cloudinary URLs have been replaced with working videos!');
    } else {
      console.log(`⚠️  ${remainingCloudinary.length} Cloudinary URLs still remain`);
    }
    
    console.log('\n🎉 Video URL fix completed!');
    console.log('📝 Note: These are working sample videos. Replace with real educational content when available.');
    
  } catch (error) {
    console.error('❌ Error during video URL fix:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
if (require.main === module) {
  fixVideoUrlsWithWorkingSamples()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixVideoUrlsWithWorkingSamples };
