# CS Test Automation Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![BDD](https://img.shields.io/badge/BDD-Cucumber-00A818?style=for-the-badge&logo=cucumber&logoColor=white)](https://cucumber.io/)

> **Enterprise-grade Zero-Code BDD Test Automation Framework**

A comprehensive, TypeScript-based test automation framework that enables **zero-code testing** through BDD (Behavior-Driven Development) with built-in support for **UI**, **API**, and **Database** testing. Features advanced reporting, Azure DevOps integration, and enterprise-level configurability.

## 🚀 Key Features

### 🎯 **Zero-Code Testing**
- **BDD/Gherkin Support**: Write tests in natural language using Gherkin syntax
- **Pre-built Step Definitions**: Comprehensive library covering UI, API, and Database operations
- **Data-Driven Testing**: Advanced support for JSON, Excel, CSV, and XML with intelligent column normalization
- **Dynamic Configuration**: Environment-based configuration management

### 🧠 **AI-Powered Capabilities** *(In Progress)*
- **Self-Healing**: Automatic element identification and recovery from locator failures
- **Smart Element Detection**: AI-driven element identification using multiple strategies
- **Visual Recognition**: Computer vision-based element detection
- **Natural Language Processing**: Convert natural language to executable test steps
> *Note: AI features are currently under development and testing*

### 🔧 **Multi-Domain Testing**
- **UI Testing**: Web automation with Playwright across all major browsers
- **API Testing**: REST/GraphQL API testing with comprehensive validation
- **Database Testing**: Support for SQL Server, MySQL, PostgreSQL, MongoDB, Oracle, Redis
- **Cross-Platform**: Windows, macOS, and Linux support
- **Cross-Domain Navigation**: Automatic handling of SSO, NetScaler, and multi-domain authentication flows

### 📊 **Advanced Reporting & Analytics**
- **Multi-Format Reports**: HTML, PDF, Excel, and JSON export
- **Interactive Dashboards**: Real-time execution monitoring with charts
- **Comprehensive Action Logging**: Every UI action is logged with verbose descriptions
- **Verification Logging**: All assertions and validations logged with expected vs actual values
- **Navigation Tracking**: Detailed logging of page navigations, waits, and load states
- **Console Log Capture**: All terminal output captured and categorized
- **Evidence Collection**: Screenshots, videos, network logs, and traces

### 🔗 **Enterprise Integration**
- **Azure DevOps**: Comprehensive test management with automatic result publishing
- **CI/CD Pipeline Support**: Jenkins, GitHub Actions, Azure Pipelines
- **Version Control**: Git integration with branch-based testing
- **Security**: Built-in encryption for sensitive data

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: For version control
- **Browsers**: Latest versions of Chrome, Firefox, Safari, or Edge

