# CS Test Automation Framework - Complete User Guide

## Table of Contents

1. [Framework Overview](#framework-overview)
2. [Getting Started](#getting-started)
3. [Core Components](#core-components)
4. [BDD Testing](#bdd-testing)
5. [Page Object Model](#page-object-model)
6. [Element Management](#element-management)
7. [Data Management](#data-management)
8. [API Testing](#api-testing)
9. [Database Testing](#database-testing)
10. [Configuration Management](#configuration-management)
11. [Reporting & Logging](#reporting--logging)
12. [Advanced Features](#advanced-features)
13. [Best Practices](#best-practices)
14. [Troubleshooting](#troubleshooting)

---

## Framework Overview

The CS Test Automation Framework is a comprehensive TypeScript-based testing framework built on Playwright that provides:

- **BDD (Behavior Driven Development)** with Gherkin syntax and step definitions
- **Page Object Model** with decorator-based element management
- **API Testing** with context management and response validation
- **Database Testing** with multiple database support
- **Data-Driven Testing** with CSV, JSON, Excel, and XML support
- **AI-Powered Self-Healing** for element location
- **Advanced Reporting** and action logging
- **Configuration Management** with encryption support

### Key Features
- ✅ TypeScript-based for type safety and IDE support
- ✅ Built-in encryption for sensitive configuration data
- ✅ Cross-browser testing (Chromium, Firefox, Safari)
- ✅ Parallel test execution
- ✅ Self-healing element location with AI
- ✅ Comprehensive logging and reporting
- ✅ Configuration management with environment support
- ✅ Memory management and resource cleanup

---

## Getting Started

### Installation & Setup

```bash
# Clone the framework
git clone <repository-url>
cd cs-test-automation-framework

# Install dependencies
npm install

# Run sample tests
npx ts-node src/index.ts --environment=dev --features="test/features/**/*.feature"
```

### Basic Project Structure

```
your-test-project/
├── config/                    # Configuration files by project/environment
│   ├── common/               # Common configuration
│   ├── myproject/
│   │   ├── common/          # Project-specific common config
│   │   └── environments/    # Environment-specific config
│   │       ├── dev.env
│   │       ├── qa.env
│   │       └── prod.env
│   └── global.env           # Global overrides
├── test/
│   ├── features/            # Gherkin feature files
│   ├── pages/              # Page object classes
│   ├── steps/              # Step definition files
│   └── data/               # Test data files
├── reports/                # Generated reports
└── screenshots/           # Test screenshots
```

### Your First Test

**1. Create a feature file** (`test/features/login.feature`):
```gherkin
Feature: User Login
  Scenario: Successful login
    Given I am on the login page
    When I login with username "standard_user" and password "secret_sauce"
    Then I should see the products page
```

**2. Create a page object** (`test/pages/LoginPage.ts`):
```typescript
import { CSBasePage } from '../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../src/core/elements/CSWebElement';

export class LoginPage extends CSBasePage {
    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'user-name',
        description: 'Username input field',
        required: true,
        waitForVisible: true,
        aiEnabled: true,
        aiDescription: 'Username input field for authentication'
    })
    usernameInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'password',
        description: 'Password input field',
        required: true,
        waitForVisible: true,
        aiEnabled: true,
        aiDescription: 'Password input field for authentication'
    })
    passwordInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'login-button',
        description: 'Login submit button',
        required: true,
        waitForEnabled: true,
        aiEnabled: true,
        aiDescription: 'Login button to submit credentials'
    })
    loginButton!: CSWebElement;

    protected get pageUrl(): string {
        return 'https://www.saucedemo.com';
    }

    protected async waitForPageLoad(): Promise<void> {
        await this.waitForId('user-name', 30000);
        await this.waitForId('password', 30000);
        await this.waitForId('login-button', 30000);
    }

    async login(username: string, password: string): Promise<void> {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }
}
```

**3. Create step definitions** (`test/steps/login.steps.ts`):
```typescript
import { CSBDDBaseStepDefinition } from '../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions } from '../../src/bdd/decorators/CSBDDStepDef';
import { BDDContext } from '../../src/bdd/context/BDDContext';
import { LoginPage } from '../pages/LoginPage';

@StepDefinitions
export class LoginSteps extends CSBDDBaseStepDefinition {
    private loginPage: LoginPage;

    constructor() {
        super();
        this.loginPage = new LoginPage();
    }

    @CSBDDStepDef('I am on the login page')
    async navigateToLogin(): Promise<void> {
        const page = BDDContext.getCurrentPage();
        await this.loginPage.initialize(page);
        await this.loginPage.navigateTo();
    }

    @CSBDDStepDef('I login with username {string} and password {string}')
    async loginWithCredentials(username: string, password: string): Promise<void> {
        await this.loginPage.login(username, password);
    }

    @CSBDDStepDef('I should see the products page')
    async verifyProductsPage(): Promise<void> {
        const page = BDDContext.getCurrentPage();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.title')).toHaveText('Products');
    }
}
```

**4. Run the test**:
```bash
npx ts-node src/index.ts --features="test/features/login.feature" --environment=dev
```

---

## Core Components

### CSFramework - Main Orchestrator

The `CSFramework` class is the central controller that manages all framework components.

#### Key Methods

```typescript
import { CSFramework } from './src/core/CSFramework';

// Get framework instance
const framework = CSFramework.getInstance();

// Initialize with project and environment
await framework.initialize('myproject', 'dev', {
    parallel: true,
    workers: 4,
    headless: false,
    debug: true
});

// Execute tests
const result = await framework.executeTests(['test/features/**/*.feature']);

// Get execution summary
const summary = framework.getExecutionSummary();

// Cleanup
await framework.cleanup();
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `parallel` | boolean | false | Enable parallel execution |
| `workers` | number | 1 | Number of parallel workers |
| `timeout` | number | 30000 | Global timeout in ms |
| `headless` | boolean | true | Run browser in headless mode |
| `debug` | boolean | false | Enable debug mode |
| `proxy` | boolean | false | Enable proxy support |
| `reporting` | boolean | true | Generate reports |
| `adoIntegration` | boolean | false | Enable ADO integration |

### ConfigurationManager - Settings Management

Handles configuration loading with automatic encryption support.

#### Basic Usage

```typescript
import { ConfigurationManager } from './src/core/configuration/ConfigurationManager';

// Load configuration for project and environment
await ConfigurationManager.loadConfiguration('myproject', 'dev');

// Get values (automatically decrypts ENCRYPTED: values)
const apiUrl = ConfigurationManager.get('API_BASE_URL');
const timeout = ConfigurationManager.getNumber('API_TIMEOUT', 5000);
const isEnabled = ConfigurationManager.getBoolean('FEATURE_ENABLED', false);
const tags = ConfigurationManager.getArray('TEST_TAGS', ',');

// Set runtime values
ConfigurationManager.set('RUNTIME_VALUE', 'test');

// Check if key exists
if (ConfigurationManager.has('OPTIONAL_CONFIG')) {
    // Use optional config
}
```

#### Configuration File Structure

```env
# config/myproject/dev.env
API_BASE_URL=https://api.dev.example.com
API_TIMEOUT=5000
FEATURE_ENABLED=true
TEST_TAGS=smoke,regression

# Encrypted values (use encryption-tool.html)
API_KEY=ENCRYPTED:eyJlbmNyeXB0ZWQiOiJqS3hOaWVWVlJrb2t6MVNHcWFBdz09...
DATABASE_PASSWORD=ENCRYPTED:eyJlbmNyeXB0ZWQiOiJyT0h2YjVGcW5QM2JUZ2JKWHRuRGZnPT0...
```

---

## BDD Testing

The framework uses Gherkin syntax with TypeScript step definitions.

### Step Definition Decorators

#### @CSBDDStepDef - Define Steps

```typescript
import { CSBDDStepDef } from './src/bdd/decorators/CSBDDStepDef';

@CSBDDStepDef('user clicks on {string} button')
async clickButton(buttonText: string): Promise<void> {
    const page = BDDContext.getCurrentPage();
    const button = page.locator(`button:has-text("${buttonText}")`);
    await button.click();
}

@CSBDDStepDef('user enters {string} in {string} field')
async enterText(text: string, fieldName: string): Promise<void> {
    const page = BDDContext.getCurrentPage();
    const field = page.locator(`[data-testid="${fieldName}"]`);
    await field.fill(text);
}

@CSBDDStepDef('user should see {int} items in the list')
async verifyItemCount(expectedCount: number): Promise<void> {
    const page = BDDContext.getCurrentPage();
    const items = page.locator('.list-item');
    await expect(items).toHaveCount(expectedCount);
}
```

#### Hook Decorators

```typescript
import { Before, After, BeforeStep, AfterStep } from './src/bdd/decorators/CSBDDStepDef';

@Before({ tags: '@login' })
async setupLogin(): Promise<void> {
    // Setup before scenarios tagged with @login
}

@After({ tags: '@cleanup' })
async cleanup(): Promise<void> {
    // Cleanup after scenarios tagged with @cleanup
}

@BeforeStep()
async beforeEachStep(): Promise<void> {
    // Execute before each step
}

@AfterStep()
async afterEachStep(): Promise<void> {
    // Execute after each step
}
```

### Advanced Gherkin Features

#### Data Tables

```gherkin
Scenario: User registration with multiple users
  When user registers with the following details:
    | username | email              | role  |
    | john     | john@example.com   | admin |
    | jane     | jane@example.com   | user  |
    | bob      | bob@example.com    | guest |
```

```typescript
@CSBDDStepDef('user registers with the following details:')
async registerUsers(dataTable: any[]): Promise<void> {
    for (const row of dataTable) {
        await this.registerUser(row.username, row.email, row.role);
    }
}
```

#### Doc Strings

```gherkin
Scenario: API request with JSON payload
  When user sends POST request with body:
    """
    {
      "name": "John Doe",
      "email": "john@example.com"
    }
    """
```

```typescript
@CSBDDStepDef('user sends POST request with body:')
async sendPostRequest(jsonBody: string): Promise<void> {
    const payload = JSON.parse(jsonBody);
    await this.apiClient.post('/users', payload);
}
```

---

## Page Object Model

### CSBasePage - Base Page Class

All page objects extend `CSBasePage` which provides common functionality.

#### Core Methods

```typescript
import { CSBasePage } from './src/core/pages/CSBasePage';

export class MyPage extends CSBasePage {
    protected get pageUrl(): string {
        return 'https://example.com/mypage';
    }

    protected async waitForPageLoad(): Promise<void> {
        // Define page-specific load conditions
        await this.waitForId('main-content', 30000);
    }

    protected async onPageReady(): Promise<void> {
        // Custom initialization after page load
    }

    protected async customValidation(): Promise<void> {
        // Custom page validation logic
    }
}
```

#### Navigation Methods

```typescript
// Navigate to page
await myPage.navigateTo();
await myPage.navigateTo('https://custom-url.com');

// Browser navigation
await myPage.reload();
await myPage.goBack();
await myPage.goForward();

// Page information
const title = await myPage.getTitle();
const url = myPage.getURL();
```

#### Element Interaction Methods

```typescript
// Wait for elements
await myPage.waitForElementVisible('css', '.loading-spinner');
await myPage.waitForElementHidden('id', 'loading');

// Element operations
await myPage.clickElement('testid', 'submit-btn');
await myPage.fillElement('css', '#username', 'testuser');
await myPage.selectOption('id', 'country', 'USA');

// Element queries
const isVisible = await myPage.isElementVisible('css', '.error-message');
const text = await myPage.getElementText('testid', 'status');
const count = await myPage.getElementCount('css', '.list-item');
```

---

## Element Management

### CSWebElement - Enhanced Element Class

The `CSWebElement` class provides advanced element interaction capabilities with AI healing.

#### Element Decorators

```typescript
import { CSGetElement } from './src/core/elements/decorators/CSGetElement';

export class LoginPage extends CSBasePage {
    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'username',
        description: 'Username input field',
        required: true,
        waitForVisible: true,
        aiEnabled: true,
        aiDescription: 'Username input field for authentication',
        fallbacks: [
            { locatorType: 'css', value: '[name="username"]' },
            { locatorType: 'css', value: '.username-input' }
        ]
    })
    usernameField!: CSWebElement;

    @CSGetElement({
        locatorType: 'css',
        locatorValue: 'button[type="submit"]',
        description: 'Submit button',
        waitForEnabled: true,
        aiEnabled: true,
        aiDescription: 'Submit or login button'
    })
    submitButton!: CSWebElement;
}
```

#### CSGetElementOptions Interface

```typescript
interface CSGetElementOptions {
    // Basic locators
    locatorType: 'css' | 'xpath' | 'id' | 'text' | 'role' | 'testid' | 'label' | 'placeholder' | 'alt' | 'title';
    locatorValue: string;
    description: string;
    
    // Text matching
    exact?: boolean;
    caseSensitive?: boolean;
    
    // Advanced options
    hasText?: string;
    hasNotText?: string;
    has?: CSGetElementOptions;
    hasNot?: CSGetElementOptions;
    filter?: CSGetElementOptions;
    
    // Layout selectors
    leftOf?: CSGetElementOptions;
    rightOf?: CSGetElementOptions;
    above?: CSGetElementOptions;
    below?: CSGetElementOptions;
    near?: CSGetElementOptions;
    maxDistance?: number;
    
    // Nth selectors
    nth?: number | 'first' | 'last';
    
    // Fallbacks
    fallbacks?: Array<{
        locatorType: string;
        value: string;
    }>;
    
    // AI options
    aiEnabled?: boolean;
    aiDescription?: string;
    aiConfidenceThreshold?: number;
    
    // Wait options
    waitTimeout?: number;
    waitForVisible?: boolean;
    waitForEnabled?: boolean;
    
    // Validation
    strict?: boolean;
    required?: boolean;
}
```

#### Element Methods

```typescript
// Basic interactions
await element.click();
await element.doubleClick();
await element.rightClick();
await element.hover();
await element.focus();

// Text input
await element.fill('text to enter');
await element.type('text to type slowly');
await element.clear();

// Form elements
await element.check();
await element.uncheck();
await element.selectOption('value');
await element.uploadFile(['file1.txt', 'file2.txt']);

// Element state
const isVisible = await element.isVisible();
const isEnabled = await element.isEnabled();
const isChecked = await element.isChecked();
const text = await element.getText();
const value = await element.getValue();

// Attributes and properties
const href = await element.getAttribute('href');
const color = await element.getCSSProperty('color');
const rect = await element.getBoundingBox();

// Advanced interactions
await element.scrollIntoView();
await element.highlight(2000); // Highlight for 2 seconds
const screenshot = await element.screenshot();
```

#### Element Waiting

```typescript
// Wait for states
await element.waitForVisible();
await element.waitForHidden();
await element.waitForEnabled();
await element.waitForDisabled();

// Wait for text
await element.waitForText('Expected text');
await element.waitForTextContaining('partial text');

// Wait for attributes
await element.waitForAttribute('class', 'active');
await element.waitForCSSProperty('opacity', '1');
```

### AI-Powered Self-Healing

The framework includes AI-powered self-healing for elements that fail to locate:

```typescript
// Enable AI healing on elements
@CSGetElement({
    locatorType: 'id',
    locatorValue: 'submit-btn',
    description: 'Submit button',
    aiEnabled: true,
    aiDescription: 'Submit button to save form',
    fallbacks: [
        { locatorType: 'css', value: 'button[type="submit"]' },
        { locatorType: 'css', value: '.submit-button' }
    ]
})
submitButton!: CSWebElement;
```

#### Configuration for AI Healing

```env
# Enable AI healing
AI_SELF_HEALING_ENABLED=true
AI_HEALING_MAX_ATTEMPTS=5
AI_HEALING_CONFIDENCE_THRESHOLD=0.7
AI_HEALING_CACHE_TIMEOUT=300000
AI_HEALING_STRATEGIES=nearby,similar-text,similar-attributes,parent-child,ai-identification
```

---

## Data Management

### CSDataProvider - Data Source Management

The framework supports multiple data sources with automatic encryption/decryption.

#### Supported Data Formats

- **CSV** - Comma-separated values
- **JSON** - JavaScript Object Notation  
- **Excel** - .xlsx files with multiple sheets
- **XML** - Extensible Markup Language

#### Basic Usage

```typescript
import { CSDataProvider } from './src/data/provider/CSDataProvider';

const dataProvider = CSDataProvider.getInstance();

// Load from different sources
const csvData = await dataProvider.loadData({
    type: 'csv',
    source: 'test-data/users.csv'
});

const jsonData = await dataProvider.loadData({
    type: 'json',
    source: 'test-data/api-test-data.json'
});

const excelData = await dataProvider.loadData({
    type: 'excel',
    source: 'test-data/test-cases.xlsx',
    sheet: 'TestData'
});
```

#### Data Filtering

```typescript
// Filter by execution flag
const activeData = await dataProvider.loadData({
    type: 'excel',
    source: 'test-data.xlsx',
    executionFlagColumn: 'Execute',
    executionFlag: 'Y'
});

// Custom filtering
const filteredData = await dataProvider.loadData({
    type: 'json',
    source: 'users.json',
    filter: { role: 'admin', status: 'active' }
});
```

#### Data Encryption

The framework automatically handles encrypted sensitive data:

```csv
username,password,api_key,email
admin,"ENCRYPTED:eyJlbmNyeXB0ZWQiOiJqS3hOaWVWVlJrb2t6MVNHcWFBdz09...","ENCRYPTED:eyJlbmNyeXB0ZWQiOiJyT0h2YjVGcW5QM2JUZ2JKWHRuRGZnPT0...",admin@example.com
```

```typescript
// Data is automatically decrypted when loaded
const userData = await dataProvider.loadData({
    type: 'csv',
    source: 'encrypted-users.csv'
});

// userData[0].password contains the decrypted password
// userData[0].api_key contains the decrypted API key
```

---

## API Testing

The framework provides comprehensive API testing capabilities with built-in step definitions.

### API Step Definitions

#### Request Configuration

```gherkin
# Set API context
Given user is working with "users" API

# Set base URL
Given user sets API base URL to "https://api.example.com"

# Set timeout
Given user sets API timeout to 60 seconds

# SSL validation
Given user disables SSL validation
Given user enables SSL validation
```

#### Request Headers and Authentication

```typescript
// In step definitions, use APIContext
@CSBDDStepDef('user sets header {string} to {string}')
async setHeader(headerName: string, headerValue: string): Promise<void> {
    const context = this.apiContextManager.getCurrentContext();
    context.setHeader(headerName, headerValue);
}

@CSBDDStepDef('user sets bearer token {string}')
async setBearerToken(token: string): Promise<void> {
    const context = this.apiContextManager.getCurrentContext();
    context.setHeader('Authorization', `Bearer ${token}`);
}
```

#### Request Execution

```gherkin
# HTTP methods
When user sends GET request to "/users"
When user sends POST request to "/users"
When user sends PUT request to "/users/123"
When user sends DELETE request to "/users/123"
```

#### Response Validation

```gherkin
# Status code validation
Then the response status code should be 200

# Response body validation
Then the response body should contain "success"

# JSON path validation
Then the response JSON path "$.data.id" should be "123"

# Response time validation
Then the response time should be less than 2000 ms
```

### API Context Management

```typescript
import { APIContextManager } from './src/api/context/APIContextManager';

// Get context manager
const contextManager = APIContextManager.getInstance();

// Create context
const context = contextManager.createContext('users');

// Set base URL and headers
context.setBaseUrl('https://api.example.com');
context.setHeader('Content-Type', 'application/json');
context.setTimeout(30000);

// Execute request
const response = await context.get('/users');
```

---

## Database Testing

### Database Step Definitions

#### Connection Management

```typescript
// In step definitions
@CSBDDStepDef('user connects to {string} database')
async connectToDatabase(databaseAlias: string): Promise<void> {
    await this.connectToDatabase(databaseAlias);
}

@CSBDDStepDef('user connects to {string} database with timeout {int} seconds')
async connectToDatabaseWithTimeout(databaseAlias: string, timeout: number): Promise<void> {
    await this.connectToDatabaseWithTimeout(databaseAlias, timeout);
}
```

#### Query Execution

```gherkin
# Execute queries
When user executes query "SELECT * FROM users WHERE status = 'active'"
When user runs query "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')"

# Execute and store results
When user executes query "SELECT COUNT(*) as total FROM users" and stores result as "userCount"
```

#### Data Validation

```gherkin
# Result validation
Then the query result should have 5 rows
Then the query result should have at least 1 row
Then the query result should be empty
```

### Database Configuration

```env
# config/dev.env
DATABASE_TYPE=sqlserver
DATABASE_HOST=localhost
DATABASE_PORT=1433
DATABASE_NAME=testdb
DATABASE_USERNAME=testuser
DATABASE_PASSWORD=ENCRYPTED:eyJlbmNyeXB0ZWQiOiJqS3hOaWVWVlJrb2t6MVNHcWFBdz09...
DATABASE_CONNECTION_TIMEOUT=30000
DATABASE_POOL_SIZE=10
```

### CSDatabase Usage

```typescript
import { CSDatabase } from './src/database/client/CSDatabase';

// Get database instance
const database = CSDatabase.getInstance('testdb');

// Connect
await database.connect();

// Execute query
const result = await database.query('SELECT * FROM users WHERE id = ?', [123]);

// Access results
console.log(`Found ${result.rowCount} rows`);
result.rows.forEach(row => {
    console.log(row);
});

// Close connection
await database.close();
```

---

## Configuration Management

### Environment-Based Configuration

The framework supports hierarchical configuration:

```
config/
├── common/
│   ├── framework.env      # Framework settings
│   └── security.env       # Security settings
├── myproject/
│   ├── common/
│   │   └── api.endpoints.env
│   └── environments/
│       ├── dev.env
│       ├── qa.env
│       └── prod.env
└── global.env            # Global overrides
```

### Configuration Loading

```typescript
// Load configuration for specific project and environment
await ConfigurationManager.loadConfiguration('myproject', 'dev');

// Legacy mode (environment only)
await ConfigurationManager.loadConfiguration('dev');
```

### Encryption Tool Usage

1. **Open the encryption tool**: `encryption-tool.html`
2. **Enter sensitive data**: Password, API key, token, etc.
3. **Click "Encrypt Data"**: No password needed
4. **Copy the result**: Starts with `ENCRYPTED:`
5. **Use in config files**: Replace plain text with encrypted value

```env
# Before
API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz

# After
API_KEY=ENCRYPTED:eyJlbmNyeXB0ZWQiOiJqS3hOaWVWVlJrb2t6MVNHcWFBdz09...
```

---

## Reporting & Logging

### ActionLogger - Test Action Logging

```typescript
import { ActionLogger } from './src/core/logging/ActionLogger';

const actionLogger = ActionLogger.getInstance();

// Log test actions
await actionLogger.logAction('user_login', {
    username: 'testuser',
    timestamp: new Date(),
    page: 'login'
});

// Log errors
await actionLogger.logError(new Error('Login failed'), {
    context: 'user_authentication',
    retry_attempt: 1
});

// Log database operations
await actionLogger.logDatabase('query_executed', 'SELECT * FROM users', 150, 5, {
    table: 'users'
});
```

### Built-in Logging

```typescript
import { logger } from './src/core/utils/Logger';

// Different log levels
logger.debug('Debug information');
logger.info('General information');
logger.warn('Warning message');
logger.error('Error occurred', error);

// Structured logging
logger.info('Test completed', {
    testName: 'login_test',
    duration: 5000,
    status: 'passed',
    browser: 'chromium'
});
```

---

## Advanced Features

### Memory Management

The framework includes automatic memory management:

```typescript
// Framework automatically manages memory
// Memory cleanup happens automatically during test execution
// You can monitor memory usage through framework status

const framework = CSFramework.getInstance();
const status = framework.getStatus();
console.log('Framework status:', status);
```

### Proxy Support

```env
# Enable proxy
PROXY_ENABLED=true
PROXY_SERVER=proxy.company.com
PROXY_PORT=8080
PROXY_USERNAME=proxyuser
PROXY_PASSWORD=ENCRYPTED:eyJlbmNyeXB0ZWQiOiJqS3hOaWVWVlJrb2t6MVNHcWFBdz09...
```

### Parallel Execution

```typescript
// Enable parallel execution
await framework.initialize('myproject', 'dev', {
    parallel: true,
    workers: 4
});

// Run tests in parallel
const result = await framework.executeTests(['test/features/**/*.feature'], {
    parallel: true,
    maxWorkers: 4
});
```

---

## Best Practices

### 1. Page Object Design

```typescript
// ✅ Good: Clear, focused page object
export class LoginPage extends CSBasePage {
    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'username',
        description: 'Username input field',
        required: true,
        aiEnabled: true,
        aiDescription: 'Username input for authentication'
    })
    usernameField!: CSWebElement;

    protected get pageUrl(): string {
        return 'https://example.com/login';
    }

    protected async waitForPageLoad(): Promise<void> {
        await this.waitForId('username', 30000);
    }

    async login(username: string, password: string): Promise<void> {
        await this.usernameField.fill(username);
        await this.passwordField.fill(password);
        await this.loginButton.click();
    }
}
```

### 2. Step Definition Organization

```typescript
// ✅ Good: Focused step definitions
@StepDefinitions
export class LoginSteps extends CSBDDBaseStepDefinition {
    private loginPage: LoginPage;

    constructor() {
        super();
        this.loginPage = new LoginPage();
    }

    @CSBDDStepDef('I login with username {string} and password {string}')
    async loginWithCredentials(username: string, password: string): Promise<void> {
        await this.loginPage.login(username, password);
    }
}
```

### 3. Error Handling

```typescript
// ✅ Good: Comprehensive error handling
@CSBDDStepDef('user submits the form')
async submitForm(): Promise<void> {
    try {
        await this.submitButton.click();
        await this.page.waitForLoadState('networkidle');
    } catch (error) {
        // Take screenshot for debugging
        await this.page.screenshot({ 
            path: `screenshots/error-${Date.now()}.png` 
        });
        
        // Log detailed error information
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logError(error as Error, {
            operation: 'form_submission',
            url: this.page.url(),
            timestamp: new Date().toISOString()
        });
        
        throw error;
    }
}
```

---

## Troubleshooting

### Common Issues

#### 1. Element Not Found

**Problem**: `Element not found: #submit-button`

**Solutions**:
```typescript
// Use explicit waits
await this.page.waitForSelector('#submit-button', { timeout: 10000 });

// Use fallback selectors
@CSGetElement({
    locatorType: 'id',
    locatorValue: 'submit-button',
    description: 'Submit button',
    fallbacks: [
        { locatorType: 'css', value: 'button[type="submit"]' },
        { locatorType: 'css', value: '.submit-btn' }
    ]
})
submitButton!: CSWebElement;

// Enable AI healing
@CSGetElement({
    locatorType: 'id',
    locatorValue: 'submit-button',
    description: 'Submit button',
    aiEnabled: true,
    aiDescription: 'Submit button to save form'
})
submitButton!: CSWebElement;
```

#### 2. Configuration Not Found

**Problem**: `Configuration key 'API_URL' not found`

**Solutions**:
```typescript
// Check configuration loading
await ConfigurationManager.loadConfiguration('myproject', 'dev');

// Use default values
const apiUrl = ConfigurationManager.get('API_URL', 'https://default-api.com');

// Verify configuration file exists
// config/myproject/dev.env should contain API_URL=...
```

#### 3. Data Provider Issues

**Problem**: `Failed to load data from test-data/users.csv`

**Solutions**:
```typescript
// Check file path
const data = await dataProvider.loadData({
    type: 'csv',
    source: path.resolve('test-data/users.csv') // Use absolute path
});

// Skip execution flag validation
const data = await dataProvider.loadData({
    type: 'csv',
    source: 'test-data/users.csv',
    skipExecutionFlag: true
});
```

### Debug Mode

```typescript
// Enable debug mode
await framework.initialize('myproject', 'dev', {
    debug: true,
    headless: false // See browser actions
});

// Enable verbose logging
logger.setLevel('debug');

// Take screenshots on failures
@After()
async afterScenario(scenario: any): Promise<void> {
    if (scenario.result.status === 'failed') {
        await this.page.screenshot({
            path: `screenshots/failed-${scenario.pickle.name}-${Date.now()}.png`
        });
    }
}
```

---

## Command Line Usage

### Basic Commands

```bash
# Run all tests
npx ts-node src/index.ts --environment=dev

# Run specific features
npx ts-node src/index.ts --features="test/features/login.feature" --environment=dev

# Run with specific tags
npx ts-node src/index.ts --tags="@smoke" --environment=dev

# Parallel execution
npx ts-node src/index.ts --parallel --workers=4 --environment=dev

# Debug mode
npx ts-node src/index.ts --debug --headed --environment=dev
```

### Advanced Options

```bash
# Custom configuration
npx ts-node src/index.ts \
  --project=myproject \
  --environment=qa \
  --features="test/features/**/*.feature" \
  --tags="@regression and not @slow" \
  --parallel \
  --workers=6 \
  --timeout=60000 \
  --retries=2 \
  --headed \
  --debug
```

---

## Conclusion

The CS Test Automation Framework provides a comprehensive solution for modern test automation needs. With its TypeScript-based architecture, BDD capabilities, advanced element management with AI healing, and built-in security through encryption, it enables teams to create maintainable, scalable, and reliable test suites.

Key benefits:
- **Type Safety**: Full TypeScript support with excellent IDE integration
- **AI-Powered**: Self-healing elements reduce maintenance overhead
- **Security First**: Built-in encryption for sensitive configuration data
- **Comprehensive**: UI, API, and database testing in one framework
- **Scalable**: Parallel execution and memory management
- **Developer Friendly**: Rich decorator system and intuitive APIs

For additional support or advanced use cases, refer to the framework source code and example test projects included in the repository. 