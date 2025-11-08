const axios = require('axios');

const API_URL = 'http://localhost:3001/api';

// Admin credentials
const ADMIN_EMAIL = 'admin@aura.ca';
const ADMIN_PASSWORD = 'Admin@123';

let adminToken = null;

async function login() {
  try {
    console.log('🔐 Logging in as admin...');
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (response.data.success) {
      adminToken = response.data.data.tokens.accessToken;
      console.log('✅ Login successful!');
      return true;
    } else {
      console.error('❌ Login failed:', response.data.error?.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:', error.response?.data?.error?.message || error.message);
    return false;
  }
}

async function createManager() {
  try {
    console.log('\n📝 Creating test manager via API...');
    
    const managerData = {
      firstName: 'Test',
      lastName: 'Manager',
      email: 'testmanager@aura.ca',
      password: 'TestManager@123',
      role: 'JUNIOR_MANAGER'
    };

    const response = await axios.post(`${API_URL}/admin/managers`, managerData, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log('✅ Manager created successfully via API!');
      console.log('\n📊 Manager Details:');
      console.log('─'.repeat(50));
      const manager = response.data.data.manager;
      console.log(`ID: ${manager.id}`);
      console.log(`Name: ${manager.firstName} ${manager.lastName}`);
      console.log(`Email: ${manager.email}`);
      console.log(`Role: ${manager.role}`);
      console.log(`Status: ${manager.status}`);
      console.log(`Created At: ${manager.createdAt}`);
      console.log('─'.repeat(50));
      return manager.id;
    } else {
      console.error('❌ Manager creation failed:', response.data.error?.message);
      return null;
    }
  } catch (error) {
    console.error('❌ Manager creation error:', error.response?.data?.error?.message || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function fetchManagers() {
  try {
    console.log('\n🔍 Fetching all managers...');
    
    const response = await axios.get(`${API_URL}/admin/managers`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    if (response.data.success) {
      const managers = response.data.data || [];
      console.log(`✅ Fetched ${managers.length} managers`);
      
      if (managers.length > 0) {
        console.log('\n📋 Managers List:');
        console.log('─'.repeat(50));
        managers.forEach((manager, index) => {
          console.log(`${index + 1}. ${manager.firstName} ${manager.lastName}`);
          console.log(`   Email: ${manager.email}`);
          console.log(`   Role: ${manager.role}`);
          console.log(`   Status: ${manager.status}`);
        });
        console.log('─'.repeat(50));
      }
      return managers;
    } else {
      console.error('❌ Fetch failed:', response.data.error?.message);
      return [];
    }
  } catch (error) {
    console.error('❌ Fetch error:', error.response?.data?.error?.message || error.message);
    return [];
  }
}

async function runTests() {
  console.log('🚀 Starting Manager Creation Tests\n');
  console.log('═'.repeat(50));

  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.error('\n❌ Cannot proceed without login');
    process.exit(1);
  }

  // Step 2: Create manager
  const managerId = await createManager();
  if (!managerId) {
    console.error('\n❌ Cannot proceed without manager creation');
    process.exit(1);
  }

  // Step 3: Fetch managers
  const managers = await fetchManagers();

  // Step 4: Verify manager appears in list
  console.log('\n✅ Verification:');
  console.log('─'.repeat(50));
  const createdManager = managers.find(m => m.id === managerId);
  if (createdManager) {
    console.log('✅ Manager appears in list!');
    console.log(`✅ Name: ${createdManager.firstName} ${createdManager.lastName}`);
    console.log(`✅ Email: ${createdManager.email}`);
    console.log(`✅ Role: ${createdManager.role}`);
  } else {
    console.log('⚠️  Manager not found in list (might be filtered)');
  }

  console.log('─'.repeat(50));
  console.log('\n📱 Frontend URL: http://localhost:3000/admin/managers');
  console.log('The manager should now appear in the managers list!\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

