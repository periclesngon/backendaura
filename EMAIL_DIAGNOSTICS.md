# Email Service Diagnostics

## Issue: No Email Received After Scheduling Simulation

### Root Cause
**Email configuration (SMTP) is not set in environment variables.**

### Required Environment Variables

The email service requires one of these configurations:

#### Option 1: Standard SMTP
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM_ADDRESS=your-email@gmail.com
EMAIL_FROM_NAME=AURA.CA
```

#### Option 2: Twilio SendGrid
```env
TWILIO_SMTP_HOST=smtp.sendgrid.net
TWILIO_SMTP_PORT=587
TWILIO_SMTP_SECURE=false
TWILIO_SMTP_USER=apikey
TWILIO_SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=AURA.CA
```

### Current Status

✅ **Email Service Code**: Working correctly
✅ **Email Sending Logic**: Implemented properly
✅ **Reminder Scheduler**: Started and running (checks every minute)
✅ **Voice Simulation Reminders**: Cron job active (checks every 5 minutes)
✅ **Live Session Reminders**: Working correctly

❌ **SMTP Configuration**: NOT CONFIGURED (all env vars missing)

### Email Types That Should Work (Once Configured)

1. **Voice Simulation Booking Confirmation** - Sent immediately when booking is created
2. **Voice Simulation Reminder** - Sent 30 minutes before simulation
3. **Immigration Simulation Confirmation** - Sent immediately when booking is created (MANUAL type only)
4. **Immigration Simulation Reminder** - Sent 30 minutes before simulation
5. **Live Session Reminder** - Sent based on user's reminder preference
6. **Test Results** - Sent after test completion
7. **Course Enrollment** - Sent when student enrolls
8. **Welcome Email** - Sent on user registration

### How to Fix

1. **Add SMTP credentials to `.env` file** in `frontend/backend/` directory
2. **Restart the backend server** to load new environment variables
3. **Test email configuration** using:
   ```bash
   # In backend directory
   npm run test:emails
   ```

### Testing Email Configuration

You can test if email is working by:

1. **Using the test endpoint** (if backend is running):
   ```bash
   curl -X POST http://localhost:3001/api/voice-simulation/test-email \
     -H "Content-Type: application/json" \
     -d '{"email": "your-email@gmail.com", "type": "booking"}'
   ```

2. **Using the test script**:
   ```bash
   cd frontend/backend
   npm run test:emails
   ```

### Important Notes

- **Gmail**: Requires an "App Password" (not your regular password)
- **SendGrid**: Requires an API key
- **Email failures are logged** but don't fail the booking process
- **Reminders are processed every minute** by the ReminderSchedulerService
- **Voice simulation reminders** are processed every 5 minutes by cron job

### Next Steps

1. Configure SMTP credentials in `.env`
2. Restart backend
3. Schedule a new simulation to test
4. Check backend logs for email sending status

