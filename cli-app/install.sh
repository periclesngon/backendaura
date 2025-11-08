#!/bin/bash

# TCF/TEF CLI Installation Script
# This script installs the TCF/TEF CLI application

set -e

echo "🎓 TCF/TEF CLI Installation Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
check_nodejs() {
    print_status "Checking Node.js installation..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        print_status "Please install Node.js 18.0.0 or higher from https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        print_error "Node.js version $NODE_VERSION is too old!"
        print_status "Please upgrade to Node.js 18.0.0 or higher"
        exit 1
    fi
    
    print_success "Node.js $NODE_VERSION is installed"
}

# Check if npm is installed
check_npm() {
    print_status "Checking npm installation..."
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        print_status "Please install npm or use yarn instead"
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_success "npm $NPM_VERSION is installed"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    if [ -f "package.json" ]; then
        npm install
        print_success "Dependencies installed successfully"
    else
        print_error "package.json not found!"
        print_status "Please run this script from the cli-app directory"
        exit 1
    fi
}

# Make CLI globally available
install_globally() {
    print_status "Making CLI globally available..."
    
    # Make the main script executable
    chmod +x index.js
    
    # Create global link
    if npm link; then
        print_success "CLI installed globally as 'tcf-cli'"
        print_status "You can now use 'tcf-cli' command from anywhere"
    else
        print_warning "Failed to install globally, but local installation is complete"
        print_status "You can still use 'node index.js' from this directory"
    fi
}

# Create desktop shortcut (optional)
create_shortcut() {
    if [ "$1" = "--with-shortcut" ]; then
        print_status "Creating desktop shortcut..."
        
        DESKTOP_DIR="$HOME/Desktop"
        if [ -d "$DESKTOP_DIR" ]; then
            SHORTCUT_FILE="$DESKTOP_DIR/TCF-TEF-CLI.desktop"
            CLI_PATH="$(pwd)/index.js"
            
            cat > "$SHORTCUT_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=TCF/TEF CLI
Comment=Command Line Interface for TCF/TEF Learning Platform
Exec=gnome-terminal -- node "$CLI_PATH" interactive
Icon=utilities-terminal
Terminal=false
Categories=Education;
EOF
            
            chmod +x "$SHORTCUT_FILE"
            print_success "Desktop shortcut created"
        else
            print_warning "Desktop directory not found, skipping shortcut creation"
        fi
    fi
}

# Test installation
test_installation() {
    print_status "Testing installation..."
    
    if command -v tcf-cli &> /dev/null; then
        print_success "Global installation test passed"
        tcf-cli --version
    else
        print_status "Testing local installation..."
        if node index.js --version; then
            print_success "Local installation test passed"
        else
            print_error "Installation test failed"
            exit 1
        fi
    fi
}

# Setup configuration
setup_config() {
    print_status "Setting up configuration..."
    
    # The CLI will create config on first run, but we can set defaults
    CONFIG_DIR="$HOME/.tcf-cli"
    
    if [ ! -d "$CONFIG_DIR" ]; then
        mkdir -p "$CONFIG_DIR"
        print_success "Configuration directory created at $CONFIG_DIR"
    fi
    
    print_status "Configuration will be created on first run"
}

# Main installation process
main() {
    echo ""
    print_status "Starting TCF/TEF CLI installation..."
    echo ""
    
    # Check prerequisites
    check_nodejs
    check_npm
    
    # Install
    install_dependencies
    setup_config
    
    # Optional global installation
    read -p "Install CLI globally? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_globally
    else
        print_status "Skipping global installation"
        print_status "You can use 'node index.js' from this directory"
    fi
    
    # Create shortcut if requested
    create_shortcut "$1"
    
    # Test installation
    test_installation
    
    echo ""
    print_success "🎉 TCF/TEF CLI installation completed!"
    echo ""
    print_status "Next steps:"
    echo "  1. Run 'tcf-cli login' or 'node index.js login' to authenticate"
    echo "  2. Use 'tcf-cli interactive' or 'node index.js interactive' for guided usage"
    echo "  3. Check 'tcf-cli --help' or 'node index.js --help' for all commands"
    echo ""
    print_status "For help and documentation, see README.md"
    echo ""
}

# Handle command line arguments
case "$1" in
    --help|-h)
        echo "TCF/TEF CLI Installation Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h          Show this help message"
        echo "  --with-shortcut     Create desktop shortcut (Linux only)"
        echo ""
        echo "This script will:"
        echo "  - Check Node.js and npm installation"
        echo "  - Install CLI dependencies"
        echo "  - Optionally install CLI globally"
        echo "  - Set up configuration directory"
        echo "  - Test the installation"
        echo ""
        exit 0
        ;;
    *)
        main "$1"
        ;;
esac
