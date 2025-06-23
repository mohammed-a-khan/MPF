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
- **Data-Driven Testing**: Support for JSON, Excel, CSV, and XML data sources
- **Dynamic Configuration**: Environment-based configuration management

### 🧠 **AI-Powered Capabilities**
- **Self-Healing**: Automatic element identification and recovery from locator failures
- **Smart Element Detection**: AI-driven element identification using multiple strategies
- **Intelligent Reporting**: AI-enhanced test result analysis and insights

### 🔧 **Multi-Domain Testing**
- **UI Testing**: Web automation with Playwright across all major browsers
- **API Testing**: RESTful API testing with comprehensive validation
- **Database Testing**: Support for SQL Server, MySQL, PostgreSQL, MongoDB
- **Cross-Platform**: Windows, macOS, and Linux support

### 📊 **Advanced Reporting & Analytics**
- **Multi-Format Reports**: HTML, PDF, Excel, and JSON export
- **Interactive Dashboards**: Real-time execution monitoring with charts
- **Screenshot & Video Capture**: Visual evidence collection
- **Performance Metrics**: Detailed execution analytics

### 🔗 **Enterprise Integration**
- **Azure DevOps Integration**: Test case management and result publishing
- **CI/CD Pipeline Support**: Jenkins, GitHub Actions, Azure Pipelines
- **JIRA Integration**: Issue tracking and test management
- **Slack/Teams Notifications**: Real-time execution updates

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Writing Tests](#-writing-tests)
- [Execution Options](#-execution-options)
- [Reporting](#-reporting)
- [Advanced Features](#-advanced-features)
- [Best Practices](#-best-practices)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)

## ⚡ Quick Start

### Prerequisites
- **Node.js** 16.0.0 or higher
- **NPM** 8.0.0 or higher
- **TypeScript** 4.5.0 or higher

### 1. Clone and Install
```bash
git clone <repository-url>
cd cs-test-automation-framework
npm install
```

### 2. Run Sample Test
```bash
# Run Akhan login test
npm run test -- --env=dev --feature=test/akhan/features/akhan-login-navigation.feature --tags=@smoke

# Run API test
npm run test -- --env=dev --feature=test/api/features/httpbin-api-test.feature --tags=@simple
```

### 3. View Results
Reports are automatically generated in the `reports/` directory with interactive HTML dashboards.

## 🛠 Installation

### System Requirements
- **Operating System**: Windows 10+, macOS 10.15+, Ubuntu 18.04+
- **Node.js**: 16.0.0 or higher
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 2GB free space

### Installation Steps

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install

# 3. Verify installation
npm run test -- --help
```

### Docker Setup (Optional)
```bash
# Build Docker image
docker build -t cs-framework .

# Run tests in container
docker run --rm -v $(pwd)/reports:/app/reports cs-framework --env=dev --tags=@smoke
```

## 📁 Project Structure

```
cs-test-automation-framework/
├── 📁 config/                    # Environment configurations
│   ├── 📁 akhan/                # Akhan project configuration
│   │   ├── 📁 common/           # Shared configuration files
│   │   └── 📁 environments/     # Environment-specific settings
│   ├── 📁 api/                  # API project configuration
│   └── 📁 saucedemo/            # SauceDemo project configuration
├── 📁 src/                      # Framework source code
│   ├── 📁 api/                  # API testing components
│   ├── 📁 bdd/                  # BDD engine and components
│   ├── 📁 core/                 # Core framework modules
│   ├── 📁 data/                 # Data providers and handlers
│   ├── 📁 database/             # Database testing components
│   ├── 📁 integrations/         # External service integrations
│   ├── 📁 reporting/            # Report generation and export
│   └── 📁 steps/                # Pre-built step definitions
├── 📁 test/                     # Test implementations
│   ├── 📁 akhan/                # Akhan application tests
│   │   ├── 📁 data/             # Test data files
│   │   ├── 📁 features/         # BDD feature files
│   │   ├── 📁 pages/            # Page Object Models
│   │   └── 📁 steps/            # Custom step definitions
│   ├── 📁 api/                  # API test examples
│   └── 📁 saucedemo/            # SauceDemo test examples
├── 📁 reports/                  # Generated test reports
├── 📁 certificates/             # SSL certificates for testing
└── 📄 package.json              # Project dependencies and scripts
```

## ⚙️ Configuration

### Environment Configuration

The framework uses hierarchical configuration loading:

1. **Global Configuration** (`config/global.env`)
2. **Project Common** (`config/akhan/common/*.env`)
3. **Environment Specific** (`config/akhan/environments/dev.env`)

#### Example: Akhan Development Configuration

```bash
# config/akhan/environments/dev.env

# Application URLs
AKHAN_SIT_URL=https://akhan-ui-sit.myshare.net/
API_BASE_URL=https://api-dev.akhan.com

# Test Accounts
ADMIN_USERNAME=admin.dev@akhan.com
ADMIN_PASSWORD=AdminDev@2024!
USER1_USERNAME=testuser@akhan.com
USER1_PASSWORD=TestUser@2024!

# Database Configuration
DB_HOST=dev-db.akhan.com
DB_PORT=1433
DB_NAME=AKHAN_DEV
DB_USERNAME=akhan_test_user
DB_PASSWORD=DevP@ssw0rd!2024

# Feature Flags
ENABLE_SCREENSHOTS=true
ENABLE_VIDEO_RECORDING=false
ENABLE_TRACING=true
PARALLEL_EXECUTION=false
MAX_WORKERS=1

# ADO Integration
ADO_ORGANIZATION=mdakhan
ADO_PROJECT=akhan-project
ADO_TEST_PLAN_ID=500
ADO_INTEGRATION_ENABLED=true
```

### Project Configuration

Create project-specific configuration in `config/akhan/project.env`:

```bash
# Project metadata
PROJECT_NAME=AKHAN
PROJECT_CODE=AKH
PROJECT_VERSION=2.1.0
PROJECT_DESCRIPTION=AKHAN Application Test Suite

# Default settings
DEFAULT_BROWSER=chromium
DEFAULT_TIMEOUT=30000
DEFAULT_RETRY_COUNT=2
```

## 📝 Writing Tests

### 1. BDD Feature Files

Create feature files using Gherkin syntax in `test/akhan/features/`:

```gherkin
# test/akhan/features/akhan-login-navigation.feature

@akhan @login @navigation
Feature: AKHAN Login and Navigation

  @TC501 @smoke @high
  Scenario: Standard user login
    Given I am on the AKHAN login page
    When I enter username "login" and password "passwd"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @TC502 @regression @medium
  Scenario: Verify menu items
    Given I am logged in to AKHAN application
    Then I should see the following menu items
      | Home                |
      | ESSS/Series        |
      | Reference Interests |
      | Interest History   |
      | External Interests |
      | System Admin       |
      | Version Information|
      | File Upload        |
```

### 2. Data-Driven Testing

The framework supports multiple data formats with advanced filtering:

#### JSON Data Provider
```gherkin
@DataProvider(source="test/akhan/data/akhan-test-data.json", type="json", jsonPath="$.esss_search_scenarios[?(@.testId=='TC504')]", filter="executeTest=true")
Scenario Outline: Search ESSS by Key using JSON data
  Given I am logged in to AKHAN application
  And I am on the ESSS/Series page
  When I select search type "<searchType>"
  And I select search attribute "<searchAttribute>"
  And I enter search value "<searchValue>"
  And I click on the Search button
  Then I should see the search results
  And the search results should contain "<searchValue>"

  Examples:
    | searchType | searchAttribute | searchValue |
```

#### Excel Data Provider
```gherkin
@DataProvider(source="test/akhan/data/esss-search-data.xlsx", type="excel", sheet="SearchTests", filter="testType=regression,priority=high")
Scenario Outline: Search ESSS using Excel data
  When I select "<searchType>" from Type dropdown
  And I select "<searchAttribute>" from Attribute dropdown
  And I enter search value "<searchValue>"
  When I click on Search button
  Then I should see search results in the table

  Examples:
    | searchType | searchAttribute | searchValue |
```

### 3. Page Object Model

Create reusable page objects in `test/akhan/pages/`:

```typescript
// test/akhan/pages/LoginPage.ts

import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';

export class LoginPage extends CSBasePage {
    pageUrl = process.env['AKHAN_SIT_URL'] || 'https://akhan-ui-sit.myshare.net/';

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@id="login"]',
        description: 'Username input field'
    })
    private usernameInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@id="passwd"]',
        description: 'Password input field'
    })
    private passwordInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//a[normalize-space(text())="Log On"]',
        description: 'Log On link'
    })
    private logOnLink!: CSWebElement;

    async enterUsername(username: string) {
        await this.usernameInput.fill(username);
    }

    async enterPassword(password: string) {
        await this.passwordInput.fill(password);
    }

    async clickLogOn() {
        await this.logOnLink.click();
    }

    async verifyHomeHeader() {
        await this.homeHeader.waitFor({ state: 'visible' });
    }
}
```

### 4. Custom Step Definitions

Create custom steps in `test/akhan/steps/`:

```typescript
// test/akhan/steps/akhan-login-navigation.steps.ts

import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions } from '../../../src/bdd/decorators/CSBDDStepDef';
import { LoginPage } from '../pages/LoginPage';

@StepDefinitions
export class AKHANLoginNavigationSteps extends CSBDDBaseStepDefinition {
    private loginPage!: LoginPage;

    async before() {
        this.loginPage = new LoginPage();
        await this.loginPage.initialize(this.page);
    }

    @CSBDDStepDef('I am on the AKHAN login page')
    async navigateToLoginPage() {
        await this.loginPage.navigateTo(this.loginPage.pageUrl);
        await this.loginPage.waitForPageLoad();
    }

    @CSBDDStepDef('I enter username "{string}" and password "{string}"')
    async enterCredentials(username: string, password: string) {
        await this.loginPage.enterUsername(username);
        await this.loginPage.enterPassword(password);
    }

    @CSBDDStepDef('I click on the Log On link')
    async clickLogOn() {
        await this.loginPage.clickLogOn();
    }
}
```

## 🎯 Execution Options

### Command Line Interface

The framework provides extensive CLI options for test execution:

#### Basic Execution
```bash
# Run all tests in development environment
npm run test -- --env=dev

# Run specific feature file
npm run test -- --env=dev --feature=test/akhan/features/akhan-login-navigation.feature

# Run tests with specific tags
npm run test -- --env=dev --tags=@smoke

# Run tests with tag combinations
npm run test -- --env=dev --tags="@smoke and @high"
npm run test -- --env=dev --tags="@regression or @critical"
npm run test -- --env=dev --tags="not @skip"
```

#### Advanced Execution
```bash
# Parallel execution with custom workers
npm run test -- --env=dev --parallel --workers=4

# Browser-specific testing
npm run test -- --env=dev --browser=chromium --headed
npm run test -- --env=dev --browser=firefox --headless

# Report generation
npm run test -- --env=dev --report-format=html,pdf,excel

# Debug mode
npm run test -- --env=dev --debug --headed --timeout=60000

# Retry configuration
npm run test -- --env=dev --retry=3 --bail=5
```

#### Environment-Specific Scripts
```bash
# Development environment
npm run test:dev                    # All tests in dev
npm run test:dev:smoke              # Smoke tests in dev
npm run test:dev:regression         # Regression tests in dev

# SIT environment
npm run test:sit                    # All tests in SIT
npm run test:sit:smoke              # Smoke tests in SIT
npm run test:sit:critical           # Critical tests in SIT

# QA environment
npm run test:qa                     # All tests in QA
npm run test:qa:e2e                 # E2E tests in QA
npm run test:qa:parallel            # Parallel execution in QA

# UAT environment
npm run test:uat                    # All tests in UAT
npm run test:uat:sanity             # Sanity tests in UAT
```

### Configuration Options

| Option | Description | Example |
|--------|-------------|---------|
| `--env` | Target environment | `--env=dev` |
| `--feature` | Specific feature file(s) | `--feature=login.feature` |
| `--tags` | Tag-based filtering | `--tags=@smoke` |
| `--browser` | Browser selection | `--browser=chromium` |
| `--parallel` | Enable parallel execution | `--parallel --workers=4` |
| `--headed` | Run in headed mode | `--headed` |
| `--debug` | Enable debug mode | `--debug` |
| `--retry` | Retry failed tests | `--retry=3` |
| `--timeout` | Global timeout (ms) | `--timeout=60000` |
| `--report-format` | Report formats | `--report-format=html,pdf` |

## 📊 Reporting

### HTML Dashboard Reports

The framework generates comprehensive HTML reports with:

- **Executive Summary**: High-level test execution overview
- **Interactive Charts**: Doughnut charts, bar charts, trend analysis
- **Detailed Results**: Scenario-level execution details
- **Evidence Collection**: Screenshots, videos, logs
- **Performance Metrics**: Execution times, resource usage

### Multi-Format Export

#### PDF Reports
```bash
npm run test -- --env=dev --report-format=pdf
```
- Professional PDF reports with charts and metrics
- Executive summary with key insights
- Detailed test results with evidence

#### Excel Reports
```bash
npm run test -- --env=dev --report-format=excel
```
- Structured data export for analysis
- Multiple worksheets (Summary, Details, Metrics)
- Conditional formatting and charts

#### JSON Reports
```bash
npm run test -- --env=dev --report-format=json
```
- Machine-readable test results
- API integration and data processing
- Custom analysis and reporting tools

### Azure DevOps Integration

Automatic test case management and result publishing:

```bash
# Enable ADO integration
npm run test -- --env=dev --ado-upload

# Configure ADO settings in environment
ADO_ORGANIZATION=mdakhan
ADO_PROJECT=akhan-project
ADO_TEST_PLAN_ID=500
ADO_INTEGRATION_ENABLED=true
```

## 🔬 Advanced Features

### AI-Powered Self-Healing

The framework includes intelligent element identification and recovery:

```typescript
// Automatic element healing when locators fail
@CSGetElement({
    locatorType: 'xpath',
    locatorValue: '//button[@id="submit"]',
    description: 'Submit button',
    healingStrategies: ['ai-visual', 'ai-text', 'ai-position']
})
private submitButton!: CSWebElement;
```

### Data Encryption

Sensitive test data can be encrypted:

```bash
# Encrypt sensitive data
npm run encrypt-data -- --file=test/data/credentials.json

# Framework automatically decrypts during test execution
```

### Network Mocking

Mock API responses for isolated testing:

```typescript
// Mock API responses
await this.apiClient.mockResponse('/api/users', {
    status: 200,
    body: { users: [] }
});
```

### Database Testing

Direct database operations:

```gherkin
# Database validation steps
Given I connect to "AKHAN_DB" database
When I execute query "SELECT * FROM Users WHERE username = 'testuser'"
Then the query result should contain 1 rows
And the result column "status" should equal "active"
```

### Performance Testing

Built-in performance monitoring:

```gherkin
# Performance assertions
Given I navigate to "https://akhan-ui-sit.myshare.net"
Then the page load time should be less than 3000 ms
And the largest contentful paint should be less than 2500 ms
```

## 📋 Best Practices

### Test Organization

1. **Feature-Based Structure**: Group tests by business features
2. **Environment Separation**: Maintain separate configurations
3. **Data Management**: Use external data sources for test data
4. **Page Objects**: Implement maintainable page object models

### Configuration Management

1. **Hierarchical Configuration**: Use global → project → environment hierarchy
2. **Environment Variables**: Store sensitive data in environment variables
3. **Version Control**: Keep configurations in source control
4. **Documentation**: Document configuration options

### Test Design

1. **Independent Tests**: Ensure tests can run independently
2. **Descriptive Names**: Use clear, descriptive test names
3. **Tag Strategy**: Implement consistent tagging strategy
4. **Data Cleanup**: Clean up test data after execution

### Performance Optimization

1. **Parallel Execution**: Use parallel execution for large test suites
2. **Browser Reuse**: Configure browser pool for efficiency
3. **Smart Waits**: Use intelligent wait strategies
4. **Resource Management**: Monitor memory and CPU usage

## 🔧 API Reference

### Core Classes

#### CSFramework
Main framework orchestrator
```typescript
const framework = CSFramework.getInstance();
await framework.initialize('akhan', 'dev');
```

#### CSBasePage
Base class for page objects
```typescript
export class LoginPage extends CSBasePage {
    pageUrl = 'https://app.example.com/login';
    // Page implementation
}
```

#### CSWebElement
Enhanced web element with self-healing
```typescript
@CSGetElement({
    locatorType: 'css',
    locatorValue: '#username',
    description: 'Username field'
})
private username!: CSWebElement;
```

#### CSDataProvider
Data provider for test data
```typescript
const dataProvider = CSDataProvider.getInstance();
const testData = await dataProvider.loadData({
    source: 'test-data.json',
    type: 'json'
});
```

### Pre-built Step Definitions

#### UI Steps
- Navigation: `I navigate to "{url}"`
- Interactions: `I click on "{element}"`
- Assertions: `I should see "{text}"`
- Forms: `I enter "{value}" in "{field}"`

#### API Steps
- Requests: `I send GET request to "{endpoint}"`
- Validation: `the response status code should be {code}`
- JSON validation: `the response JSON path "{path}" should equal "{value}"`

#### Database Steps
- Connection: `I connect to "{database}" database`
- Queries: `I execute query "{sql}"`
- Validation: `the query result should contain {count} rows`

## 🐛 Troubleshooting

### Common Issues

#### Installation Issues
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Install Playwright browsers
npx playwright install
```

#### Test Execution Issues
```bash
# Enable debug mode
npm run test -- --debug --headed

# Increase timeout
npm run test -- --timeout=60000

# Check logs
tail -f logs/execution.log
```

#### Configuration Issues
```bash
# Validate configuration
npm run test -- --validate-config

# Check environment variables
npm run test -- --show-config
```

### Support and Community

- **Documentation**: [Framework User Guide](./FRAMEWORK_USER_GUIDE.md)
- **Issues**: Report issues on GitHub
- **Discussions**: Community discussions and Q&A
- **Examples**: Additional examples in `test/` directory

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## 📈 Version History

- **v1.0.0** - Initial release with core features
- **v1.1.0** - Added AI self-healing capabilities
- **v1.2.0** - Enhanced reporting and ADO integration
- **v1.3.0** - Performance improvements and bug fixes

---

**Built with ❤️ by the CS Test Automation Team** 