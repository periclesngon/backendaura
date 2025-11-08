@echo off
echo ========================================
echo   TCF/TEF Learning Platform Startup
echo ========================================
echo.

echo Starting Backend Server...
start "Backend Server" cmd /k "cd /d %~dp0 && npm run dev"

echo Waiting for backend to start...
timeout /t 5 /nobreak > nul

echo Starting Frontend Application...
start "Frontend App" cmd /k "cd /d %~dp0ai-model-performance-scale (2) && npm run dev"

echo.
echo ========================================
echo   Platform Starting...
echo ========================================
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:3000
echo API Test: http://localhost:3000/api-test
echo.
echo Both servers are starting in separate windows.
echo Close this window when you're done.
echo ========================================

pause
