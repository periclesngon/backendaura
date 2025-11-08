const { PrismaClient } = require('@prisma/client')
const { CloudinaryService } = require('./dist/services/cloudinaryService')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function uploadRealVideos() {
  try {
    console.log('🎬 Uploading real sample videos to Cloudinary...')
    
    // Test Cloudinary connection first
    const isConnected = await CloudinaryService.testConnection()
    if (!isConnected) {
      console.error('❌ Cloudinary connection failed. Check your environment variables.')
      return
    }
    console.log('✅ Cloudinary connection successful')
    
    // Create a simple test video file (1 second of black video)
    const testVideoPath = path.join(__dirname, 'test-video.mp4')
    
    // For now, let's use a real working video URL from a reliable source
    const workingVideoUrls = [
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    ]
    
    // Get all lessons that need real video URLs
    const lessons = await prisma.courseLesson.findMany({
      where: {
        videoUrl: {
          not: null
        }
      }
    })
    
    console.log(`📚 Found ${lessons.length} lessons to update with real video URLs`)
    
    // For each lesson, we'll use a working video URL
    // In a real scenario, you would upload actual video files to Cloudinary
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i]
      const videoUrl = workingVideoUrls[i % workingVideoUrls.length]
      
      await prisma.courseLesson.update({
        where: { id: lesson.id },
        data: { 
          videoUrl: videoUrl,
          duration: 300 // 5 minutes duration
        }
      })
      
      console.log(`✅ Updated lesson "${lesson.title}" with working video URL`)
    }
    
    console.log('🎉 Successfully updated all lessons with working video URLs!')
    console.log('📝 Note: In production, you should upload real video files to Cloudinary')
    
  } catch (error) {
    console.error('❌ Error uploading videos:', error)
  } finally {
    await prisma.$disconnect()
  }
}

uploadRealVideos()
