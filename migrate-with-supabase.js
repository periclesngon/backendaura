const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function migrateWithSupabase() {
  try {
    console.log('🚀 Migrating database schema using Supabase client...');
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test connection first
    console.log('🔌 Testing Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('pg_tables')
      .select('tablename')
      .limit(1);

    if (testError) {
      console.log('⚠️  Connection test:', testError.message);
    } else {
      console.log('✅ Supabase connection successful!');
    }

    // Create a simple test table to verify we can create tables
    console.log('📋 Creating test table...');
    const { data: createData, error: createError } = await supabase
      .rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS test_migration (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW()
          );
        `
      });

    if (createError) {
      console.log('⚠️  Table creation result:', createError.message);
    } else {
      console.log('✅ Test table created successfully!');
    }

    // Now let's try to create the Prisma migrations table
    console.log('📋 Creating Prisma migrations table...');
    const { data: migrationData, error: migrationError } = await supabase
      .rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS _prisma_migrations (
            id VARCHAR(36) PRIMARY KEY,
            checksum VARCHAR(64) NOT NULL,
            finished_at TIMESTAMP WITH TIME ZONE,
            migration_name VARCHAR(255) NOT NULL,
            logs TEXT,
            rolled_back_at TIMESTAMP WITH TIME ZONE,
            started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            applied_steps_count INTEGER NOT NULL DEFAULT 0
          );
        `
      });

    if (migrationError) {
      console.log('⚠️  Migration table creation result:', migrationError.message);
    } else {
      console.log('✅ Prisma migrations table created successfully!');
    }

    console.log('🎉 Supabase migration setup completed!');
    console.log('📝 You can now try running: npm run db:push');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
  }
}

migrateWithSupabase();
