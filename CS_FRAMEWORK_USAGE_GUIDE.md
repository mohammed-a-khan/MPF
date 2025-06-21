# CS Test Automation Framework - Complete Usage Guide

## 🚀 Framework Overview

The CS Test Automation Framework is a high-performance, enterprise-grade test automation solution built on Playwright and TypeScript. It provides comprehensive testing capabilities for web applications, APIs, and databases with advanced reporting, AI-powered self-healing, and extensive integration options.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Framework Architecture](#framework-architecture)
3. [Installation & Setup](#installation--setup)
4. [Configuration](#configuration)
5. [Writing Tests](#writing-tests)
6. [Page Object Model](#page-object-model)
7. [API Testing](#api-testing)
8. [Database Testing](#database-testing)
9. [Data Management](#data-management)
10. [Reporting](#reporting)
11. [Performance Optimization](#performance-optimization)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- TypeScript 4.5+
- Git

### Installation
```bash
# Clone the framework
git clone <repository-url>
cd cs-test-automation-framework

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Your First Test
```bash
# Run sample SauceDemo tests
npm run test:saucedemo

# Run API tests
npm run test:api

# Run with specific environment
npm run test:saucedemo -- --env=qa
```

## 🏗️ Framework Architecture

### Core Components

```
src/
├── core/                    # Core framework functionality
│   ├── browser/            # Browser management
│   ├── elements/           # Element handling & interactions
│   ├── pages/              # Base page classes
│   ├── configuration/      # Configuration management
│   ├── logging/            # Action logging system
│   └── utils/              # Utility functions
├── bdd/                    # BDD engine
│   ├── runner/             # Test execution engine
│   ├── parser/             # Gherkin parser
│   └── decorators/         # Step definition decorators
├── api/                    # API testing capabilities
├── database/               # Database testing
├── data/                   # Data management
├── reporting/              # Advanced reporting
└── integrations/           # Third-party integrations
```

## ⚙️ Installation & Setup

### 1. Environment Setup
```bash
# Create .env file for your environment
cp config/saucedemo/environments/dev.env .env

# Or use hierarchical configuration
npm run config:load -- saucedemo dev
```

### 2. Browser Configuration
```typescript
// config/browser.config.ts
export const browserConfig = {
  browser: 'chromium', // chromium, firefox, webkit
  headless: false,     // Set to true for CI/CD
  slowMo: 0,          // Milliseconds delay between actions
  viewport: { width: 1280, height: 720 }
};
```

### 3. Test Environment Setup
```bash
# Development
npm run test:dev

# QA Environment  
npm run test:qa

# Production (Performance Mode)
PERFORMANCE_MODE=true npm run test:prod
```

## 🔧 Configuration

### Hierarchical Configuration System

The framework uses a hierarchical configuration system:

```
config/
├── global.env                    # Global settings
├── common/
│   ├── framework.env            # Framework defaults
│   └── security.env             # Security settings
└── [project]/
    ├── project.env              # Project-specific settings
    ├── common/
    │   ├── api.endpoints.env    # API endpoints
    │   └── database.queries.env # Database queries
    └── environments/
        ├── dev.env              # Development environment
        ├── qa.env               # QA environment
        └── prod.env             # Production environment
```

### Configuration Loading
```typescript
// Load configuration programmatically
await ConfigurationManager.loadConfiguration('saucedemo', 'dev');

// Access configuration values
const baseUrl = ConfigurationManager.get('BASE_URL');
const apiTimeout = ConfigurationManager.getNumber('API_TIMEOUT', 30000);
const enableHeadless = ConfigurationManager.getBoolean('HEADLESS_MODE', false);
```

### Environment Variables
```bash
# Essential environment variables
BASE_URL=https://www.saucedemo.com
BROWSER_TYPE=chromium
HEADLESS_MODE=false
PERFORMANCE_MODE=false
LOG_LEVEL=info
PARALLEL_EXECUTION=false
MAX_WORKERS=1
```

## ✍️ Writing Tests

### BDD Style Tests

#### 1. Feature Files
```gherkin
# test/features/login.feature
Feature: User Authentication
  As a user
  I want to login to the application
  So that I can access my account

  Background:
    Given I navigate to the SauceDemo application

  Scenario: Successful login with valid credentials
    When I login with username "standard_user" and password "secret_sauce"
    Then I should see the products page
    And I should see "Products" in the page title

  Scenario Outline: Login with different user types
    When I login with username "<username>" and password "<password>"
    Then I should see the products page
    
    Examples:
      | username        | password     |
      | standard_user   | secret_sauce |
      | performance_user| secret_sauce |
```

#### 2. Step Definitions
```typescript
// test/steps/login.steps.ts
import { CSBDDStepDef } from '../../src/bdd/decorators/CSBDDStepDef';
import { LoginPage } from '../pages/LoginPage';
import { ProductsPage } from '../pages/ProductsPage';

export class LoginSteps {
  private loginPage: LoginPage;
  private productsPage: ProductsPage;

  constructor() {
    this.loginPage = new LoginPage();
    this.productsPage = new ProductsPage();
  }

  @CSBDDStepDef(/^I navigate to the SauceDemo application$/)
  async navigateToApplication(): Promise<void> {
    await this.loginPage.navigateTo();
  }

  @CSBDDStepDef(/^I login with username "([^"]*)" and password "([^"]*)"$/)
  async loginWithCredentials(username: string, password: string): Promise<void> {
    await this.loginPage.login(username, password);
  }

  @CSBDDStepDef(/^I should see the products page$/)
  async shouldSeeProductsPage(): Promise<void> {
    await this.productsPage.waitForPageLoad();
    await this.productsPage.verifyPageLoaded();
  }
}
```

### Page Object Model

#### 1. Base Page Class
```typescript
// src/core/pages/CSBasePage.ts
export abstract class CSBasePage {
  protected page: Page;
  protected pageUrl: string;

  constructor(page: Page, pageUrl: string) {
    this.page = page;
    this.pageUrl = pageUrl;
  }

  async navigateTo(url?: string): Promise<void> {
    const targetUrl = url || this.pageUrl;
    await this.page.goto(targetUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }
}
```

#### 2. Page Implementation
```typescript
// test/pages/LoginPage.ts
import { CSBasePage } from '../../src/core/pages/CSBasePage';
import { CSWebElement } from '../../src/core/elements/CSWebElement';

export class LoginPage extends CSBasePage {
  // Element definitions
  private usernameField = new CSWebElement(this.page, {
    locatorType: 'css',
    locatorValue: '[data-test="username"]',
    description: 'Username input field'
  });

  private passwordField = new CSWebElement(this.page, {
    locatorType: 'css', 
    locatorValue: '[data-test="password"]',
    description: 'Password input field'
  });

  private loginButton = new CSWebElement(this.page, {
    locatorType: 'css',
    locatorValue: '[data-test="login-button"]', 
    description: 'Login button'
  });

  constructor(page: Page) {
    super(page, 'https://www.saucedemo.com');
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameField.fill(username);
    await this.passwordField.fill(password);
    await this.loginButton.click();
  }

  async verifyLoginError(expectedError: string): Promise<void> {
    const errorElement = new CSWebElement(this.page, {
      locatorType: 'css',
      locatorValue: '[data-test="error"]',
      description: 'Error message'
    });
    
    await errorElement.assertTextContains(expectedError);
  }
}
```

## 🌐 API Testing

### API Test Structure
```typescript
// test/api/user-api.steps.ts
import { CSBDDStepDef } from '../../src/bdd/decorators/CSBDDStepDef';
import { CSHttpClient } from '../../src/api/client/CSHttpClient';
import { APIContext } from '../../src/api/context/APIContext';

export class UserAPISteps {
  private apiClient: CSHttpClient;
  private apiContext: APIContext;

  constructor() {
    this.apiClient = new CSHttpClient();
    this.apiContext = APIContext.getInstance();
  }

  @CSBDDStepDef(/^I send a GET request to "([^"]*)"$/)
  async sendGetRequest(endpoint: string): Promise<void> {
    const response = await this.apiClient.get(endpoint);
    this.apiContext.setResponse('lastResponse', response);
  }

  @CSBDDStepDef(/^the response status should be (\d+)$/)
  async verifyResponseStatus(expectedStatus: number): Promise<void> {
    const response = this.apiContext.getResponse('lastResponse');
    expect(response.status).toBe(expectedStatus);
  }

  @CSBDDStepDef(/^the response should contain "([^"]*)"$/)
  async verifyResponseContains(expectedText: string): Promise<void> {
    const response = this.apiContext.getResponse('lastResponse');
    expect(response.data).toContain(expectedText);
  }
}
```

### API Configuration
```typescript
// config/api/endpoints.env
API_BASE_URL=https://api.example.com
API_TIMEOUT=30000
API_RETRY_COUNT=3
API_VALIDATE_SSL=true

# Authentication
AUTH_TYPE=bearer
AUTH_TOKEN_ENDPOINT=/auth/token
AUTH_USERNAME=api_user
AUTH_PASSWORD=api_password
```

## 🗄️ Database Testing

### Database Configuration
```typescript
// config/database.env
DATABASE_TYPE=sqlserver
DATABASE_HOST=localhost
DATABASE_PORT=1433
DATABASE_NAME=testdb
DATABASE_USERNAME=testuser
DATABASE_PASSWORD=testpass
DATABASE_POOL_SIZE=10
```

### Database Steps
```typescript
// test/steps/database.steps.ts
import { CSBDDStepDef } from '../../src/bdd/decorators/CSBDDStepDef';
import { CSDatabase } from '../../src/database/client/CSDatabase';

export class DatabaseSteps {
  private database: CSDatabase;

  constructor() {
    this.database = CSDatabase.getInstance();
  }

  @CSBDDStepDef(/^I execute query "([^"]*)"$/)
  async executeQuery(query: string): Promise<void> {
    const result = await this.database.execute(query);
    this.database.storeResult('lastQuery', result);
  }

  @CSBDDStepDef(/^the query should return (\d+) rows?$/)
  async verifyRowCount(expectedCount: number): Promise<void> {
    const result = this.database.getResult('lastQuery');
    expect(result.rows.length).toBe(expectedCount);
  }
}
```

## 📊 Data Management

### Test Data Files
```json
// test/data/users.json
{
  "validUsers": [
    {
      "username": "standard_user",
      "password": "secret_sauce",
      "type": "standard"
    },
    {
      "username": "performance_user", 
      "password": "secret_sauce",
      "type": "performance"
    }
  ],
  "invalidUsers": [
    {
      "username": "locked_out_user",
      "password": "secret_sauce",
      "expectedError": "Epic sadface: Sorry, this user has been locked out."
    }
  ]
}
```

### Data-Driven Tests
```typescript
// test/steps/data-driven.steps.ts
import { CSDataProvider } from '../../src/data/provider/CSDataProvider';

export class DataDrivenSteps {
  private dataProvider: CSDataProvider;

  constructor() {
    this.dataProvider = new CSDataProvider();
  }

  @CSBDDStepDef(/^I load test data from "([^"]*)"$/)
  async loadTestData(dataFile: string): Promise<void> {
    await this.dataProvider.loadFromFile(`test/data/${dataFile}`);
  }

  @CSBDDStepDef(/^I use data set "([^"]*)"$/)
  async useDataSet(dataSetName: string): Promise<void> {
    const dataSet = this.dataProvider.getDataSet(dataSetName);
    this.dataProvider.setCurrentDataSet(dataSet);
  }
}
```

## 📈 Reporting

### Report Configuration
```typescript
// config/reporting.env
REPORT_PATH=./reports
REPORT_GENERATE_PDF=true
REPORT_GENERATE_EXCEL=true
REPORT_INCLUDE_SCREENSHOTS=true
REPORT_INCLUDE_VIDEOS=false
REPORT_INCLUDE_LOGS=true
REPORT_THEME_PRIMARY=#007bff
```

### Custom Report Generation
```typescript
// Generate reports programmatically
import { ReportOrchestrator } from '../src/reporting/core/ReportOrchestrator';

const reportOrchestrator = new ReportOrchestrator();
await reportOrchestrator.generateReports(executionResult, {
  formats: ['html', 'pdf', 'excel', 'json'],
  includeScreenshots: true,
  includeLogs: true,
  theme: 'professional'
});
```

### Report Features
- **HTML Reports**: Interactive dashboard with charts and filters
- **PDF Reports**: Professional printable reports
- **Excel Reports**: Detailed data analysis with charts
- **JSON Reports**: Machine-readable format for CI/CD integration
- **Real-time Dashboards**: Live execution monitoring

## ⚡ Performance Optimization

### Performance Mode
```bash
# Enable performance mode for faster execution
PERFORMANCE_MODE=true npm run test

# Reduce logging overhead
LOG_LEVEL=warn

# Disable unnecessary features
REPORT_INCLUDE_VIDEOS=false
REPORT_INCLUDE_SCREENSHOTS=false
```

### Parallel Execution
```bash
# Enable parallel execution
PARALLEL_EXECUTION=true
MAX_WORKERS=4
npm run test:parallel
```

### Browser Optimization
```typescript
// Optimized browser configuration
const browserConfig = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--memory-pressure-off'
  ]
};
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Browser Context Closed Error
```
Error: Target page, context or browser has been closed
```
**Solution**: Ensure proper browser lifecycle management
```typescript
// In your test setup
await BrowserManager.getInstance().initialize();

// In your test teardown  
await BrowserManager.getInstance().cleanup();
```

#### 2. Element Not Found
```
Error: Element not found: [data-test="username"]
```
**Solution**: Use explicit waits and better selectors
```typescript
await element.waitFor({ state: 'visible', timeout: 30000 });
await element.click();
```

#### 3. Slow Test Execution
**Solutions**:
- Enable performance mode: `PERFORMANCE_MODE=true`
- Reduce logging: `LOG_LEVEL=warn`
- Use headless mode: `HEADLESS_MODE=true`
- Optimize wait strategies: Use `domcontentloaded` instead of `load`

#### 4. Memory Issues
**Solutions**:
- Increase Node.js memory: `--max_old_space_size=4096`
- Enable garbage collection: `--expose-gc`
- Reduce buffer sizes in performance mode

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run test

# Generate debug screenshots
SCREENSHOT_ON_FAILURE=true npm run test

# Enable trace recording
TRACE_ENABLED=true npm run test
```

## 🎯 Best Practices

### 1. Test Organization
```
test/
├── features/           # Feature files (.feature)
├── steps/             # Step definitions (.steps.ts)
├── pages/             # Page objects (.page.ts)
├── data/              # Test data files
└── utils/             # Test utilities
```

### 2. Naming Conventions
- **Feature files**: `kebab-case.feature`
- **Step files**: `kebab-case.steps.ts`
- **Page files**: `PascalCase.page.ts`
- **Test methods**: `camelCase`

### 3. Element Selection Strategy
```typescript
// Prefer data-test attributes
'[data-test="username"]'

// Use stable CSS selectors
'.login-form input[type="text"]'

// Avoid fragile selectors
'div:nth-child(3) > span' // ❌ Fragile
```

### 4. Error Handling
```typescript
try {
  await element.click();
} catch (error) {
  // Log the error with context
  ActionLogger.logError('Click failed', error, {
    element: element.description,
    page: this.constructor.name
  });
  throw error;
}
```

### 5. Performance Guidelines
- Use `domcontentloaded` for faster page loads
- Implement explicit waits instead of fixed delays
- Enable performance mode for CI/CD pipelines
- Use headless mode when visual feedback isn't needed
- Minimize screenshot and video recording

### 6. Configuration Management
- Use environment-specific configuration files
- Store sensitive data in encrypted configuration
- Use hierarchical configuration for better organization
- Validate configuration on startup

### 7. Reporting Best Practices
- Include meaningful test descriptions
- Add contextual information to failures
- Use tags for test categorization
- Generate reports in multiple formats for different audiences

## 🚀 Advanced Features

### AI-Powered Self-Healing
```typescript
// Enable AI self-healing for element locators
const element = new CSWebElement(page, {
  locatorType: 'css',
  locatorValue: '[data-test="username"]',
  aiEnabled: true,
  aiDescription: 'Username input field on login page',
  fallbacks: [
    { locatorType: 'css', value: '#username' },
    { locatorType: 'xpath', value: '//input[@placeholder="Username"]' }
  ]
});
```

### Integration Capabilities
- **Azure DevOps**: Automatic test result publishing
- **Jira**: Defect tracking integration  
- **Slack**: Real-time notifications
- **Jenkins**: CI/CD pipeline integration
- **Docker**: Containerized test execution

### Custom Extensions
```typescript
// Create custom step definitions
export class CustomSteps {
  @CSBDDStepDef(/^I perform custom action "([^"]*)"$/)
  async performCustomAction(action: string): Promise<void> {
    // Your custom implementation
  }
}
```

## 📞 Support & Contributing

### Getting Help
- Check the troubleshooting section
- Review the examples in the `test/` directory
- Consult the API documentation
- Create an issue for bugs or feature requests

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Framework Maintenance
- Regular dependency updates
- Performance monitoring and optimization
- Bug fixes and security patches
- New feature development based on user feedback

---

**Happy Testing! 🎉**

For more information, visit our [documentation website](https://cs-framework-docs.com) or contact the development team. 