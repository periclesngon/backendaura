# TCF/TEF CLI Application Demo

## 🎯 Complete Terminal-Based Learning Platform

This CLI application provides a complete interface to the TCF/TEF French learning platform, functioning like a real application with full navigation, user management, and all backend functionality.

## 🚀 Quick Start

### Installation
```bash
# Install dependencies
npm install

# Run the application
node index.js app
# OR
node index.js start
# OR
node index.js interactive
```

### Windows Installation Script
```cmd
install.bat
```

### Linux/Mac Installation Script
```bash
chmod +x install.sh
./install.sh
```

## 📱 Application Features

### 🔐 Authentication System
- **Login**: Secure authentication with existing accounts
- **Registration**: Create new student accounts
- **Guest Mode**: Browse courses without authentication
- **Help System**: Comprehensive information about the platform

### 👤 User Management
- **Profile Management**: View and edit user profiles
- **Password Changes**: Secure password updates
- **Progress Tracking**: Detailed learning progress
- **Achievements**: View earned badges and certificates

### 📚 Course System
- **Browse Courses**: View all available courses
- **Search & Filter**: Find courses by level, category, or keywords
- **Course Details**: Comprehensive course information
- **Enrollment**: Enroll in courses with subscription validation
- **My Learning**: Track enrolled and completed courses
- **Progress Monitoring**: Detailed course progress tracking

### 📝 Testing System
- **TCF Tests**: Complete TCF (Test de Connaissance du Français) assessments
- **TEF Tests**: Complete TEF (Test d'Évaluation de Français) assessments
- **Practice Questions**: Level-specific practice exercises
- **Test Results**: Comprehensive results and analytics
- **Progress Reports**: Track improvement over time

### 🎥 Live Sessions
- **Session Browser**: View upcoming live sessions
- **Registration**: Register for live instructor sessions
- **Session History**: Track attended sessions
- **Interactive Features**: Join live sessions with instructors

### 🤖 AI French Tutor
- **Interactive Chat**: Real-time conversation with AI tutor
- **Personalized Learning**: AI-powered study recommendations
- **Practice Generation**: Custom practice questions
- **Study Plans**: AI-generated personalized study plans
- **Chat History**: Review previous conversations

### 💳 Subscription & Billing
- **Subscription Status**: View current subscription details
- **Payment Methods**: Manage payment information
- **Payment History**: View transaction history
- **Invoices**: Download and view invoices
- **Upgrades**: Upgrade subscription tiers
- **Cancellation**: Cancel subscriptions

### 👑 Admin Panel (Admin Users)
- **User Management**: View and manage all users
- **Course Management**: Create, edit, and manage courses
- **Analytics**: Platform usage and performance metrics
- **System Health**: Monitor platform status
- **Manager Creation**: Create and manage manager accounts

### 👥 Manager Panel (Managers)
- **Student Management**: View and manage assigned students
- **Course Oversight**: Manage course assignments
- **Live Session Creation**: Create and schedule live sessions
- **Progress Monitoring**: Track student progress
- **Reporting**: Generate student and course reports

## 🎮 User Experience Features

### 🎨 Beautiful Interface
- **Colored Output**: Chalk-powered colorful terminal interface
- **ASCII Art**: Beautiful welcome screens and headers
- **Progress Indicators**: Ora spinners for loading states
- **Tables**: Well-formatted data display with borders
- **Icons**: Emoji-based navigation and status indicators

### 🧭 Navigation System
- **Menu-Driven**: Intuitive menu navigation
- **Breadcrumbs**: Clear navigation paths
- **Back Navigation**: Easy return to previous menus
- **Exit Options**: Clean application exit

### ⚡ Performance Features
- **Token Management**: Automatic JWT token refresh
- **Error Handling**: Comprehensive error management
- **Retry Logic**: Automatic retry for failed requests
- **Caching**: Configuration and user data caching

## 📊 Role-Based Access Control

### 🎓 Student Features
- Browse and enroll in courses
- Take tests and assessments
- Access AI tutor
- Join live sessions
- Track learning progress
- Manage subscription

### 👨‍💼 Junior Manager Features
- All student features
- View assigned students
- Basic course management
- Session scheduling

### 👨‍💼 Senior Manager Features
- All junior manager features
- Advanced student management
- Course creation and editing
- Advanced analytics

### 👑 Admin Features
- All platform features
- User management
- System administration
- Platform analytics
- Manager creation

## 🔧 Technical Features

### 🌐 Backend Integration
- **RESTful API**: Complete integration with backend APIs
- **Authentication**: JWT-based secure authentication
- **Error Handling**: Comprehensive API error management
- **Data Validation**: Input validation and sanitization

### 💾 Data Management
- **Configuration**: Local configuration storage
- **Token Storage**: Secure token management
- **User Preferences**: Persistent user settings
- **Cache Management**: Efficient data caching

### 🔒 Security Features
- **Secure Authentication**: JWT token-based security
- **Role Validation**: Server-side role verification
- **Input Sanitization**: Protection against injection attacks
- **Session Management**: Secure session handling

## 🎯 Demo Scenarios

### Scenario 1: New User Registration
1. Start application: `node index.js app`
2. Select "Create New Account"
3. Fill in registration details
4. Login with new credentials
5. Browse available courses
6. Enroll in a course

### Scenario 2: Student Learning Journey
1. Login as student
2. View dashboard and progress
3. Browse and enroll in courses
4. Take practice tests
5. Chat with AI tutor
6. Join live sessions

### Scenario 3: Admin Management
1. Login as admin
2. Access admin panel
3. View user analytics
4. Create new courses
5. Manage user accounts
6. Monitor system health

### Scenario 4: Manager Operations
1. Login as manager
2. Access manager panel
3. View assigned students
4. Create live sessions
5. Monitor student progress
6. Generate reports

## 🚀 Getting Started Commands

```bash
# Start the main application
node index.js app

# Quick login (if you have credentials)
node index.js login -e admin@tcftef.com -p AdminTest123!

# View help
node index.js --help

# Check version
node index.js --version

# Browse courses as guest
node index.js courses
```

## 🎉 Success Indicators

When the CLI is working correctly, you should see:
- ✅ Beautiful ASCII art welcome screen
- ✅ Colorful, intuitive menu navigation
- ✅ Smooth authentication flow
- ✅ Real-time data from backend
- ✅ Role-based menu options
- ✅ Interactive AI chat functionality
- ✅ Complete course management
- ✅ Working test system
- ✅ Live session integration
- ✅ Subscription management

## 🔧 Troubleshooting

### Common Issues
1. **Connection Error**: Ensure backend server is running on port 3001
2. **Authentication Failed**: Check credentials and server status
3. **Missing Features**: Verify user role and subscription tier
4. **API Errors**: Check server logs for detailed error information

### Debug Commands
```bash
# Check server status
curl http://localhost:3001/api/health

# Test authentication
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@tcftef.com","password":"AdminTest123!"}'
```

This CLI application provides a complete, production-ready interface to your TCF/TEF learning platform with all the functionality of a modern web application, but in a beautiful terminal interface!
