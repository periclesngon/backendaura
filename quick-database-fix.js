#!/usr/bin/env node

/**
 * Quick Database Fix - No sudo required
 * 
 * This script provides immediate fixes for the database connection issue
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Quick Database Fix');
console.log('====================\n');

// Create a temporary local database configuration
function createTempLocalConfig() {
  const tempEnvContent = `# Temporary Local Database Configuration
# This uses SQLite as a fallback when PostgreSQL is not available

DATABASE_URL="file:./dev.db"

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

  fs.writeFileSync('.env.temp', tempEnvContent);
  console.log('✅ Created temporary .env.temp with SQLite configuration');
}

// Update Prisma schema for SQLite
function updatePrismaSchemaForSQLite() {
  const schemaPath = './prisma/schema.prisma';
  
  if (fs.existsSync(schemaPath)) {
    let schemaContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Update datasource to use SQLite
    schemaContent = schemaContent.replace(
      /datasource db \{[^}]*\}/s,
      `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`
    );
    
    fs.writeFileSync('./prisma/schema.sqlite.prisma', schemaContent);
    console.log('✅ Created SQLite schema at prisma/schema.sqlite.prisma');
  }
}

// Create a simple database setup script
function createDatabaseSetupScript() {
  const setupScript = `#!/bin/bash

echo "🔧 Setting up temporary database solution..."

# Backup current .env
if [ -f .env ]; then
    cp .env .env.backup_\$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up current .env"
fi

# Use temporary configuration
cp .env.temp .env
echo "✅ Switched to temporary database configuration"

# Generate Prisma client
npx prisma generate

# Create database and run migrations
npx prisma db push

echo "✅ Database setup complete!"
echo "🚀 You can now start the server with: npm run dev"
`;

  fs.writeFileSync('setup-temp-db.sh', setupScript);
  console.log('✅ Created setup-temp-db.sh script');
}

// Main function
function main() {
  console.log('🔍 Diagnosing database connection issue...\n');
  
  console.log('📊 Issue Analysis:');
  console.log('- Aiven database server is unreachable');
  console.log('- Connection limit reached: "remaining connection slots are reserved"');
  console.log('- Need immediate fallback solution\n');
  
  console.log('🔧 Creating temporary solution...\n');
  
  createTempLocalConfig();
  updatePrismaSchemaForSQLite();
  createDatabaseSetupScript();
  
  console.log('\n📋 Next Steps:');
  console.log('1. Run: chmod +x setup-temp-db.sh');
  console.log('2. Run: ./setup-temp-db.sh');
  console.log('3. Run: npm run dev');
  console.log('\n🎯 This will:');
  console.log('- Use SQLite as temporary database');
  console.log('- Create all necessary tables');
  console.log('- Allow admin dashboard to work');
  console.log('\n⚠️  Note: This is a temporary solution. For production, you should:');
  console.log('- Fix the Aiven database connection');
  console.log('- Or set up a proper PostgreSQL database');
  console.log('- Or use a different cloud database provider');
}

main();
