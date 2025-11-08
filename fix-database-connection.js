#!/usr/bin/env node

/**
 * Database Connection Fix Script
 * 
 * This script fixes the database connection issues by:
 * 1. Testing the current Aiven database connection
 * 2. Providing fallback options if Aiven is down
 * 3. Setting up local database if needed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Database Connection Fix Script');
console.log('=====================================\n');

// Check if PostgreSQL is installed locally
function checkLocalPostgreSQL() {
  try {
    execSync('which psql', { stdio: 'ignore' });
    console.log('✅ PostgreSQL is installed locally');
    return true;
  } catch (error) {
    console.log('❌ PostgreSQL is not installed locally');
    return false;
  }
}

// Test Aiven database connection
function testAivenConnection() {
  console.log('🔍 Testing Aiven database connection...');
  try {
    execSync('npx prisma db pull --schema=./prisma/schema.prisma', { 
      stdio: 'pipe',
      cwd: process.cwd()
    });
    console.log('✅ Aiven database connection successful');
    return true;
  } catch (error) {
    console.log('❌ Aiven database connection failed');
    console.log('Error:', error.message);
    return false;
  }
}

// Create local database setup script
function createLocalDatabaseSetup() {
  const setupScript = `#!/bin/bash

# Local PostgreSQL Database Setup Script
echo "🐘 Setting up local PostgreSQL database..."

# Install PostgreSQL if not installed
if ! command -v psql &> /dev/null; then
    echo "Installing PostgreSQL..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
fi

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql -c "CREATE DATABASE tcf_tef_db;"
sudo -u postgres psql -c "CREATE USER tcf_user WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE tcf_tef_db TO tcf_user;"
sudo -u postgres psql -c "ALTER USER tcf_user CREATEDB;"

echo "✅ Local database setup complete!"
echo "Database URL: postgresql://tcf_user:password@localhost:5432/tcf_tef_db"
`;

  fs.writeFileSync('setup-local-db.sh', setupScript);
  execSync('chmod +x setup-local-db.sh');
  console.log('📝 Created setup-local-db.sh script');
}

// Create environment file for local database
function createLocalEnvFile() {
  const localEnvContent = `# Local Database Configuration (Fallback when Aiven is down)
DATABASE_URL="postgresql://tcf_user:password@localhost:5432/tcf_tef_db"

# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Configuration
JWT_SECRET=tcf-tef-super-secret-jwt-key-2024-development
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=tcf-tef-refresh-token-secret-2024-development
JWT_REFRESH_EXPIRES_IN=30d

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noafrederic91@gmail.com
SMTP_PASS=zdai raqa zytg fewi
EMAIL_FROM=noafrederic91@gmail.com

# Redis Configuration
REDIS_URL=redis://localhost:6379

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads/

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=ddhhzeewn
CLOUDINARY_API_KEY=439231598365295
CLOUDINARY_API_SECRET=wX81kg-Xb5cGuUwZFeGMOfvgArc

# Stripe Payment Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_PUBLISHABLE_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Agora Live Sessions Configuration
AGORA_APP_ID=dddd690283894422ac4f4336bac4a325
AGORA_APP_CERTIFICATE=9b14da1234ff4e2486d4605191648abd
AGORA_TOKEN_EXPIRY=3600

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# AI Configuration
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
GEMINI_API_KEY=AIzaSyAQLAg0KRZAG_-oK74908fOkS-nrke5Zw0

# Google OAuth Configuration
GOOGLE_CLIENT_ID=896942129388-64400ed6210aea818fa5c9.apps.googleusercontent.com

# VAPI Configuration
VAPI_API_KEY=0d7d586a-e96e-43b4-84d5-3e9bfe238911
VAPI_PUBLIC_KEY=cb1632e0-6256-45c2-93ca-798072bba18d
VAPI_BASE_URL=https://api.vapi.ai
`;

  fs.writeFileSync('.env.local', localEnvContent);
  console.log('📝 Created .env.local file for local database');
}

// Main fix function
async function fixDatabaseConnection() {
  console.log('🚀 Starting database connection fix...\n');

  // Test current Aiven connection
  const aivenWorking = testAivenConnection();
  
  if (aivenWorking) {
    console.log('✅ Aiven database is working! No fix needed.');
    return;
  }

  console.log('\n🔧 Aiven database is down. Setting up fallback options...\n');

  // Check if PostgreSQL is available locally
  const postgresInstalled = checkLocalPostgreSQL();

  if (postgresInstalled) {
    console.log('✅ PostgreSQL is available locally');
    createLocalDatabaseSetup();
    createLocalEnvFile();
    
    console.log('\n📋 Next steps:');
    console.log('1. Run: ./setup-local-db.sh');
    console.log('2. Run: cp .env.local .env');
    console.log('3. Run: npx prisma db push');
    console.log('4. Run: npm run dev');
  } else {
    console.log('\n❌ PostgreSQL is not installed locally');
    console.log('\n📋 Manual steps:');
    console.log('1. Install PostgreSQL: sudo apt-get install postgresql postgresql-contrib');
    console.log('2. Create database: sudo -u postgres createdb tcf_tef_db');
    console.log('3. Update DATABASE_URL in .env to use local database');
    console.log('4. Run: npx prisma db push');
  }

  console.log('\n🎯 Alternative solutions:');
  console.log('1. Wait for Aiven database to come back online');
  console.log('2. Contact Aiven support about connection limits');
  console.log('3. Upgrade Aiven plan for more connections');
  console.log('4. Use a different cloud database provider');
}

// Run the fix
fixDatabaseConnection().catch(console.error);
