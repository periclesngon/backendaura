const { PrismaClient } = require('@prisma/client');
const { CloudinaryService } = require('./dist/services/cloudinaryService');
const fs = require('fs');
const path = require('path');
const https = require('https');

const prisma = new PrismaClient();

// Educational video URLs that are free to use for educational purposes
const educationalVideos = [
  {
    title: "French Grammar Basics",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4",
    description: "Introduction to French grammar fundamentals"
  },
  {
    title: "French Vocabulary Building",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4", 
    description: "Essential French vocabulary for beginners"
  },
  {
    title: "French Pronunciation Guide",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_5mb.mp4",
    description: "Master French pronunciation techniques"
  },
  {
    title: "French Listening Comprehension",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_10mb.mp4",
    description: "Improve your French listening skills"
  },
  {
    title: "French Writing Skills",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4",
    description: "Develop your French writing abilities"
  },
  {
    title: "French Speaking Practice",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4",
    description: "Practice speaking French with confidence"
  },
  {
    title: "French Reading Comprehension",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_5mb.mp4",
    description: "Enhance your French reading skills"
  },
  {
    title: "French Cultural Context",
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_10mb.mp4",
    description: "Understanding French culture and context"
  }
];

// Download video from URL
async function downloadVideo(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filename);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download video: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(filename);
      });
      
      file.on('error', (err) => {
        fs.unlink(filename, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Upload video to Cloudinary
async function uploadToCloudinary(videoPath, title) {
  try {
    console.log(`📤 Uploading ${title} to Cloudinary...`);
    
    const result = await CloudinaryService.uploadFile(videoPath, {
      resource_type: 'video',
      folder: 'tcf-tef-platform/videos',
      public_id: `french-lesson-${title.toLowerCase().replace(/\s+/g, '-')}`,
      tags: ['french', 'education', 'tcf-tef', 'lesson']
    });
    
    console.log(`✅ Uploaded successfully: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error(`❌ Failed to upload ${title}:`, error.message);
    throw error;
  }
}

// Replace hardcoded URLs with Cloudinary URLs
async function replaceVideoUrls() {
  try {
    console.log('🚀 Starting video URL replacement process...\n');
    
    // Test Cloudinary connection
    console.log('🔍 Testing Cloudinary connection...');
    const isConnected = await CloudinaryService.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to Cloudinary. Please check your credentials.');
    }
    console.log('✅ Cloudinary connection successful\n');
    
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
      }
    });
    
    console.log(`📊 Found ${hardcodedLessons.length} lessons with hardcoded URLs\n`);
    
    if (hardcodedLessons.length === 0) {
      console.log('✅ No hardcoded URLs found. All videos are already using Cloudinary!');
      return;
    }
    
    // Create temp directory for downloads
    const tempDir = path.join(__dirname, 'temp-videos');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const cloudinaryUrls = [];
    let videoIndex = 0;
    
    // Process each lesson
    for (const lesson of hardcodedLessons) {
      try {
        console.log(`\n🎬 Processing: ${lesson.title}`);
        console.log(`   Course: ${lesson.course.title}`);
        console.log(`   Current URL: ${lesson.videoUrl}`);
        
        // Select a video from our educational collection
        const selectedVideo = educationalVideos[videoIndex % educationalVideos.length];
        const tempFilePath = path.join(tempDir, `video-${lesson.id}.mp4`);
        
        console.log(`   Downloading: ${selectedVideo.title}`);
        
        // Download the video
        await downloadVideo(selectedVideo.url, tempFilePath);
        console.log(`   ✅ Downloaded successfully`);
        
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadToCloudinary(tempFilePath, selectedVideo.title);
        cloudinaryUrls.push({
          lessonId: lesson.id,
          oldUrl: lesson.videoUrl,
          newUrl: cloudinaryUrl,
          title: lesson.title
        });
        
        // Update database
        await prisma.courseLesson.update({
          where: { id: lesson.id },
          data: { videoUrl: cloudinaryUrl }
        });
        
        console.log(`   ✅ Updated database with Cloudinary URL`);
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        console.log(`   🗑️  Cleaned up temporary file`);
        
        videoIndex++;
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`   ❌ Failed to process ${lesson.title}:`, error.message);
        // Continue with next lesson
      }
    }
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('\n🗑️  Cleaned up temporary directory');
    }
    
    // Summary
    console.log('\n📊 REPLACEMENT SUMMARY:');
    console.log(`✅ Successfully processed: ${cloudinaryUrls.length} lessons`);
    console.log(`❌ Failed: ${hardcodedLessons.length - cloudinaryUrls.length} lessons`);
    
    if (cloudinaryUrls.length > 0) {
      console.log('\n🎥 NEW CLOUDINARY URLS:');
      cloudinaryUrls.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.title}`);
        console.log(`      Old: ${item.oldUrl}`);
        console.log(`      New: ${item.newUrl}`);
      });
    }
    
    console.log('\n🎉 Video URL replacement completed!');
    
  } catch (error) {
    console.error('❌ Error during video URL replacement:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the replacement
if (require.main === module) {
  replaceVideoUrls()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { replaceVideoUrls };
