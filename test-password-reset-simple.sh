#!/bin/bash

# Simple test script for password reset endpoints
# Usage: ./test-password-reset-simple.sh

BASE_URL="${BACKEND_URL:-http://localhost:3001}"
API_URL="${BASE_URL}/api/auth"

echo "🚀 Testing Password Reset Endpoints"
echo "📍 Base URL: ${API_URL}"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Request password reset via email
echo "Test 1: Request password reset via email"
RESPONSE=$(curl -s -X POST "${API_URL}/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "test@example.com",
    "lang": "fr"
  }')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ PASSED${NC}"
else
  echo -e "${RED}❌ FAILED${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 2: Request password reset via phone
echo "Test 2: Request password reset via phone"
RESPONSE=$(curl -s -X POST "${API_URL}/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "phone",
    "phone": "+237612345678",
    "lang": "fr"
  }')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ PASSED${NC}"
else
  echo -e "${RED}❌ FAILED${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 3: Verify reset code (expected to fail with invalid code)
echo "Test 3: Verify reset code (invalid code - expected to fail)"
RESPONSE=$(curl -s -X POST "${API_URL}/verify-reset-code" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000000",
    "method": "email",
    "email": "test@example.com"
  }')

if echo "$RESPONSE" | grep -q '"success":false'; then
  echo -e "${GREEN}✅ PASSED (correctly rejected invalid code)${NC}"
else
  echo -e "${YELLOW}⚠️  Unexpected response${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 4: Resend reset code
echo "Test 4: Resend reset code"
RESPONSE=$(curl -s -X POST "${API_URL}/resend-reset-code" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "test@example.com",
    "lang": "fr"
  }')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ PASSED${NC}"
else
  echo -e "${RED}❌ FAILED${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 5: Validation error (missing method)
echo "Test 5: Validation error (missing method - expected to fail)"
RESPONSE=$(curl -s -X POST "${API_URL}/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }')

if echo "$RESPONSE" | grep -q '"success":false'; then
  echo -e "${GREEN}✅ PASSED (correctly rejected invalid request)${NC}"
else
  echo -e "${YELLOW}⚠️  Unexpected response${NC}"
fi
echo "Response: $RESPONSE"
echo ""

echo "✅ Tests completed!"
echo ""
echo "💡 Note: Some failures are expected (invalid codes, validation errors)"
echo "   These confirm that validation and security checks are working."

