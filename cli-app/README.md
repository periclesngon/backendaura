# 🎓 TCF/TEF CLI - Command Line Interface

A comprehensive command-line interface for the TCF/TEF French Language Learning Platform. This CLI provides full access to all platform features including user management, course enrollment, test taking, live sessions, and administrative functions.

## 🚀 Features

### 👤 **User Management**
- User registration and authentication
- Profile management and updates
- Dashboard with personalized statistics
- Password management

### 📚 **Course Management**
- Browse available courses with filtering
- Enroll in courses
- View enrolled courses and progress
- Course search functionality

### 📝 **Testing System**
- Take TCF and TEF tests
- View test results and statistics
- Practice questions by level and category
- Certificate management and downloads

### 🎥 **Live Sessions**
- View upcoming live sessions
- Register for sessions
- Join live sessions
- Session management (for managers)

### 💳 **Payment & Subscriptions**
- View subscription status
- Payment history
- Manage payment methods
- Invoice downloads

### 👑 **Admin Features**
- System dashboard and health monitoring
- User management
- Course administration
- Manager creation and management
- Analytics and reporting

### 👥 **Manager Features**
- Manager dashboard
- Student management
- Course assignment
- Live session creation
- Analytics and reports

## 📦 Installation

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager
- Access to TCF/TEF backend server

### Install Dependencies
```bash
cd cli-app
npm install
```

### Make CLI Globally Available (Optional)
```bash
npm link
```

## 🔧 Configuration

The CLI automatically creates a configuration file at `~/.tcf-cli/config.json` on first run.

### Default Configuration
```json
{
  "apiUrl": "http://localhost:3001/api",
  "timeout": 30000,
  "retries": 3,
  "preferences": {
    "theme": "default",
    "language": "en",
    "pageSize": 10,
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "24h"
  }
}
```

### Environment Variables
You can also configure the CLI using environment variables:
- `TCF_API_URL` - Backend API URL
- `TCF_TIMEOUT` - Request timeout in milliseconds
- `TCF_RETRIES` - Number of retry attempts

## 🎯 Usage

### Basic Commands

#### Authentication
```bash
# Login to your account
node index.js login
node index.js login -e user@example.com -p password

# Register new account
node index.js register

# Logout
node index.js logout
```

#### User Profile
```bash
# View your profile
node index.js profile

# View dashboard
node index.js dashboard
```

#### Courses
```bash
# List all courses
node index.js courses

# Filter courses by level
node index.js courses --level B1

# Filter by category
node index.js courses --category GRAMMAR

# View enrolled courses
node index.js my-courses

# Enroll in a course
node index.js enroll <courseId>
```

#### Interactive Mode
```bash
# Start interactive mode (recommended for beginners)
node index.js interactive
# or
node index.js i
```

### Advanced Usage

#### Admin Commands (Admin role required)
```bash
# Access admin panel through interactive mode
node index.js interactive
# Then select "Admin Panel"
```

#### Manager Commands (Manager role required)
```bash
# Access manager panel through interactive mode
node index.js interactive
# Then select "Manager Panel"
```

#### Testing
```bash
# Access test menu through interactive mode
node index.js interactive
# Then select "Take Test"
```

## 🎨 Interactive Mode

The interactive mode provides a user-friendly menu-driven interface:

```
🚀 Starting interactive mode...

? What would you like to do? (Use arrow keys)
❯ 👤 View Profile
  📊 View Dashboard
  📚 Browse Courses
  🎓 My Courses
  💳 Subscription Status
  📈 Take Test
  🎥 Live Sessions
  ⚙️  Admin Panel
  👥 Manager Panel
  🚪 Exit
```

## 📊 Output Formats

The CLI provides beautifully formatted output using:
- **Tables** for structured data
- **Colors** for status indicators
- **Icons** for visual clarity
- **Progress indicators** for long operations

### Example Output
```
👤 User Profile
──────────────────────────────────────────────────
┌─────────────────┬──────────────────────────────┐
│            Name │ John Doe                     │
│           Email │ john.doe@example.com         │
│            Role │ 👨‍🎓 Student                  │
│    Subscription │ 💎 Premium                   │
│         Country │ France                       │
│    Member Since │ January 15th, 2024           │
│      Last Login │ 2 hours ago                  │
└─────────────────┴──────────────────────────────┘
```

## 🔐 Authentication

The CLI handles authentication automatically:
- Stores JWT tokens securely in local config
- Automatic token refresh
- Session management
- Role-based access control

## 🛠️ Configuration Management

### View Current Configuration
```bash
# Configuration is stored at ~/.tcf-cli/config.json
cat ~/.tcf-cli/config.json
```

### Change API URL
```javascript
// The CLI will prompt for API URL on first run
// Or modify the config file directly
```

### Reset Configuration
```bash
# Delete the config directory to reset
rm -rf ~/.tcf-cli
```

## 🎯 Role-Based Features

### 👨‍🎓 Student Features
- Course browsing and enrollment
- Test taking and results
- Live session participation
- Progress tracking

### 👨‍💼 Manager Features (Junior/Senior)
- Student management
- Course creation and management
- Live session hosting
- Analytics and reporting

### 👑 Admin Features
- Full system administration
- User and manager management
- System health monitoring
- Business analytics

## 🔧 Troubleshooting

### Common Issues

#### Connection Errors
```bash
# Check if backend server is running
curl http://localhost:3001/health

# Verify API URL in config
cat ~/.tcf-cli/config.json
```

#### Authentication Issues
```bash
# Clear authentication and login again
node index.js logout
node index.js login
```

#### Permission Errors
```bash
# Ensure you have the correct role for the operation
node index.js profile  # Check your role
```

### Debug Mode
Set `DEBUG=1` environment variable for verbose logging:
```bash
DEBUG=1 node index.js login
```

## 📚 API Integration

The CLI integrates with all backend endpoints:
- Authentication: `/api/auth/*`
- Users: `/api/users/*`
- Courses: `/api/courses/*`
- Tests: `/api/tests/*`
- Live Sessions: `/api/live-sessions/*`
- Payments: `/api/payments/*`
- Admin: `/api/admin/*`
- Manager: `/api/manager/*`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Check the troubleshooting section
- Review the backend API documentation
- Contact the development team

---

**🎉 Enjoy using the TCF/TEF CLI! Happy learning! 🚀**