## 🛠️ Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd Playwright_typescript_for_cursor_trail3
```

2. **Install dependencies**:
```bash
npm install
```

3. **Install Playwright browsers**:
```bash
npx playwright install
```

4. **Configure environment settings** in the `config` directory as needed.

## 📁 Project Structure

```
├── src/                        # Framework source code
│   ├── core/                   # Core framework components
│   │   ├── browser/           # Browser management
│   │   ├── elements/          # Element handling & locators
│   │   ├── pages/             # Base page objects
│   │   ├── navigation/        # Cross-domain navigation handling
│   │   └── ai/                # AI-powered features (in progress)
│   ├── api/                    # API testing utilities
│   │   ├── client/            # HTTP client implementation
│   │   ├── auth/              # Authentication handlers
│   │   └── validators/        # Response validators
│   ├── bdd/                    # BDD/Cucumber implementation
│   │   ├── runner/            # Test runner
│   │   ├── parser/            # Gherkin parser
│   │   └── hooks/             # Lifecycle hooks
│   ├── data/                   # Data providers and handlers
│   │   ├── providers/         # Data provider implementations
│   │   ├── handlers/          # File format handlers
│   │   └── utils/             # Column normalizer & utilities
│   ├── database/               # Database adapters
│   │   └── adapters/          # DB-specific implementations
│   ├── reporting/              # Report generators
│   │   ├── generators/        # Report format generators
│   │   └── collectors/        # Evidence collectors
│   └── steps/                  # Step definitions
│       ├── ui/                # UI step definitions
│       ├── api/               # API step definitions
│       └── database/          # Database step definitions
├── test/                       # Test projects
│   ├── akhan/                 # Sample test project
│   │   ├── features/          # Feature files
│   │   ├── pages/             # Page objects
│   │   ├── steps/             # Project-specific steps
│   │   └── data/              # Test data files
│   └── api/                   # API test examples
├── config/                     # Configuration files
│   ├── global.env             # Global settings
│   ├── common/                # Common configurations
│   └── <project>/             # Project-specific configs
└── reports/                    # Generated test reports
```

## ⚙️ Configuration

### Hierarchical Configuration System

The framework uses a powerful hierarchical configuration system:

```
1. Global (config/global.env) → Base defaults
2. Project Common (config/{project}/common/) → Project overrides  
3. Environment (config/{project}/environments/*.env) → Environment-specific
4. Runtime (CLI/tags) → Highest priority
```

### Global Configuration (`config/global.env`)
```properties
# Browser Configuration
BROWSER=chromium
HEADLESS=false
BROWSER_TIMEOUT=30000

# Test Execution
PARALLEL_WORKERS=4
RETRY_COUNT=2
FAIL_FAST=false

# Reporting
REPORT_FORMATS=html,pdf,excel
SCREENSHOT_MODE=on-failure
VIDEO_MODE=on-failure

# Data Providers
EXECUTION_FLAG_COLUMN=ExecutionFlag
SKIP_EXECUTION_FLAG=false

# Performance Monitoring
COLLECT_WEB_VITALS=true
COLLECT_SYSTEM_METRICS=true
PERFORMANCE_BUDGET_LCP=2500
PERFORMANCE_BUDGET_FID=100
PERFORMANCE_BUDGET_CLS=0.1

# Network & Proxy
PROXY_TYPE=http
PROXY_HOST=proxy.company.com
PROXY_PORT=8080
NETWORK_THROTTLING_ENABLED=false

# Security
CERTIFICATE_STRICT_VALIDATION=true
OAUTH_TOKEN_CACHE_ENABLED=true
SECURE_CONFIG_ENCRYPTION_ALGORITHM=aes-256-gcm
```

### Project Configuration (`config/<project>/project.env`)
```properties
PROJECT_NAME=AKHAN
BASE_URL=https://opensource-demo.orangehrmlive.com
DEFAULT_TIMEOUT=10000
```

## 📝 Writing Tests

### Feature File Example
```gherkin
@akhan @login @smoke
Feature: User Authentication
  As a user
  I want to login to the application
  So that I can access my account

  Background:
    Given I am on the login page

  @TC001 @high-priority
  Scenario: Successful login with valid credentials
    When I enter username "admin" and password "admin123"
    And I click on the "Login" button
    Then I should see the dashboard page
    And I should see welcome message "Welcome Admin"

  @TC002 @data-driven
  @DataProvider(source="test/akhan/data/login-data.xlsx",type="excel",filter="testType=login,executeFlag=Y")
  Scenario Outline: Login with multiple users
    When I enter username "<username>" and password "<password>"
    And I click on the "Login" button
    Then I should see the dashboard page
```

### Data-Driven Testing

The framework supports multiple data providers with advanced features:

#### Excel Data Provider
```gherkin
@DataProvider(source="data/test-data.xlsx",type="excel",sheetName="LoginData",filter="priority=high,executeFlag=Y")
Scenario: Data-driven test with Excel
  When I perform action with "<testData>"
  Then I verify "<expectedResult>"
```

#### JSON Data Provider with JSONPath
```gherkin
@DataProvider(source="data/test-data.json",type="json",jsonPath="$.users[?(@.role=='admin' && @.active==true)]")
Scenario: Data-driven test with JSON filter
  When I login as "<username>" with password "<password>"
  Then I should have "<accessLevel>" access
```

#### Column Normalization

The framework automatically normalizes column names:

| Original Column | Normalized Column |
|----------------|-------------------|
| testId, testCaseId, tcId | testCase |
| user, userName, login | username |
| pass, passwd, pwd | password |
| executeTest, run, active | executeFlag |

## 🚀 Running Tests

### Basic Commands
```bash
# Run all tests
npm test

# Run specific project
npm run test:akhan

# Run with specific environment
npm run test:akhan -- --env=qa

# Run specific feature
npm run test:akhan -- --feature=test/akhan/features/login.feature

# Run with tags
npm run test:akhan -- --tags="@smoke and not @skip"

# Run tests in parallel
npm run test:akhan:parallel
```

### Advanced Options
```bash
npm run test:akhan -- \
  --env=uat \
  --browser=firefox \
  --headless=true \
  --workers=4 \
  --retry=2 \
  --screenshot=always \
  --video=on-failure
```

## 📊 Reporting Features

### HTML Reports
- **Interactive Dashboard**: Real-time test execution summary
- **Action Timeline**: Every UI interaction with verbose descriptions
- **Console Log Integration**: All terminal output captured and categorized
- **Evidence Gallery**: Screenshots and videos linked to test steps
- **Performance Metrics**: Detailed timing for each operation
- **Search & Filter**: Find specific actions, errors, or test steps

### Report Enhancements
- **Verbose Action Logging**: Shows actual values (e.g., "Element filled: 'Admin' filled in Username input field")
- **Verification Results**: All assertions logged with pass/fail status and comparison details
- **Navigation Timeline**: Complete tracking of page navigations and load states
- **Automatic Secret Masking**: Sensitive fields masked with asterisks
- **Exception Details**: Failed actions include error messages
- **Console Log Categorization**: Errors, Warnings, Debug, Info properly sorted
- **Working Filters**: Click category tabs to filter logs
- **Scrollable Containers**: Proper scrolling for long log lists

### Report Formats
- **HTML**: Interactive web-based reports
- **PDF**: Professional document format
- **Excel**: Detailed spreadsheets with pivot tables
- **JSON**: Machine-readable format for integrations

## 💾 Runtime Property Storage

The framework provides multiple mechanisms for storing and retrieving runtime data:

### ConfigurationManager (Global Storage)
```typescript
// Store a value globally
ConfigurationManager.set('SESSION_TOKEN', 'abc123');

// Retrieve it anywhere
const token = ConfigurationManager.get('SESSION_TOKEN');
```

### BDDContext (Scoped Storage)
```typescript
// Store with different scopes
this.bddContext.store('userId', '12345'); // scenario scope
this.bddContext.store('apiToken', 'abc123', 'feature'); // feature scope
this.bddContext.store('baseUrl', 'https://api.example.com', 'world'); // global scope

// Retrieve values
const userId = this.bddContext.retrieve<string>('userId');
```

### ExecutionContext (Metadata Storage)
```typescript
// Store test execution metadata
this.executionContext.setMetadata('testRunId', 'TR-12345');

// Retrieve metadata
const testRunId = this.executionContext.getMetadata('testRunId');
```

## 🔗 Azure DevOps Integration

### Overview
The framework provides comprehensive integration with Azure DevOps Test Plans for automatic test result publishing and evidence attachment.

### Tag-Based Test Mapping
```gherkin
@TestPlanId-100 @TestSuiteId-200
Feature: User Authentication

  @TestCaseId-12345 @priority:critical @smoke
  Scenario: Successful login
    Given I am on login page
    When I enter valid credentials
    Then I should see dashboard
```

### Supported Tags
- `@TestCaseId-XXX` - Maps to ADO test case
- `@TestPlanId-XXX` - Specifies test plan
- `@TestSuiteId-XXX` - Specifies test suite
- `@priority:critical|high|medium|low` - Sets priority

### Authentication
```env
# Personal Access Token (Recommended)
ADO_PAT_TOKEN=your-pat-token
# Or encrypted:
ADO_PAT_TOKEN=ENCRYPTED:U2FsdGVkX1+...

# Basic Authentication
ADO_USERNAME=user@company.com
ADO_PASSWORD=ENCRYPTED:U2FsdGVkX1+...
```

### Evidence Attachment
- Screenshots with automatic compression
- Videos with chunked upload
- Console logs and execution traces
- HAR files for network analysis
- HTML reports as ZIP archives

### Advanced Features
- Automatic bug creation on failures
- Build/release integration
- Custom field mapping
- Batch processing for performance
- Smart retry logic

## 🚀 Advanced Features

### Parallel Execution
```bash
# Configure workers
MAX_PARALLEL_WORKERS=4
PARALLEL_SCENARIO_EXECUTION=true

# Run with parallel execution
npm run test -- --parallel --workers=4
```

### Network Interception
```typescript
// Mock API responses
await page.route('**/api/users', route => {
  route.fulfill({
    status: 200,
    body: JSON.stringify({ users: [] })
  });
});
```

### Performance Monitoring
- Automatic Core Web Vitals collection
- Custom performance metrics
- Resource timing analysis
- Performance budgets enforcement
- Navigation performance tracking with detailed timing

### Proxy Configuration
```env
PROXY_TYPE=http
PROXY_HOST=proxy.company.com
PROXY_PORT=8080
PROXY_USERNAME=user
PROXY_PASSWORD=pass
```

## 🔍 Debugging

### Debug Mode
```bash
# Enable debug logging
npm run test:akhan -- --debug=true

# Pause on failure
npm run test:akhan -- --pause-on-failure

# Slow motion execution
npm run test:akhan -- --slow-mo=1000

# Enable CSP-safe mode for restricted environments
CSP_SAFE_MODE=true npm run test:akhan
```

### Trace Viewer
```bash
# Generate trace
npm run test:akhan -- --trace=on

# View trace
npx playwright show-trace trace.zip
```

## 🔒 Security

### Data Encryption
- Automatic encryption/decryption of sensitive values
- Support for encrypted configuration files
- Secure credential storage

### Best Practices
- Store sensitive data in `test-secure.config.env`
- Use environment variables for secrets
- Never commit credentials to version control
- Implement role-based access control

## 🧪 Best Practices

### Page Object Model
- Encapsulate page logic in dedicated classes
- Use descriptive element locators
- Implement reusable methods

### Data Management
- Keep test data in external files
- Use meaningful column names
- Enable execution flags
- Encrypt sensitive data

### Test Organization
- Use descriptive feature names
- Apply meaningful tags
- Group related tests
- Maintain clear folder structure

### Step Definitions
- Keep steps atomic and reusable
- Use parameters for flexibility
- Avoid hardcoded values
- Implement proper error handling

## 📈 Performance Tips

- Use parallel execution for faster runs
- Implement smart waits instead of hard sleeps
- Optimize locator strategies
- Cache reusable data
- Use headless mode in CI/CD

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📚 Documentation

- **[User Guide](./FRAMEWORK_USER_GUIDE.md)** - Detailed usage instructions

## 🐛 Troubleshooting

### Common Issues

1. **Module not found errors**
   ```bash
   npm ci
   npm run build
   ```

2. **Browser launch failures**
   ```bash
   npx playwright install --with-deps
   ```

3. **Permission errors**
   ```bash
   # Linux/Mac
   chmod +x node_modules/.bin/*
   ```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For questions and support, please refer to the documentation or create an issue in the repository.

---

**Maintained by**: CS Test Automation Team