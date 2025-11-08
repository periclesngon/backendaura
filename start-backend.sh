#!/bin/bash

# ============================================================================
# AURA.CA BACKEND STARTUP SCRIPT
# Reliable backend startup with health checks and proper error handling
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=${PORT:-3001}
NODE_ENV=${NODE_ENV:-development}
LOG_FILE="${BACKEND_DIR}/backend.log"
PID_FILE="${BACKEND_DIR}/.backend.pid"
MAX_RETRIES=5
RETRY_DELAY=2

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
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

# Check if backend is already running
check_existing_process() {
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            print_warning "Backend already running with PID $OLD_PID"
            print_info "Killing existing process..."
            kill -9 "$OLD_PID" 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Check port availability
check_port() {
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_error "Port $PORT is already in use"
        print_info "Killing process on port $PORT..."
        lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

# Check dependencies
check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_success "Node.js found: $(node --version)"
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm found: $(npm --version)"
}

# Install dependencies if needed
install_dependencies() {
    if [ ! -d "$BACKEND_DIR/node_modules" ]; then
        print_info "Installing dependencies..."
        cd "$BACKEND_DIR"
        npm install
        print_success "Dependencies installed"
    fi
}

# Check environment variables
check_environment() {
    print_info "Checking environment variables..."
    
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        print_warning ".env file not found"
        print_info "Creating .env from .env.example if available..."
        if [ -f "$BACKEND_DIR/.env.example" ]; then
            cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
            print_success ".env created from .env.example"
        else
            print_warning "No .env.example found, using defaults"
        fi
    else
        print_success ".env file found"
    fi
}

# Health check function
health_check() {
    local attempt=1
    local max_attempts=30
    
    print_info "Performing health check..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
            print_success "Backend is healthy!"
            return 0
        fi
        
        print_info "Health check attempt $attempt/$max_attempts..."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_error "Backend health check failed after $max_attempts attempts"
    return 1
}

# Start backend
start_backend() {
    print_header "Starting Backend Server"
    
    cd "$BACKEND_DIR"
    
    print_info "Starting Node.js server on port $PORT..."
    print_info "Environment: $NODE_ENV"
    print_info "Logs: $LOG_FILE"
    
    # Start backend in background with logging
    NODE_ENV=$NODE_ENV npm run dev > "$LOG_FILE" 2>&1 &
    BACKEND_PID=$!
    
    # Save PID
    echo $BACKEND_PID > "$PID_FILE"
    
    print_success "Backend process started with PID $BACKEND_PID"
    
    # Wait a moment for startup
    sleep 3
    
    # Check if process is still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        print_error "Backend process died immediately"
        print_error "Last 20 lines of log:"
        tail -20 "$LOG_FILE"
        exit 1
    fi
    
    print_success "Backend process is running"
}

# Main execution
main() {
    print_header "AURA.CA Backend Startup"
    
    # Pre-startup checks
    check_dependencies
    check_existing_process
    check_port
    check_environment
    install_dependencies
    
    # Start backend
    start_backend
    
    # Health check
    if health_check; then
        print_header "Backend Ready"
        print_success "Backend is running on http://localhost:$PORT"
        print_success "API Documentation: http://localhost:$PORT/api-docs"
        print_success "Health Check: http://localhost:$PORT/health"
        print_info "Logs: $LOG_FILE"
        print_info "PID: $BACKEND_PID"
        
        # Keep script running and monitor backend
        print_info "Monitoring backend process..."
        while kill -0 $BACKEND_PID 2>/dev/null; do
            sleep 5
        done
        
        print_error "Backend process died"
        print_error "Last 50 lines of log:"
        tail -50 "$LOG_FILE"
        exit 1
    else
        print_error "Backend failed to start"
        print_error "Last 50 lines of log:"
        tail -50 "$LOG_FILE"
        exit 1
    fi
}

# Run main function
main "$@"

