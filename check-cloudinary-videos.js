const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function checkCloudinaryVideos() {
  try {
    console.log('🔍 Checking existing Cloudinary videos...\n');
    
    // Test connection
    const pingResult = await cloudinary.api.ping();
    console.log('✅ Cloudinary connection successful');
    console.log(`   Status: ${pingResult.status}\n`);
    
    // List all videos in the platform folder
    const result = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'video',
      prefix: 'tcf-tef-platform',
      max_results: 50
    });
    
    console.log(`📊 Found ${result.resources.length} videos in Cloudinary`);
    
    if (result.resources.length > 0) {
      console.log('\n🎥 Existing videos:');
      result.resources.forEach((video, index) => {
        console.log(`   ${index + 1}. ${video.public_id}`);
        console.log(`      URL: ${video.secure_url}`);
        console.log(`      Size: ${(video.bytes / 1024 / 1024).toFixed(2)} MB`);
        console.log(`      Duration: ${video.duration ? `${video.duration}s` : 'Unknown'}`);
        console.log(`      Created: ${new Date(video.created_at).toLocaleDateString()}`);
        console.log('');
      });
    } else {
      console.log('❌ No videos found in Cloudinary');
    }
    
    // Check for any videos in root
    const rootResult = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'video',
      max_results: 20
    });
    
    if (rootResult.resources.length > 0) {
      console.log(`\n📁 Found ${rootResult.resources.length} videos in root folder:`);
      rootResult.resources.forEach((video, index) => {
        console.log(`   ${index + 1}. ${video.public_id}`);
        console.log(`      URL: ${video.secure_url}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking Cloudinary videos:', error.message);
  }
}

// Run the check
if (require.main === module) {
  checkCloudinaryVideos()
    .then(() => {
      console.log('\n✅ Check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkCloudinaryVideos };
