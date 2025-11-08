#!/bin/bash

echo "========================================"
echo "  TCF/TEF Learning Platform Startup"
echo "========================================"
echo

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "Port $1 is already in use"
        return 1
    else
        return 0
    fi
}

# Check if ports are available
if ! check_port 3001; then
    echo "Backend port 3001 is already in use. Please stop the existing process."
    exit 1
fi

if ! check_port 3000; then
    echo "Frontend port 3000 is already in use. Please stop the existing process."
    exit 1
fi

echo "Starting Backend Server..."
cd "$(dirname "$0")"
npm run dev &
BACKEND_PID=$!

echo "Waiting for backend to start..."
sleep 5

echo "Starting Frontend Application..."
cd "ai-model-performance-scale (2)"
npm run dev &
FRONTEND_PID=$!

echo
echo "========================================"
echo "  Platform Started Successfully!"
echo "========================================"
echo
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo "API Test: http://localhost:3000/api-test"
echo
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo
echo "Press Ctrl+C to stop both servers"
echo "========================================"

# Function to cleanup on exit
cleanup() {
    echo
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "Servers stopped."
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup INT TERM

# Wait for both processes
wait
