const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestPost() {
  try {
    console.log('🔍 Finding admin user...');
    
    // Find admin user
    const admin = await prisma.user.findFirst({
      where: {
        role: 'ADMIN'
      }
    });

    if (!admin) {
      console.error('❌ No admin user found');
      process.exit(1);
    }

    console.log(`✅ Found admin: ${admin.firstName} ${admin.lastName} (${admin.email})`);

    // Create test post
    console.log('\n📝 Creating test post...');
    
    const post = await prisma.post.create({
      data: {
        title: 'Test Post - Functionality Verification',
        content: 'Hello everyone this is a Test to verify to verify our Post functionality works. Like it if you see this post. Thanks',
        excerpt: 'Hello everyone this is a Test to verify our Post functionality works.',
        visibility: 'PUBLIC',
        status: 'PUBLISHED',
        authorId: admin.id,
        category: 'General',
        tags: ['test', 'verification'],
        level: 'B1',
        targetTier: 'FREE'
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    console.log('\n✅ Post created successfully!');
    console.log('\n📊 Post Details:');
    console.log('─'.repeat(50));
    console.log(`ID: ${post.id}`);
    console.log(`Title: ${post.title}`);
    console.log(`Content: ${post.content}`);
    console.log(`Status: ${post.status}`);
    console.log(`Visibility: ${post.visibility}`);
    console.log(`Author: ${post.author.firstName} ${post.author.lastName}`);
    console.log(`Created At: ${post.createdAt}`);
    console.log('─'.repeat(50));

    // Verify post was created
    console.log('\n🔍 Verifying post in database...');
    const verifyPost = await prisma.post.findUnique({
      where: { id: post.id },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (verifyPost) {
      console.log('✅ Post verified in database!');
      console.log(`\n📱 Frontend URL: http://localhost:3000/admin/feed`);
      console.log('The post should appear in the admin feed with status PUBLISHED and visibility PUBLIC');
    } else {
      console.error('❌ Post verification failed');
    }

  } catch (error) {
    console.error('❌ Error creating post:', error.message);
    if (error.meta) {
      console.error('Details:', error.meta);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTestPost();

