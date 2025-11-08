# Twilio Quick Reference Card

## 🎯 For SMS Password Reset - Required Variables

Add these **3 variables** to your `.env` file:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+237612345678
```

## 📍 Where to Get Each Value

| Variable | Where to Find |
|----------|---------------|
| `TWILIO_ACCOUNT_SID` | Twilio Console Dashboard → Account SID (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Twilio Console Dashboard → Auth Token (click "Show") |
| `TWILIO_PHONE_NUMBER` | Twilio Console → Phone Numbers → Buy a number → Copy in E.164 format |

## 🔗 Quick Links

- **Sign Up**: https://www.twilio.com/try-twilio
- **Console**: https://console.twilio.com/
- **Buy Number**: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming

## ✅ Format Requirements

- **Account SID**: Starts with `AC`, 34 characters
- **Auth Token**: 32 characters, alphanumeric
- **Phone Number**: E.164 format (e.g., `+237612345678`)

## 🧪 Quick Test

After adding variables, restart backend and test:

```bash
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"method":"phone","phone":"+237612345678","lang":"fr"}'
```

---

**Full guide**: See `TWILIO_SETUP_GUIDE.md` for detailed instructions.

