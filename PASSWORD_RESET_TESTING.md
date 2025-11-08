# Password Reset Endpoints Testing Guide

## Database Setup ✅

The `password_reset_tokens` table has been created in the database using Prisma.

## Endpoints

### 1. Request Password Reset
**POST** `/api/auth/forgot-password`

**Request Body:**
```json
{
  "method": "email",  // or "phone"
  "email": "user@example.com",  // required if method is "email"
  "phone": "+237612345678",  // required if method is "phone"
  "lang": "fr"  // optional: "fr" or "en"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists with this information, a reset code has been sent."
}
```

### 2. Verify Reset Code
**POST** `/api/auth/verify-reset-code`

**Request Body:**
```json
{
  "code": "123456",  // 6-digit code
  "method": "email",  // or "phone"
  "email": "user@example.com",  // required if method is "email"
  "phone": "+237612345678"  // required if method is "phone"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokenId": "clx..."
  },
  "message": "Reset code verified successfully"
}
```

### 3. Reset Password
**POST** `/api/auth/reset-password`

**Request Body:**
```json
{
  "tokenId": "clx...",  // from verify-reset-code response
  "newPassword": "NewSecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

### 4. Resend Reset Code
**POST** `/api/auth/resend-reset-code`

**Request Body:**
```json
{
  "method": "email",  // or "phone"
  "email": "user@example.com",  // required if method is "email"
  "phone": "+237612345678",  // required if method is "phone"
  "lang": "fr"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reset code resent successfully"
}
```

## Testing Methods

### Method 1: Using the Shell Script (Recommended)

```bash
cd frontend/backend
./test-password-reset-simple.sh
```

### Method 2: Using cURL

```bash
# Request reset code
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "your-email@example.com",
    "lang": "fr"
  }'

# Verify code (replace 123456 with actual code from email)
curl -X POST http://localhost:3001/api/auth/verify-reset-code \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456",
    "method": "email",
    "email": "your-email@example.com"
  }'

# Reset password (replace tokenId with actual token from verify response)
curl -X POST http://localhost:3001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "your-token-id",
    "newPassword": "NewPassword123!"
  }'
```

### Method 3: Using TypeScript Test Script

```bash
cd frontend/backend
npx ts-node test-password-reset.ts
```

**Note:** Update `TEST_EMAIL` and `TEST_PHONE` in the test script with real user credentials from your database.

### Method 4: Using Postman or Insomnia

Import the endpoints above and test manually.

## Frontend Testing

1. Navigate to: `http://localhost:3000/mot-de-passe-oublie`
2. Follow the step-by-step process:
   - Step 1: Select recovery method (Email/Phone) and enter credentials
   - Step 2: Enter 6-digit code received via email/SMS
   - Step 3: Enter new password and confirm
   - Step 4: Success confirmation

## Important Notes

1. **Code Expiration**: Reset codes expire after 5 minutes
2. **Rate Limiting**: Resend code has a 60-second cooldown
3. **Security**: 
   - Maximum 5 verification attempts per code
   - Codes are single-use
   - All refresh tokens are invalidated after password reset
4. **Email/SMS**: 
   - Email uses existing EmailService (Twilio SendGrid SMTP)
   - SMS uses TwilioService (requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)

## Troubleshooting

### TypeScript Errors
If you see TypeScript errors about `passwordResetToken` not existing:
1. Run: `npx prisma generate`
2. Restart your TypeScript server in your IDE
3. The errors should resolve automatically

### Database Connection Issues
- Ensure your `.env` file has correct `DATABASE_URL`
- Run: `npx prisma db push` to sync schema

### Email/SMS Not Sending
- Check environment variables for SMTP/Twilio configuration
- Verify email/SMS services are properly configured
- Check server logs for error messages

