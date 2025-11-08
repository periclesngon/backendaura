#!/bin/bash

echo "🔧 Setting up temporary database solution..."

# Backup current .env
if [ -f .env ]; then
    cp .env .env.backup_$(date +%Y%m%d_%H%M%S)
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
