#!/usr/bin/env node

/**
 * Debug Level Assessment
 * Simple test to debug the level assessment issue
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:3001';

console.log('🔍 Debugging Level Assessment...\n');

async function testStudentLogin() {
  console.log('🔐 Testing student login...');
  
  try {
    const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      email: 'timaclaude@gmail.com',
      password: 'password123'
    });

    if (response.data.success) {
      console.log('✅ Student login successful!');
      return response.data.data.tokens.accessToken;
    } else {
      console.log('❌ Student login failed:', response.data.error);
      return null;
    }
  } catch (error) {
    console.log('❌ Student login error:', error.response?.data || error.message);
    return null;
  }
}

async function debugAssessment(token) {
  console.log('\n🔍 Testing simple assessment...');
  
  try {
    // Very simple test data
    const simpleData = {
      testLevel: 'B1',
      score: 80,
      totalQuestions: 20,
      correctAnswers: 16,
      timeSpent: 30
    };

    console.log('📤 Sending data:', JSON.stringify(simpleData, null, 2));

    const response = await axios.post(`${BACKEND_URL}/api/simulations/assess-level`, simpleData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📥 Response status:', response.status);
    console.log('📥 Response data:', JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log('✅ Assessment successful!');
      return response.data.data.assessment;
    } else {
      console.log('❌ Assessment failed:', response.data.error);
      return null;
    }
  } catch (error) {
    console.log('❌ Assessment error:');
    console.log('Status:', error.response?.status);
    console.log('Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Message:', error.message);
    return null;
  }
}

async function runDebugTest() {
  // Test student login
  const token = await testStudentLogin();
  if (!token) {
    console.log('❌ Cannot proceed without authentication');
    return;
  }

  // Test simple assessment
  const assessment = await debugAssessment(token);
  
  if (assessment) {
    console.log('\n✅ Assessment completed successfully!');
    console.log(`Level: ${assessment.determinedLevel}`);
    console.log(`Confidence: ${(assessment.confidence * 100).toFixed(1)}%`);
  } else {
    console.log('\n❌ Assessment failed');
  }
}

// Run the test
runDebugTest().catch(console.error);
