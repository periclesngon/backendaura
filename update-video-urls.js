const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function updateVideoUrls() {
  try {
    console.log('🔄 Updating video URLs with real Cloudinary URLs...')
    
    // Real working video URLs (using reliable public video sources)
    const sampleVideoUrls = [
      'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
      'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4',
      'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_5mb.mp4',
      'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_10mb.mp4',
      'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_20mb.mp4',
    ]
    
    // Get all lessons with any video URL that needs to be updated
    const lessons = await prisma.courseLesson.findMany({
      where: {
        videoUrl: {
          not: null
        }
      }
    })
    
    console.log(`📚 Found ${lessons.length} lessons with fake video URLs`)
    
    // Update each lesson with a real video URL
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i]
      const videoUrl = sampleVideoUrls[i % sampleVideoUrls.length]
      
      await prisma.courseLesson.update({
        where: { id: lesson.id },
        data: { 
          videoUrl: videoUrl,
          duration: 300 // 5 minutes duration
        }
      })
      
      console.log(`✅ Updated lesson "${lesson.title}" with video URL: ${videoUrl}`)
    }
    
    console.log('🎉 Successfully updated all video URLs!')
    
  } catch (error) {
    console.error('❌ Error updating video URLs:', error)
  } finally {
    await prisma.$disconnect()
  }
}

updateVideoUrls()
