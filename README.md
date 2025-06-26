# CS Test Automation Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![BDD](https://img.shields.io/badge/BDD-Cucumber-00A818?style=for-the-badge&logo=cucumber&logoColor=white)](https://cucumber.io/)

> **Enterprise-grade Zero-Code BDD Test Automation Framework with AI-Powered Self-Healing**

A comprehensive, TypeScript-based test automation framework that enables **zero-code testing** through BDD (Behavior-Driven Development) with built-in support for **UI**, **API**, and **Database** testing. Features AI-powered self-healing, advanced reporting, Azure DevOps integration, and enterprise-level configurability.

## 🚀 Key Features

### 🎯 **Zero-Code Testing**
- **BDD/Gherkin Support**: Write tests in natural language using Gherkin syntax
- **Pre-built Step Definitions**: Comprehensive library covering UI, API, and Database operations
- **Data-Driven Testing**: Advanced support for JSON, Excel, CSV, and XML with intelligent column normalization
- **Dynamic Configuration**: Environment-based configuration management

### 🧠 **AI-Powered Capabilities**
- **Self-Healing**: Automatic element identification and recovery from locator failures
- **Smart Element Detection**: AI-driven element identification using multiple strategies
- **Visual Recognition**: Computer vision-based element detection
- **Natural Language Processing**: Convert natural language to executable test steps

### 🔧 **Multi-Domain Testing**
- **UI Testing**: Web automation with Playwright across all major browsers
- **API Testing**: REST/GraphQL API testing with comprehensive validation
- **Database Testing**: Support for SQL Server, MySQL, PostgreSQL, MongoDB, Oracle, Redis
- **Cross-Platform**: Windows, macOS, and Linux support

### 📊 **Advanced Reporting & Analytics**
- **Multi-Format Reports**: HTML, PDF, Excel, and JSON export
- **Interactive Dashboards**: Real-time execution monitoring with charts
- **Screenshot & Video Capture**: Visual evidence collection
- **Performance Metrics**: Detailed execution analytics

### 🔗 **Enterprise Integration**
- **Azure DevOps Integration**: Test case management and result publishing
- **CI/CD Pipeline Support**: Jenkins, GitHub Actions, Azure Pipelines
- **Version Control**: Git integration with branch-based testing
- **Security**: Built-in encryption for sensitive data

## 🆕 Recent Updates (December 2024)

### Enhanced Data Provider Features
- **Column Normalization**: Automatically handles column name variations in data files
  - `testId`, `testCaseId`, `tcId` → `testCase`
  - `user`, `userName`, `login` → `username`
  - `executeTest`, `run`, `active` → `executeFlag`
- **JSONPath Support**: Complex queries with filters for JSON data sources
- **Improved Error Handling**: Clear warnings when filter columns don't exist
- **Type Conversion**: Automatic conversion (e.g., "Y"/"N" to boolean)
- **Special Character Handling**: Removes line breaks and special characters from column names

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: For version control
- **Browsers**: Latest versions of Chrome, Firefox, Safari, or Edge

## 🛠️ Installation

1. **Clone the repository**:
```bash
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
│   │   └── ai/                # AI-powered features
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
```

### Project Configuration (`config/<project>/project.env`)
```properties
PROJECT_NAME=AKHAN
BASE_URL=https://opensource-demo.orangehrmlive.com
DEFAULT_TIMEOUT=10000
```

### Environment Configuration (`config/<project>/environments/`)
Create environment-specific files:
- `dev.env` - Development settings
- `qa.env` - QA environment
- `uat.env` - UAT environment
- `prod.env` - Production (read-only tests)

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

#### Excel Data Provider
```gherkin
# With filter - loads only matching rows
@DataProvider(source="data/test-data.xlsx",type="excel",sheetName="LoginData",filter="priority=high,executeFlag=Y")
Scenario: Data-driven test with Excel filter
  When I perform action with "<testData>"
  Then I verify "<expectedResult>"

# Without filter - loads ALL rows from Excel
@DataProvider(source="data/test-data.xlsx",type="excel",sheetName="LoginData")
Scenario: Data-driven test loading all Excel data
  When I perform action with "<testData>"
  Then I verify "<expectedResult>"
```

#### JSON Data Provider with JSONPath
```gherkin
# With JSONPath filter
@DataProvider(source="data/test-data.json",type="json",jsonPath="$.users[?(@.role=='admin' && @.active==true)]")
Scenario: Data-driven test with JSON filter
  When I login as "<username>" with password "<password>"
  Then I should have "<accessLevel>" access

# Without filter - loads entire JSON structure
@DataProvider(source="data/test-data.json",type="json")
Scenario: Data-driven test loading all JSON data
  When I login as "<username>" with password "<password>"
  Then I should have "<accessLevel>" access
```

#### CSV Data Provider
```gherkin
# With filter
@DataProvider(source="data/test-data.csv",type="csv",delimiter=",",headers="true",filter="status=active")
Scenario: Data-driven test with CSV filter
  When I search for "<productName>"
  Then I should see price "<expectedPrice>"

# Without filter - loads all CSV rows
@DataProvider(source="data/test-data.csv",type="csv",delimiter=",",headers="true")
Scenario: Data-driven test loading all CSV data
  When I search for "<productName>"
  Then I should see price "<expectedPrice>"
```

