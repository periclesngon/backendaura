#!/bin/bash
echo "🧪 Testing Backend Endpoints..."
echo ""
echo "1. Health Check:"
curl -s http://localhost:3001/health | jq -r '.status // "Error"'
echo ""
echo "2. AI Feedbacks Endpoint (requires auth - checking response format):"
curl -s http://localhost:3001/api/ai/feedbacks | jq -r '.error.message // .success // "Error"'
echo ""
echo "3. Marketplace Tutors Endpoint (requires auth - checking response format):"
curl -s http://localhost:3001/api/marketplace/tutors | jq -r '.error.message // .success // "Error"'
echo ""
echo "✅ Endpoint testing complete"
