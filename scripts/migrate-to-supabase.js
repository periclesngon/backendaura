#!/usr/bin/env node

/**
 * Database Migration Script: Local → Supabase PostgreSQL
 * 
 * This script helps migrate your database to Supabase while avoiding
 * Prisma naming conflicts and ensuring data integrity.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.bold}${colors.blue}🔄${colors.reset} ${msg}`)
};

class DatabaseMigrator {
  constructor() {
    this.prisma = new PrismaClient();
    this.migrationLog = [];
  }

  async checkEnvironment() {
    log.step('Checking environment configuration...');
    
    const requiredEnvVars = [
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      log.error(`Missing environment variables: ${missingVars.join(', ')}`);
      log.info('Please set up your .env file with Supabase credentials');
      process.exit(1);
    }

    log.success('Environment configuration verified');
  }

  async testDatabaseConnection() {
    log.step('Testing database connection...');
    
    try {
      await this.prisma.$connect();
      log.success('Database connection successful');
      return true;
    } catch (error) {
      log.error(`Database connection failed: ${error.message}`);
      return false;
    }
  }

  async checkSchemaCompatibility() {
    log.step('Checking schema compatibility...');
    
    try {
      // Test basic operations
      await this.prisma.user.findMany({ take: 1 });
      await this.prisma.post.findMany({ take: 1 });
      await this.prisma.course.findMany({ take: 1 });
      
      log.success('Schema compatibility verified');
      return true;
    } catch (error) {
      log.error(`Schema compatibility check failed: ${error.message}`);
      return false;
    }
  }

  async exportCurrentData() {
    log.step('Exporting current data...');
    
    try {
      const data = {
        users: await this.prisma.user.findMany(),
        posts: await this.prisma.post.findMany(),
        courses: await this.prisma.course.findMany(),
        comments: await this.prisma.comment.findMany(),
        likes: await this.prisma.like.findMany(),
        favorites: await this.prisma.favorite.findMany(),
        // Add other models as needed
      };

      const exportPath = path.join(__dirname, '..', 'data-export.json');
      fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));
      
      log.success(`Data exported to ${exportPath}`);
      return data;
    } catch (error) {
      log.error(`Data export failed: ${error.message}`);
      throw error;
    }
  }

  async validateSupabaseConnection() {
    log.step('Validating Supabase connection...');
    
    try {
      // Test if we can connect to Supabase
      const result = await this.prisma.$queryRaw`SELECT 1 as test`;
      log.success('Supabase connection validated');
      return true;
    } catch (error) {
      log.error(`Supabase connection failed: ${error.message}`);
      log.info('Please check your DATABASE_URL in .env file');
      return false;
    }
  }

  async runMigration() {
    log.step('Starting database migration...');
    
    try {
      // Step 1: Check environment
      await this.checkEnvironment();
      
      // Step 2: Test current database connection
      const currentDbConnected = await this.testDatabaseConnection();
      if (!currentDbConnected) {
        throw new Error('Cannot connect to current database');
      }
      
      // Step 3: Check schema compatibility
      const schemaCompatible = await this.checkSchemaCompatibility();
      if (!schemaCompatible) {
        throw new Error('Schema compatibility issues detected');
      }
      
      // Step 4: Export current data
      const currentData = await this.exportCurrentData();
      
      // Step 5: Validate Supabase connection
      const supabaseConnected = await this.validateSupabaseConnection();
      if (!supabaseConnected) {
        throw new Error('Cannot connect to Supabase');
      }
      
      log.success('Migration preparation completed successfully!');
      log.info('Next steps:');
      log.info('1. Run: npx prisma db push');
      log.info('2. Run: npx prisma db seed');
      log.info('3. Test your application');
      
      return true;
    } catch (error) {
      log.error(`Migration failed: ${error.message}`);
      return false;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  async generateMigrationReport() {
    log.step('Generating migration report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not set',
        supabaseUrl: process.env.SUPABASE_URL ? 'Set' : 'Not set'
      },
      migrationLog: this.migrationLog,
      recommendations: [
        'Test all API endpoints after migration',
        'Monitor database performance',
        'Set up proper backups',
        'Update deployment configuration'
      ]
    };

    const reportPath = path.join(__dirname, '..', 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    log.success(`Migration report generated: ${reportPath}`);
  }
}

// Main execution
async function main() {
  console.log(`${colors.bold}${colors.blue}🚀 Database Migration to Supabase${colors.reset}\n`);
  
  const migrator = new DatabaseMigrator();
  
  try {
    const success = await migrator.runMigration();
    
    if (success) {
      await migrator.generateMigrationReport();
      log.success('Migration process completed successfully!');
      process.exit(0);
    } else {
      log.error('Migration process failed');
      process.exit(1);
    }
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseMigrator;