#### Filter Behavior

**Filters are OPTIONAL in all data providers**. Here's what happens:

| Scenario | Result |
|----------|--------|
| No filter specified | ALL rows are loaded |
| Empty filter `{}` | ALL rows are loaded |
| Filter with criteria | Only matching rows are loaded |

**Execution Flag Behavior:**
- By default, `skipExecutionFlag=false` 
- Rows with `executeFlag=false` or `ExecutionFlag=N` are automatically filtered out
- To include ALL rows regardless: set `skipExecutionFlag=true`

```gherkin
# Include all rows, even with executeFlag=false
@DataProvider(source="data.xlsx",type="excel",skipExecutionFlag="true")
```

### Column Normalization Examples

The framework automatically normalizes column names to handle variations:

| Original Column | Normalized Column |
|----------------|-------------------|
| testId, testCaseId, tcId | testCase |
| user, userName, login | username |
| pass, passwd, pwd | password |
| executeTest, run, active | executeFlag |
| menu, menuItem, section | module |

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

# Run in headed mode
npm run test:akhan:headed

# Run in debug mode
npm run test:akhan:debug

# Run tests in parallel
npm run test:akhan:parallel
```

### Advanced Options
```bash
# Custom configuration
npm run test:akhan -- \
  --env=uat \
  --browser=firefox \
  --headless=true \
  --workers=4 \
  --retry=2 \
  --grep="Login" \
  --screenshot=always \
  --video=on-failure
```

## 📊 Reporting

### Report Types

#### HTML Report
- Interactive dashboard with execution summary
- Detailed test results with screenshots
- Performance metrics and trends
- Filterable test execution timeline

#### PDF Report
- Executive summary
- Test execution details
- Charts and visualizations
- Professional formatting

#### Excel Report
- Detailed test results in spreadsheet format
- Multiple worksheets for different views
- Pivot table ready data
- Automated charts

### Report Location
Reports are generated in: `reports/report-{timestamp}-{random}/`

### Custom Report Configuration
```javascript
// playwright.config.ts
reporter: [
  ['html', { outputFolder: 'reports/html' }],
  ['json', { outputFile: 'reports/results.json' }],
  ['junit', { outputFile: 'reports/junit.xml' }],
  ['./src/reporting/core/CSReporter.ts']
]
```

## 🤖 AI Features

### Self-Healing Locators
```typescript
// Automatically heals broken locators
@CSGetElement({ 
  locator: '#submit-btn',
  healingStrategy: 'auto',
  fallbackLocators: [
    'button[type="submit"]',
    'text=Submit'
  ]
})
submitButton: CSWebElement;
```

### Visual Recognition
```typescript
// Find elements using visual recognition
await page.findByVisual('login-button.png', {
  threshold: 0.8,
  timeout: 5000
});
```

### Natural Language Processing
```gherkin
# Natural language steps are automatically converted
Given I want to "search for products under $50 and add the first one to cart"
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
```

### Trace Viewer
```bash
# Generate trace
npm run test:akhan -- --trace=on

# View trace
npx playwright show-trace trace.zip
```

### VS Code Debugging
1. Set breakpoints in your code
2. Run "Debug: AKHAN Tests" from VS Code
3. Use the debug console for inspection

## 🧪 Best Practices

### 1. **Page Object Model**
```typescript
export class LoginPage extends CSBasePage {
  @CSGetElement({ locator: '#username' })
  private usernameInput: CSWebElement;
  
  async login(username: string, password: string) {
    await this.usernameInput.type(username);
    // ...
  }
}
```

### 2. **Data Management**
- Keep test data in external files
- Use meaningful column names
- Enable execution flags for selective running
- Encrypt sensitive data

### 3. **Test Organization**
- Use descriptive feature and scenario names
- Apply meaningful tags for categorization
- Group related tests in feature files
- Maintain a clear folder structure

### 4. **Step Definitions**
- Keep steps atomic and reusable
- Use parameters for flexibility
- Avoid hardcoded values
- Implement proper error handling

## 🔒 Security

### Data Encryption
```javascript
// Encrypt sensitive data in config files
ENCRYPTED_PASSWORD={encrypted}U2FsdGVkX1+...

// Auto-decryption in tests
const password = await decrypt(config.ENCRYPTED_PASSWORD);
```

### Secure Configuration
- Store sensitive data in `test-secure.config.env`
- Use environment variables for secrets
- Never commit credentials to version control
- Implement role-based access control

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Coding Standards
- Follow TypeScript best practices
- Write comprehensive unit tests
- Document new features
- Update README for significant changes

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

## 📈 Performance Tips

- Use parallel execution for faster runs
- Implement smart waits instead of hard sleeps
- Optimize locator strategies
- Cache reusable data
- Use headless mode in CI/CD

## 🚧 Roadmap

- [ ] Mobile app testing support
- [ ] Enhanced GraphQL testing
- [ ] AI-powered test generation
- [ ] Cloud device farm integration
- [ ] Advanced performance testing
- [ ] Kubernetes native execution

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Playwright team for the amazing automation library
- Cucumber team for BDD implementation
- All contributors and users of this framework

## 📞 Support

For questions and support, please refer to the documentation or create an issue in the repository.

---

**Version**: 1.0.0  
**Last Updated**: December 2024  
**Maintained by**: CS Test Automation Team