const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTable() {
  try {
    console.log('Creating user_daily_goals table...');
    
    // Create the table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "user_daily_goals" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "targetValue" INTEGER NOT NULL,
        "currentValue" INTEGER NOT NULL DEFAULT 0,
        "unit" TEXT NOT NULL DEFAULT 'minutes',
        "xpReward" INTEGER NOT NULL DEFAULT 50,
        "isCompleted" BOOLEAN NOT NULL DEFAULT false,
        "completedAt" TIMESTAMP(3),
        "targetDate" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_daily_goals_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Create unique index
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_daily_goals_userId_targetDate_key" 
      ON "user_daily_goals"("userId", "targetDate");
    `);
    
    // Create other indexes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_daily_goals_userId_targetDate_isCompleted_idx" 
      ON "user_daily_goals"("userId", "targetDate", "isCompleted");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_daily_goals_targetDate_idx" 
      ON "user_daily_goals"("targetDate");
    `);
    
    // Add foreign key constraint
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_daily_goals_userId_fkey'
        ) THEN
          ALTER TABLE "user_daily_goals" ADD CONSTRAINT "user_daily_goals_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    
    console.log('✅ Table user_daily_goals created successfully!');
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    if (error.code === '42P07') {
      console.log('Table already exists, skipping...');
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTable();


