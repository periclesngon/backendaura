/**
 * Simple test to upload materials and verify they appear on the courses page
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_BASE_URL = 'http://localhost:3001/api';

// Test credentials - use admin account
const TEST_EMAIL = 'admin@aura.ca';
const TEST_PASSWORD = 'Admin@123';

let authToken = null;

/**
 * Login and get auth token
 */
async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    if (response.data.success && response.data.data?.tokens?.accessToken) {
      authToken = response.data.data.tokens.accessToken;
      console.log('✅ Login successful!');
      console.log(`   Token: ${authToken.substring(0, 50)}...`);
      return authToken;
    } else {
      console.error('❌ Login failed:', response.data.message);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
  }
}

/**
 * Upload a single material
 */
async function uploadMaterial(title, description, category, level = 'A1', tier = 'FREE') {
  try {
    // Create test file
    const content = `# ${title}\n\n${description}\n\nThis is test content for ${category}.`;
    const filename = `test-${Date.now()}.txt`;
    const filepath = path.join(__dirname, filename);
    fs.writeFileSync(filepath, content);

    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(filepath));
    form.append('title', title);
    form.append('description', description);
    form.append('level', level);
    form.append('category', category);
    form.append('subscriptionTier', tier);
    form.append('contentType', 'NOTE');
    form.append('duration', '60');
    form.append('tags', JSON.stringify([category.toLowerCase(), level]));

    console.log(`\n📤 Uploading: ${title}`);
    console.log(`   Category: ${category}, Level: ${level}`);

    const response = await axios.post(
      `${API_BASE_URL}/content-management/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    if (response.data.success) {
      const content = response.data.data.content;
      console.log(`✅ Uploaded successfully!`);
      console.log(`   ID: ${content.id}`);
      console.log(`   Published: ${content.isPublished}`);
      fs.unlinkSync(filepath);
      return content;
    } else {
      console.error(`❌ Upload failed:`, response.data.message);
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    if (error.response?.data) {
      console.error('   Details:', error.response.data);
    }
  }
}

/**
 * Fetch courses with optional filter
 */
async function fetchCourses(category = null, level = null) {
  try {
    const params = { page: 1, limit: 50 };
    if (category) params.category = category;
    if (level) params.level = level;

    const response = await axios.get(`${API_BASE_URL}/content-management/courses`, { params });

    if (response.data.success) {
      return response.data.data.content;
    }
  } catch (error) {
    console.error('❌ Error fetching courses:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting material upload and verification test...\n');
  console.log('='.repeat(70));

  // Login first
  await login();
  if (!authToken) {
    console.error('❌ Cannot proceed without authentication');
    return;
  }

  // Upload materials for each category
  const categories = [
    { name: 'GRAMMAR', title: 'Grammaire Française', desc: 'Cours de grammaire' },
    { name: 'LISTENING', title: 'Compréhension Orale', desc: 'Exercices d\'écoute' },
    { name: 'READING', title: 'Compréhension Écrite', desc: 'Exercices de lecture' },
    { name: 'VOCABULARY', title: 'Vocabulaire', desc: 'Expansion du vocabulaire' },
    { name: 'WRITING', title: 'Expression Écrite', desc: 'Exercices d\'écriture' },
    { name: 'ORAL', title: 'Expression Orale', desc: 'Exercices de conversation' },
    { name: 'TCF_TEF', title: 'Simulation TCF/TEF', desc: 'Simulation complète TCF/TEF' }
  ];

  console.log('\n📤 Uploading test materials...');
  console.log('='.repeat(70));

  const uploadedMaterials = [];
  for (const cat of categories) {
    const material = await uploadMaterial(cat.title, cat.desc, cat.name, 'A1', 'FREE');
    if (material) {
      uploadedMaterials.push(material);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Fetch all courses
  console.log('\n' + '='.repeat(70));
  console.log('\n📚 Fetching all courses...');
  const allCourses = await fetchCourses();
  if (allCourses) {
    console.log(`✅ Found ${allCourses.length} total courses`);
    allCourses.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.title} (${c.category}, ${c.level}, Published: ${c.isPublished})`);
    });
  }

  // Test category filters
  console.log('\n' + '='.repeat(70));
  console.log('\n🔍 Testing category filters...');
  for (const cat of categories) {
    const courses = await fetchCourses(cat.name);
    if (courses) {
      console.log(`   ${cat.name}: ${courses.length} course(s)`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Test completed!\n');
}

main().catch(console.error);

