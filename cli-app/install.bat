@echo off
setlocal enabledelayedexpansion

REM TCF/TEF CLI Installation Script for Windows
REM This script installs the TCF/TEF CLI application

echo.
echo 🎓 TCF/TEF CLI Installation Script
echo ==================================
echo.

REM Function to print colored output (Windows doesn't support colors easily, so we use plain text)
set "INFO=[INFO]"
set "SUCCESS=[SUCCESS]"
set "WARNING=[WARNING]"
set "ERROR=[ERROR]"

REM Check if Node.js is installed
echo %INFO% Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo %ERROR% Node.js is not installed!
    echo %INFO% Please install Node.js 18.0.0 or higher from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1" %%i in ('node --version') do set NODE_VERSION=%%i
echo %SUCCESS% Node.js %NODE_VERSION% is installed

REM Check if npm is installed
echo %INFO% Checking npm installation...
npm --version >nul 2>&1
if errorlevel 1 (
    echo %ERROR% npm is not installed!
    echo %INFO% Please install npm or use yarn instead
    pause
    exit /b 1
)

for /f "tokens=1" %%i in ('npm --version') do set NPM_VERSION=%%i
echo %SUCCESS% npm %NPM_VERSION% is installed

REM Check if package.json exists
if not exist "package.json" (
    echo %ERROR% package.json not found!
    echo %INFO% Please run this script from the cli-app directory
    pause
    exit /b 1
)

REM Install dependencies
echo %INFO% Installing dependencies...
npm install
if errorlevel 1 (
    echo %ERROR% Failed to install dependencies
    pause
    exit /b 1
)
echo %SUCCESS% Dependencies installed successfully

REM Setup configuration directory
echo %INFO% Setting up configuration...
set CONFIG_DIR=%USERPROFILE%\.tcf-cli
if not exist "%CONFIG_DIR%" (
    mkdir "%CONFIG_DIR%"
    echo %SUCCESS% Configuration directory created at %CONFIG_DIR%
)
echo %INFO% Configuration will be created on first run

REM Ask for global installation
echo.
set /p GLOBAL_INSTALL="Install CLI globally? (y/N): "
if /i "%GLOBAL_INSTALL%"=="y" (
    echo %INFO% Making CLI globally available...
    npm link
    if errorlevel 1 (
        echo %WARNING% Failed to install globally, but local installation is complete
        echo %INFO% You can still use 'node index.js' from this directory
    ) else (
        echo %SUCCESS% CLI installed globally as 'tcf-cli'
        echo %INFO% You can now use 'tcf-cli' command from anywhere
    )
) else (
    echo %INFO% Skipping global installation
    echo %INFO% You can use 'node index.js' from this directory
)

REM Test installation
echo %INFO% Testing installation...
tcf-cli --version >nul 2>&1
if errorlevel 1 (
    echo %INFO% Testing local installation...
    node index.js --version
    if errorlevel 1 (
        echo %ERROR% Installation test failed
        pause
        exit /b 1
    )
    echo %SUCCESS% Local installation test passed
) else (
    echo %SUCCESS% Global installation test passed
    tcf-cli --version
)

REM Create desktop shortcut
set /p CREATE_SHORTCUT="Create desktop shortcut? (y/N): "
if /i "%CREATE_SHORTCUT%"=="y" (
    echo %INFO% Creating desktop shortcut...
    set DESKTOP_DIR=%USERPROFILE%\Desktop
    set SHORTCUT_FILE=%DESKTOP_DIR%\TCF-TEF-CLI.lnk
    set CLI_PATH=%CD%\index.js
    
    REM Create a simple batch file that launches the CLI
    set LAUNCHER_FILE=%CD%\tcf-cli-launcher.bat
    echo @echo off > "%LAUNCHER_FILE%"
    echo cd /d "%CD%" >> "%LAUNCHER_FILE%"
    echo node index.js interactive >> "%LAUNCHER_FILE%"
    echo pause >> "%LAUNCHER_FILE%"
    
    REM Create shortcut using PowerShell
    powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_FILE%'); $Shortcut.TargetPath = '%LAUNCHER_FILE%'; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.Description = 'TCF/TEF CLI - Command Line Interface'; $Shortcut.Save()"
    
    if exist "%SHORTCUT_FILE%" (
        echo %SUCCESS% Desktop shortcut created
    ) else (
        echo %WARNING% Failed to create desktop shortcut
    )
)

echo.
echo %SUCCESS% 🎉 TCF/TEF CLI installation completed!
echo.
echo %INFO% Next steps:
echo   1. Run 'tcf-cli login' or 'node index.js login' to authenticate
echo   2. Use 'tcf-cli interactive' or 'node index.js interactive' for guided usage
echo   3. Check 'tcf-cli --help' or 'node index.js --help' for all commands
echo.
echo %INFO% For help and documentation, see README.md
echo.

REM Check command line arguments
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help
goto :end

:help
echo TCF/TEF CLI Installation Script for Windows
echo.
echo Usage: %0 [OPTIONS]
echo.
echo Options:
echo   --help, -h          Show this help message
echo.
echo This script will:
echo   - Check Node.js and npm installation
echo   - Install CLI dependencies
echo   - Optionally install CLI globally
echo   - Set up configuration directory
echo   - Test the installation
echo   - Optionally create desktop shortcut
echo.
goto :end

:end
pause
