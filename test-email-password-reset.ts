/**
 * Test script for email password reset functionality
 * Run with: npx ts-node test-email-password-reset.ts
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';

async function testEmailConfiguration() {
  console.log('🧪 Testing Email Configuration for Password Reset\n');

  // Check environment variables
  const smtpHost = process.env.TWILIO_SMTP_HOST || process.env.SMTP_HOST;
  const smtpPort = process.env.TWILIO_SMTP_PORT || process.env.SMTP_PORT;
  const smtpUser = process.env.TWILIO_SMTP_USER || process.env.SMTP_USER;
  const smtpPass = process.env.TWILIO_SMTP_PASS || process.env.SMTP_PASS;

  console.log('📋 Configuration Check:');
  console.log(`   SMTP Host: ${smtpHost || '❌ NOT SET'}`);
  console.log(`   SMTP Port: ${smtpPort || '❌ NOT SET'}`);
  console.log(`   SMTP User: ${smtpUser || '❌ NOT SET'}`);
  console.log(`   SMTP Pass: ${smtpPass ? `${smtpPass.substring(0, 10)}...` : '❌ NOT SET'}`);
  console.log('');

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    console.error('❌ Missing required SMTP configuration');
    process.exit(1);
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: smtpPort === '465',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  // Test 1: Verify SMTP connection
  console.log('🔍 Test 1: Verifying SMTP Connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
  } catch (error: any) {
    console.error('❌ SMTP connection failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check if your SendGrid API key is valid');
    console.error('   2. Verify the API key has "Mail Send" permissions');
    console.error('   3. Check if the API key was revoked or expired');
    console.error('   4. See SENDGRID_API_KEY_FIX.md for detailed instructions');
    process.exit(1);
  }

  // Test 2: Send test email
  console.log('📧 Test 2: Sending Test Password Reset Email...');
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  const testCode = '123456';

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM_ADDRESS || 'noreply@tcftef.com',
      to: testEmail,
      subject: 'Test: AURA.CA Password Reset Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .code-box { 
              background: #2ECC71; 
              color: white; 
              font-size: 32px; 
              font-weight: bold; 
              text-align: center; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 20px 0;
              letter-spacing: 8px;
            }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Test: Password Reset Code</h1>
            <p>This is a test email to verify email configuration.</p>
            <p>Your password reset code is:</p>
            <div class="code-box">${testCode}</div>
            <div class="warning">
              <strong>⚠️ This is a test email.</strong> The code above is for testing purposes only.
            </div>
            <p>If you received this email, your email configuration is working correctly!</p>
          </div>
        </body>
        </html>
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   To: ${testEmail}`);
    console.log('\n📬 Check your email inbox for the test message.');
    console.log('   If you don\'t see it, check your spam folder.\n');
  } catch (error: any) {
    console.error('❌ Failed to send test email:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Verify the recipient email address is valid');
    console.error('   2. Check SendGrid dashboard for delivery status');
    console.error('   3. Verify sender email is verified in SendGrid');
    process.exit(1);
  }

  console.log('✅ All email tests passed!');
  console.log('\n🎉 Email password reset functionality is ready to use!');
}

// Run tests
testEmailConfiguration().catch(console.error);

