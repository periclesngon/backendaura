# SendGrid Sender Identity Setup Guide

## Required Information for SendGrid Sender Setup

### 1. **From Name** (Required) ✅
- **Current**: `periclesngon`
- **Recommendation**: Use your platform name
  - `TCF/TEF Learning Platform` or
  - `AURA Learning Platform` or
  - `TCF TEF Platform`

### 2. **From Email Address** (Required) ⚠️
- **What to use**: The email you want emails to appear from
- **Current in .env**: `noreply@tcftef.com`
- **Options**:
  - Use `noreply@tcftef.com` if you own this domain
  - Or use a Gmail/email you own: `noreply@yourdomain.com`
  - **Important**: This email must be verified and you must own the domain

### 3. **Reply To** (Required) ⚠️
- **What to use**: Email where replies should go
- **Recommendation**: 
  - `support@tcftef.com` or
  - `contact@tcftef.com` or
  - Your actual support email

### 4. **Company Address** (Required) ⚠️
- **Physical mailing address** required by CAN-SPAM/CASL laws
- **Must be a real address** where you can receive mail
- Example: `123 Main Street, Suite 100`

### 5. **Company Address Line 2** (Optional)
- Additional address details if needed
- Can leave empty

### 6. **City** (Required) ⚠️
- Your company's city
- Example: `Montreal` or `Toronto`

### 7. **State** (Required if in US/Canada) ⚠️
- Select your state/province
- Required for US and Canada addresses

### 8. **Country** (Required) ⚠️
- Select your country
- This is required

### 9. **Zip Code** (Required) ⚠️
- Postal/ZIP code
- Example: `H1A 1A1` (Canada) or `12345` (US)

### 10. **Nickname** (Required) ⚠️
- Internal name for this sender
- Example: `TCF TEF Platform Sender` or `Main Sender`

---

## Step-by-Step Instructions

### Step 1: Fill Out the Form

Use this information based on your actual business details:

```
From Name: TCF/TEF Learning Platform
From Email Address: noreply@tcftef.com  (or your verified email)
Reply To: support@tcftef.com  (or your support email)
Company Address: [Your actual business address]
Company Address Line 2: [Optional - leave empty if not needed]
City: [Your city]
State: [Select your state/province]
Country: [Select your country]
Zip Code: [Your postal code]
Nickname: TCF TEF Platform Sender
```

### Step 2: Domain Verification

After creating the sender, SendGrid will require:
1. **Domain Verification** - You'll need to add DNS records to your domain
2. **Email Verification** - They'll send a verification email if using a custom domain

### Step 3: Update Your .env File

Once verified, make sure your `.env` matches:

```bash
EMAIL_FROM_NAME=TCF/TEF Learning Platform
EMAIL_FROM_ADDRESS=noreply@tcftef.com  # Must match "From Email Address" above
```

---

## Important Notes

### ⚠️ Legal Requirements
- You MUST include physical mailing address in promotional emails
- Required by CAN-SPAM (US) and CASL (Canada) laws
- SendGrid provides footer templates with this information

### ⚠️ Email Verification
- The "From Email Address" must be verified
- If using `noreply@tcftef.com`, you need to:
  1. Own the domain `tcftef.com`
  2. Add DNS records to verify domain ownership
  3. Or use a Gmail/email you own for testing

### ⚠️ Testing First
If you don't own `tcftef.com` yet, you can:
1. Use your personal Gmail for testing
2. Set up domain later
3. Update sender identity after domain is verified

---

## Quick Setup for Testing

If you want to test quickly without domain setup:

```
From Name: TCF/TEF Learning Platform
From Email Address: your-email@gmail.com  (Use your Gmail)
Reply To: your-email@gmail.com
Company Address: [Your address]
City: [Your city]
State: [Your state]
Country: [Your country]
Zip Code: [Your postal code]
Nickname: Test Sender
```

Then update `.env`:
```bash
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

---

## After Creating Sender

1. **Verify the email** - Check your inbox for verification email
2. **Verify domain** (if using custom domain) - Add DNS records
3. **Test email** - Send a test email to confirm it works
4. **Update .env** - Ensure EMAIL_FROM_ADDRESS matches

---

## Need Help?

- **Domain DNS Setup**: SendGrid will provide specific DNS records
- **Verification Issues**: Check SendGrid dashboard → Settings → Sender Authentication
- **Email Delivery**: Check SendGrid Activity Feed after sending

