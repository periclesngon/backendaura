const http = require('http');

const TEST_USER = {
  email: 'timaclaude@gmail.com',
  password: 'password123'
};

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          resolve({
            statusCode: res.statusCode,
            data: parsedBody
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: { error: 'Invalid JSON response', body }
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function debugAuth() {
  try {
    console.log('🔍 Debugging Authentication Issues');
    console.log('=====================================');

    // Step 1: Login
    console.log('\n1. Testing login...');
    const loginResponse = await makeRequest('POST', '/api/auth/login', TEST_USER);
    console.log('Login Status:', loginResponse.statusCode);
    console.log('Login Response:', JSON.stringify(loginResponse.data, null, 2));

    if (loginResponse.statusCode !== 200 || !loginResponse.data.success) {
      console.log('❌ Login failed, cannot proceed');
      return;
    }

    const token = loginResponse.data.data.tokens.accessToken;
    console.log('✅ Login successful, token length:', token.length);
    console.log('Token preview:', token.substring(0, 50) + '...');

    // Step 2: Test available slots endpoint
    console.log('\n2. Testing available slots endpoint...');
    const slotsResponse = await makeRequest(
      'GET',
      '/api/voice-simulation/available-slots',
      null,
      { 'Authorization': `Bearer ${token}` }
    );
    console.log('Slots Status:', slotsResponse.statusCode);
    console.log('Slots Response:', JSON.stringify(slotsResponse.data, null, 2));

    // Step 3: Test monthly count endpoint
    console.log('\n3. Testing monthly count endpoint...');
    const countResponse = await makeRequest(
      'GET',
      '/api/voice-simulation/monthly-count',
      null,
      { 'Authorization': `Bearer ${token}` }
    );
    console.log('Count Status:', countResponse.statusCode);
    console.log('Count Response:', JSON.stringify(countResponse.data, null, 2));

    // Step 4: Test history endpoint
    console.log('\n4. Testing history endpoint...');
    const historyResponse = await makeRequest(
      'GET',
      '/api/voice-simulation/history',
      null,
      { 'Authorization': `Bearer ${token}` }
    );
    console.log('History Status:', historyResponse.statusCode);
    console.log('History Response:', JSON.stringify(historyResponse.data, null, 2));
  } catch (error) {
    console.error('Error in debugAuth:', error);
  }
}

debugAuth().catch(console.error);
