#!/bin/bash

# ============================================================================
# AURA.CA BACKEND TESTING SCRIPT
# Comprehensive backend testing with role-based access control verification
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="http://localhost:3001/api"
HEALTH_URL="http://localhost:3001/health"

# Test data
ADMIN_EMAIL="admin@aura.ca"
ADMIN_PASSWORD="Admin@123"
STUDENT_EMAIL="student@aura.ca"
STUDENT_PASSWORD="Student@123"
MANAGER_EMAIL="manager@aura.ca"
MANAGER_PASSWORD="Manager@123"

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check backend health
check_health() {
    print_header "Checking Backend Health"
    
    if curl -s "$HEALTH_URL" > /dev/null 2>&1; then
        print_success "Backend is running"
        
        # Get detailed health
        HEALTH=$(curl -s "$HEALTH_URL/detailed")
        echo "$HEALTH" | jq '.'
    else
        print_error "Backend is not running on $HEALTH_URL"
        exit 1
    fi
}

# Test authentication
test_authentication() {
    print_header "Testing Authentication"
    
    # Test admin login
    print_info "Testing admin login..."
    ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
    
    ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.data.token' 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
        print_warning "Admin login failed or user doesn't exist"
        echo "$ADMIN_RESPONSE" | jq '.'
    else
        print_success "Admin login successful"
        echo "Token: ${ADMIN_TOKEN:0:20}..."
    fi
    
    # Test student login
    print_info "Testing student login..."
    STUDENT_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASSWORD\"}")
    
    STUDENT_TOKEN=$(echo "$STUDENT_RESPONSE" | jq -r '.data.token' 2>/dev/null || echo "")
    
    if [ -z "$STUDENT_TOKEN" ] || [ "$STUDENT_TOKEN" = "null" ]; then
        print_warning "Student login failed or user doesn't exist"
        echo "$STUDENT_RESPONSE" | jq '.'
    else
        print_success "Student login successful"
        echo "Token: ${STUDENT_TOKEN:0:20}..."
    fi
}

# Test role-based access
test_rbac() {
    print_header "Testing Role-Based Access Control"
    
    # Get tokens first
    ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
    
    ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.data.token' 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
        print_warning "Cannot test RBAC - admin login failed"
        return
    fi
    
    # Test admin accessing admin routes
    print_info "Testing admin accessing /api/admin/users..."
    ADMIN_USERS=$(curl -s -X GET "$API_URL/admin/users" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$ADMIN_USERS" | jq -e '.success' > /dev/null 2>&1; then
        print_success "Admin can access admin routes"
    else
        print_warning "Admin access to admin routes failed"
        echo "$ADMIN_USERS" | jq '.'
    fi
}

# Test content upload
test_content_upload() {
    print_header "Testing Content Upload"
    
    # Get admin token
    ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
    
    ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.data.token' 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
        print_warning "Cannot test content upload - admin login failed"
        return
    fi
    
    # Create test file
    TEST_FILE="/tmp/test-content.txt"
    echo "This is test content for upload" > "$TEST_FILE"
    
    print_info "Testing content upload..."
    UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/content-management/upload" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -F "file=@$TEST_FILE" \
        -F "title=Test Content" \
        -F "description=Test Description" \
        -F "level=A1" \
        -F "category=GRAMMAR" \
        -F "subscriptionTier=FREE" \
        -F "contentType=NOTE")
    
    if echo "$UPLOAD_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        print_success "Content upload successful"
        echo "$UPLOAD_RESPONSE" | jq '.data'
    else
        print_warning "Content upload failed"
        echo "$UPLOAD_RESPONSE" | jq '.'
    fi
    
    rm -f "$TEST_FILE"
}

# Test API endpoints
test_endpoints() {
    print_header "Testing API Endpoints"
    
    # Get admin token
    ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
    
    ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.data.token' 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
        print_warning "Cannot test endpoints - admin login failed"
        return
    fi
    
    # Test various endpoints
    ENDPOINTS=(
        "GET /api/courses"
        "GET /api/tests"
        "GET /api/subscriptions/plans"
        "GET /api/admin/users"
    )
    
    for endpoint in "${ENDPOINTS[@]}"; do
        METHOD=$(echo "$endpoint" | cut -d' ' -f1)
        PATH=$(echo "$endpoint" | cut -d' ' -f2)
        
        print_info "Testing $endpoint..."
        RESPONSE=$(curl -s -X "$METHOD" "$API_URL$PATH" \
            -H "Authorization: Bearer $ADMIN_TOKEN")
        
        if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
            print_success "$endpoint works"
        else
            print_warning "$endpoint returned: $(echo "$RESPONSE" | jq -r '.error.message' 2>/dev/null || echo 'Unknown error')"
        fi
    done
}

# Main execution
main() {
    print_header "AURA.CA Backend Testing Suite"
    
    check_health
    test_authentication
    test_rbac
    test_content_upload
    test_endpoints
    
    print_header "Testing Complete"
    print_success "All tests completed"
}

main "$@"

