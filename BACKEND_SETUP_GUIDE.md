# AURA.CA Backend Setup & Testing Guide

## Quick Start

### 1. Start Backend with Health Checks
```bash
cd /home/gotti/Desktop/frontend/backend
./start-backend.sh
```

This script will:
- ✅ Check Node.js and npm installation
- ✅ Kill any existing backend processes
- ✅ Free up port 3001 if needed
- ✅ Install dependencies if needed
- ✅ Start the backend server
- ✅ Verify health with automatic retries
- ✅ Monitor the process continuously

### 2. Run Comprehensive Tests
```bash
cd /home/gotti/Desktop/frontend/backend
./test-backend.sh
```

This script will:
- ✅ Check backend health
- ✅ Test authentication (admin, student, manager)
- ✅ Test role-based access control
- ✅ Test content upload
- ✅ Test API endpoints

## Backend Architecture

### Health Check Endpoints
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with metrics

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/logout-all` - Logout from all devices

### Content Management
- `POST /api/content-management/upload` - Upload content
- `GET /api/courses` - Get courses
- `GET /api/tests` - Get tests

### AI Features
- `POST /api/ai/generate-questions` - Generate questions from text
- `POST /api/ai/generate-questions-from-file` - Generate questions from file

## Environment Variables

Required `.env` file in `/backend` directory:

```env
# Database
DATABASE_URL=postgresql://...

# Cloudinary
CLOUDINARY_CLOUD_NAME=ddhhzeewn
CLOUDINARY_API_KEY=439231598365295
CLOUDINARY_API_SECRET=...

# Gemini AI
GEMINI_API_KEY=...

# JWT
JWT_SECRET=...

# Server
PORT=3001
NODE_ENV=development
```

## Troubleshooting

### Backend Won't Start
1. Check if port 3001 is in use: `lsof -i :3001`
2. Kill existing process: `lsof -ti:3001 | xargs kill -9`
3. Check logs: `tail -100 backend.log`

### Health Check Fails
1. Verify database connection: `DATABASE_URL` in `.env`
2. Check database is running
3. Run migrations: `npx prisma migrate deploy`

### Tests Fail
1. Ensure backend is running: `curl http://localhost:3001/health`
2. Check test credentials in `test-backend.sh`
3. Verify database has test users

## Test Credentials

### Admin
- Email: `admin@aura.ca`
- Password: `Admin@123`

### Student
- Email: `student@aura.ca`
- Password: `Student@123`

### Manager
- Email: `manager@aura.ca`
- Password: `Manager@123`

## API Documentation

Access Swagger documentation at:
```
http://localhost:3001/api-docs
```

## Database

### Reset Database
```bash
npx prisma migrate reset
```

### View Database
```bash
npx prisma studio
```

## Logs

Backend logs are saved to:
- `backend.log` - Main log file
- `.backend.pid` - Process ID file

## Performance Monitoring

The backend includes:
- Request logging with timestamps
- Performance monitoring
- Error tracking
- Memory usage monitoring
- CPU usage monitoring

## Security

- Rate limiting enabled in production
- CORS configured for localhost:3000
- JWT authentication on all protected routes
- Password hashing with bcrypt
- SQL injection prevention with Prisma

## Common Issues

### Port Already in Use
```bash
lsof -ti:3001 | xargs kill -9
```

### Dependencies Not Installed
```bash
npm install
```

### Database Connection Failed
```bash
# Check DATABASE_URL in .env
# Verify database is running
# Run migrations
npx prisma migrate deploy
```

### Health Check Timeout
```bash
# Check backend logs
tail -50 backend.log

# Verify database connection
npx prisma db execute --stdin < /dev/null
```

## Development Workflow

1. **Start Backend**
   ```bash
   ./start-backend.sh
   ```

2. **Run Tests**
   ```bash
   ./test-backend.sh
   ```

3. **Monitor Logs**
   ```bash
   tail -f backend.log
   ```

4. **Make Changes**
   - Edit source files in `src/`
   - Backend auto-reloads with nodemon

5. **Test Changes**
   ```bash
   ./test-backend.sh
   ```

## Production Deployment

For production:
1. Set `NODE_ENV=production`
2. Enable rate limiting
3. Configure CORS for production domain
4. Use environment-specific `.env` file
5. Run database migrations
6. Start with: `npm run build && npm start`

## Support

For issues or questions:
1. Check logs: `tail -100 backend.log`
2. Run health check: `curl http://localhost:3001/health`
3. Run tests: `./test-backend.sh`
4. Check database: `npx prisma studio`

