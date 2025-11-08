/**
 * Create Test Courses via API
 * Creates test courses through the API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function createTestCourses() {
  console.log('🎓 Creating test courses via API...');

  try {
    // Login as admin
    console.log('🔐 Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@tcftef.com',
      password: 'AdminTest123!'
    });

    const adminToken = loginResponse.data.data.tokens.accessToken;
    console.log('✅ Admin login successful');

    // Create test courses
    const courses = [
      {
        title: 'TCF Preparation Course - Beginner',
        description: 'Complete preparation course for TCF (Test de Connaissance du Français) for beginners',
        level: 'A1',
        price: 99.99,
        thumbnail: 'https://example.com/tcf-beginner.jpg',
        category: 'TCF_TEF',
        duration: 40,
        language: 'French',
        requiredTier: 'FREE',
        lessons: 10,
        difficulty: 1,
        tags: ['TCF', 'Beginner', 'French', 'Exam']
      },
      {
        title: 'TEF Preparation Course - Intermediate',
        description: 'Comprehensive TEF (Test d\'Évaluation de Français) preparation for intermediate learners',
        level: 'B1',
        price: 149.99,
        thumbnail: 'https://example.com/tef-intermediate.jpg',
        category: 'TCF_TEF',
        duration: 60,
        language: 'French',
        requiredTier: 'ESSENTIAL',
        lessons: 15,
        difficulty: 3,
        tags: ['TEF', 'Intermediate', 'French', 'Exam']
      },
      {
        title: 'French Grammar Mastery',
        description: 'Master French grammar with comprehensive exercises and explanations',
        level: 'B1',
        price: 79.99,
        thumbnail: 'https://example.com/grammar-mastery.jpg',
        category: 'GRAMMAR',
        duration: 30,
        language: 'French',
        requiredTier: 'FREE',
        lessons: 8,
        difficulty: 2,
        tags: ['Grammar', 'French', 'Intermediate']
      },
      {
        title: 'French Conversation Practice',
        description: 'Improve your French speaking skills with interactive conversation practice',
        level: 'B2',
        price: 199.99,
        thumbnail: 'https://example.com/conversation-practice.jpg',
        category: 'ORAL',
        duration: 50,
        language: 'French',
        requiredTier: 'PREMIUM',
        lessons: 12,
        difficulty: 4,
        tags: ['Speaking', 'Conversation', 'Advanced', 'French']
      },
      {
        title: 'French Listening Comprehension',
        description: 'Enhance your French listening skills with authentic materials',
        level: 'B1',
        price: 89.99,
        thumbnail: 'https://example.com/listening.jpg',
        category: 'LISTENING',
        duration: 35,
        language: 'French',
        requiredTier: 'ESSENTIAL',
        lessons: 10,
        difficulty: 3,
        tags: ['Listening', 'Comprehension', 'French']
      }
    ];

    console.log('📚 Creating courses...');
    for (const courseData of courses) {
      try {
        const response = await axios.post(`${BASE_URL}/api/courses`, courseData, {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.data.success) {
          console.log(`✅ Course created: ${courseData.title}`);
        } else {
          console.log(`❌ Failed to create course: ${courseData.title}`);
        }
      } catch (error) {
        console.log(`❌ Error creating course ${courseData.title}:`, error.response?.data?.error?.message || error.message);
      }
    }

    // Create a manager user
    console.log('👥 Creating manager user...');
    try {
      const managerResponse = await axios.post(`${BASE_URL}/api/admin/managers`, {
        email: 'manager@tcftef.com',
        password: 'Manager123!',
        firstName: 'Test',
        lastName: 'Manager',
        role: 'SENIOR_MANAGER'
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (managerResponse.data.success) {
        console.log('✅ Manager created: manager@tcftef.com');
      }
    } catch (error) {
      console.log('❌ Error creating manager:', error.response?.data?.error?.message || error.message);
    }

    console.log('🎉 Test data creation completed!');

  } catch (error) {
    console.error('❌ Error creating test data:', error.response?.data?.error?.message || error.message);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  createTestCourses().catch(console.error);
}

module.exports = { createTestCourses };
