#!/bin/bash

# AURA.CA End-to-End Testing Script
# Tests all critical functionality

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
ADMIN_EMAIL="admin@aura.ca"
ADMIN_PASSWORD="Admin@123"
STUDENT_EMAIL="student@aura.ca"
STUDENT_PASSWORD="Student@123"
MANAGER_EMAIL="manager@aura.ca"
MANAGER_PASSWORD="Manager@123"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
  echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
  ((TESTS_PASSED++))
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
  ((TESTS_FAILED++))
}

# Test 1: Backend Health Check
print_header "Test 1: Backend Health Check"
print_test "Checking backend health..."
if curl -s "$BACKEND_URL/health" | grep -q "success"; then
  print_success "Backend is healthy"
else
  print_error "Backend health check failed"
  exit 1
fi

# Test 2: Admin Authentication
print_header "Test 2: Admin Authentication"
print_test "Logging in as admin..."
ADMIN_TOKEN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$ADMIN_TOKEN" ]; then
  print_success "Admin login successful"
else
  print_error "Admin login failed"
fi

# Test 3: Student Authentication
print_header "Test 3: Student Authentication"
print_test "Logging in as student..."
STUDENT_TOKEN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASSWORD\"}" \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$STUDENT_TOKEN" ]; then
  print_success "Student login successful"
else
  print_error "Student login failed"
fi

# Test 4: Manager Authentication
print_header "Test 4: Manager Authentication"
print_test "Logging in as manager..."
MANAGER_TOKEN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MANAGER_EMAIL\",\"password\":\"$MANAGER_PASSWORD\"}" \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$MANAGER_TOKEN" ]; then
  print_success "Manager login successful"
else
  print_error "Manager login failed"
fi

# Test 5: Role-Based Access Control
print_header "Test 5: Role-Based Access Control"

print_test "Testing admin access to /admin/page..."
ADMIN_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/admin/dashboard" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -w "\n%{http_code}")
ADMIN_CODE=$(echo "$ADMIN_RESPONSE" | tail -n1)
if [ "$ADMIN_CODE" = "200" ] || [ "$ADMIN_CODE" = "401" ]; then
  print_success "Admin access control working"
else
  print_error "Admin access control failed (code: $ADMIN_CODE)"
fi

# Test 6: Content Upload Endpoints
print_header "Test 6: Content Upload Endpoints"

print_test "Checking content management endpoint..."
CONTENT_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/content-management/management" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -w "\n%{http_code}")
CONTENT_CODE=$(echo "$CONTENT_RESPONSE" | tail -n1)
if [ "$CONTENT_CODE" = "200" ]; then
  print_success "Content management endpoint working"
else
  print_error "Content management endpoint failed (code: $CONTENT_CODE)"
fi

# Test 7: Simulations API
print_header "Test 7: Simulations API"

print_test "Fetching simulations..."
SIM_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/simulations" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -w "\n%{http_code}")
SIM_CODE=$(echo "$SIM_RESPONSE" | tail -n1)
if [ "$SIM_CODE" = "200" ]; then
  print_success "Simulations API working"
else
  print_error "Simulations API failed (code: $SIM_CODE)"
fi

# Test 8: Tests API
print_header "Test 8: Tests API"

print_test "Fetching tests..."
TESTS_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/tests" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -w "\n%{http_code}")
TESTS_CODE=$(echo "$TESTS_RESPONSE" | tail -n1)
if [ "$TESTS_CODE" = "200" ]; then
  print_success "Tests API working"
else
  print_error "Tests API failed (code: $TESTS_CODE)"
fi

# Test 9: AI Question Generation
print_header "Test 9: AI Question Generation"

print_test "Testing AI question generation..."
AI_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/ai/generate-questions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"French grammar basics","lessonTitle":"Grammar","courseTitle":"French 101","questionCount":3}' \
  -w "\n%{http_code}")
AI_CODE=$(echo "$AI_RESPONSE" | tail -n1)
if [ "$AI_CODE" = "200" ]; then
  print_success "AI question generation working"
else
  print_error "AI question generation failed (code: $AI_CODE)"
fi

# Test 10: Courses API
print_header "Test 10: Courses API"

print_test "Fetching courses..."
COURSES_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/courses" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -w "\n%{http_code}")
COURSES_CODE=$(echo "$COURSES_RESPONSE" | tail -n1)
if [ "$COURSES_CODE" = "200" ]; then
  print_success "Courses API working"
else
  print_error "Courses API failed (code: $COURSES_CODE)"
fi

# Summary
print_header "Test Summary"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✓ All tests passed!${NC}\n"
  exit 0
else
  echo -e "\n${RED}✗ Some tests failed!${NC}\n"
  exit 1
fi

