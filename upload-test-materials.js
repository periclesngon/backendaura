/**
 * Test script to upload materials for all course categories
 * This will create one material per category to test the system
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3001/api';

// Admin token - you'll need to replace this with a valid token
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWZhdmZkMzAwMDAwY3l6ZjBkMDAwMDAwIiwicm9sZSI6IkFETUluIiwiaWF0IjoxNzI5MjI0NzI0fQ.e-WebRequest';

// Categories to upload
const categories = [
  { name: 'GRAMMAR', title: 'Grammaire Française', description: 'Cours complet de grammaire française' },
  { name: 'LISTENING', title: 'Compréhension Orale', description: 'Exercices de compréhension orale' },
  { name: 'READING', title: 'Compréhension Écrite', description: 'Exercices de compréhension écrite' },
  { name: 'VOCABULARY', title: 'Vocabulaire', description: 'Expansion du vocabulaire français' },
  { name: 'WRITING', title: 'Expression Écrite', description: 'Exercices d\'expression écrite' },
  { name: 'ORAL', title: 'Expression Orale', description: 'Exercices d\'expression orale' },
  { name: 'SIMULATION', title: 'Simulation TCF', description: 'Simulation complète du TCF' }
];

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const subscriptionTiers = ['FREE', 'ESSENTIAL', 'PREMIUM', 'PRO'];

/**
 * Create a test file for upload
 */
function createTestFile(category) {
  const content = `
# ${category.title}

## Description
${category.description}

## Content
This is a test material for the ${category.name} category.
It contains sample content to verify the upload and retrieval system.

## Topics Covered
- Topic 1
- Topic 2
- Topic 3

## Exercises
1. Exercise 1
2. Exercise 2
3. Exercise 3
  `;

  const filename = `test-${category.name.toLowerCase()}.txt`;
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

/**
 * Upload material for a category
 */
async function uploadMaterial(category, level = 'A1', tier = 'FREE') {
  try {
    const filepath = createTestFile(category);
    const fileStream = fs.createReadStream(filepath);

    const formData = new FormData();
    formData.append('file', fileStream);
    formData.append('title', `${category.title} - Level ${level}`);
    formData.append('description', category.description);
    formData.append('level', level);
    formData.append('category', category.name);
    formData.append('subscriptionTier', tier);
    formData.append('contentType', 'NOTE');
    formData.append('duration', '60');
    formData.append('tags', JSON.stringify([category.name.toLowerCase(), level]));

    console.log(`\n📤 Uploading ${category.name} material...`);
    console.log(`   Title: ${category.title} - Level ${level}`);
    console.log(`   Level: ${level}`);
    console.log(`   Tier: ${tier}`);

    const response = await axios.post(
      `${API_BASE_URL}/content-management/upload`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    if (response.data.success) {
      console.log(`✅ ${category.name} uploaded successfully!`);
      console.log(`   ID: ${response.data.data.content.id}`);
      console.log(`   Published: ${response.data.data.content.isPublished}`);
      return response.data.data.content;
    } else {
      console.error(`❌ Failed to upload ${category.name}:`, response.data.message);
    }

    // Clean up
    fs.unlinkSync(filepath);
  } catch (error) {
    console.error(`❌ Error uploading ${category.name}:`, error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
  }
}

/**
 * Fetch and display all courses
 */
async function fetchAllCourses() {
  try {
    console.log('\n\n📚 Fetching all courses...');
    const response = await axios.get(`${API_BASE_URL}/content-management/courses`, {
      params: {
        page: 1,
        limit: 50
      }
    });

    if (response.data.success) {
      const courses = response.data.data.content;
      console.log(`\n✅ Found ${courses.length} courses:`);
      
      courses.forEach((course, index) => {
        console.log(`\n${index + 1}. ${course.title}`);
        console.log(`   Category: ${course.category}`);
        console.log(`   Level: ${course.level}`);
        console.log(`   Published: ${course.isPublished}`);
        console.log(`   Tier: ${course.subscriptionTier}`);
      });

      return courses;
    }
  } catch (error) {
    console.error('❌ Error fetching courses:', error.message);
  }
}

/**
 * Test filtering by category
 */
async function testCategoryFilter(category) {
  try {
    console.log(`\n🔍 Testing filter for category: ${category.name}`);
    const response = await axios.get(`${API_BASE_URL}/content-management/courses`, {
      params: {
        category: category.name,
        page: 1,
        limit: 10
      }
    });

    if (response.data.success) {
      const courses = response.data.data.content;
      console.log(`   Found ${courses.length} courses in ${category.name}`);
      return courses;
    }
  } catch (error) {
    console.error(`❌ Error filtering by ${category.name}:`, error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting material upload test...\n');
  console.log('=' .repeat(60));

  // Wait for backend to be ready
  console.log('⏳ Waiting for backend to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Upload one material per category
  console.log('\n📤 Uploading test materials for all categories...');
  console.log('=' .repeat(60));

  const uploadedMaterials = [];
  for (const category of categories) {
    const material = await uploadMaterial(category, 'A1', 'FREE');
    if (material) {
      uploadedMaterials.push(material);
    }
    // Small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Fetch all courses
  console.log('\n' + '=' .repeat(60));
  const allCourses = await fetchAllCourses();

  // Test category filters
  console.log('\n' + '=' .repeat(60));
  console.log('\n🔍 Testing category filters...');
  console.log('=' .repeat(60));

  for (const category of categories) {
    await testCategoryFilter(category);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ Test completed!');
  console.log('=' .repeat(60));
}

main().catch(console.error);

