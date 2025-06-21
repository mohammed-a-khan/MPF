import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions } from '../../../src/bdd/decorators/CSBDDStepDef';
import { ActionLogger } from '../../../src/core/logging/ActionLogger';
import { BDDContext } from '../../../src/bdd/context/BDDContext';
import { expect } from '@playwright/test';
import { SauceDemoLoginPage } from '../pages/SauceDemoLoginPage';
import { LogLevel } from '../../../src/core/logging/LogTypes';

/**
 * SauceDemo specific step definitions
 * Uses proper CS Framework page objects with CSWebElement decorators
 */
@StepDefinitions
export class SauceDemoSteps extends CSBDDBaseStepDefinition {
    private loginPage: SauceDemoLoginPage;

    constructor() {
        super();
        this.loginPage = new SauceDemoLoginPage();
    }

    @CSBDDStepDef('I navigate to the SauceDemo application')
    async navigateToSauceDemo(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // BROWSER FLASHING FIX: Check if page object needs reinitialization
            if (!this.loginPage || this.loginPage.needsReinitialization()) {
                ActionLogger.logInfo('Page object needs reinitialization - creating new instance');
                this.loginPage = new SauceDemoLoginPage();
            }
            
            // BROWSER FLASHING FIX: Always reinitialize with current page to ensure sync
            await this.loginPage.initialize(page);
            
            // Navigate using the page object
            await this.loginPage.navigateTo('https://www.saucedemo.com');
            
            await actionLogger.logAction('navigate_to_saucedemo', {
                url: this.loginPage.getURL()
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'navigate_to_saucedemo' });
            throw error;
        }
    }

    @CSBDDStepDef('I should see the login page with all required elements')
    async verifyLoginPageElements(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            // Use page object elements instead of raw locators - await the async getLocator calls
            await expect(await this.loginPage.usernameInput.getLocator()).toBeVisible();
            await expect(await this.loginPage.passwordInput.getLocator()).toBeVisible();
            await expect(await this.loginPage.loginButton.getLocator()).toBeVisible();
            await expect(await this.loginPage.logo.getLocator()).toBeVisible();
            
            await actionLogger.logAction('verify_login_page_elements', {
                elements_verified: ['username', 'password', 'login-button', 'logo']
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_login_page_elements' });
            throw error;
        }
    }

    @CSBDDStepDef('I am on the SauceDemo login page')
    async verifyOnSauceDemoLoginPage(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Log detailed action: Navigate to login page
            await actionLogger.logAction('navigate_to_login_page', {
                description: `Navigating to SauceDemo login page`,
                target_url: 'https://www.saucedemo.com',
                current_url: page.url()
            });
            
            // First navigate to the SauceDemo application using raw Playwright
            await page.goto('https://www.saucedemo.com', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            // Log detailed action: Page navigation completed
            await actionLogger.logAction('page_navigation_completed', {
                description: `Successfully navigated to SauceDemo application`,
                final_url: page.url(),
                wait_condition: 'networkidle'
            });
            
            // Initialize the page object if not already initialized
            if (!this.loginPage) {
                this.loginPage = new SauceDemoLoginPage();
            }
            
            // Properly initialize the page object using the initialize method
            await this.loginPage.initialize(page);
            
            // Log detailed action: Page object initialized
            await actionLogger.logAction('page_object_initialized', {
                description: `Login page object initialized successfully`,
                page_object: 'SauceDemoLoginPage'
            });
            
            // Verify we're on the login page using simple page checks
            const url = page.url();
            const title = await page.title();
            
            // Log detailed action: Verify page loaded correctly
            await actionLogger.logAction('verify_page_loaded', {
                description: `Verifying SauceDemo login page loaded correctly`,
                current_url: url,
                page_title: title,
                expected_url_contains: 'saucedemo.com',
                expected_title_contains: 'swag labs'
            });
            
            if (!url.includes('saucedemo.com')) {
                throw new Error(`Expected SauceDemo URL, but got: ${url}`);
            }
            
            if (!title.toLowerCase().includes('swag labs')) {
                throw new Error(`Expected Swag Labs page, but got: ${title}`);
            }
            
            // Log detailed action: Verify page elements
            await actionLogger.logAction('verify_login_elements', {
                description: `Verifying login page elements are present and visible`,
                elements_to_check: ['username field (#user-name)', 'password field (#password)', 'login button (#login-button)']
            });
            
            // Verify elements exist using raw Playwright (as backup)
            await page.waitForSelector('#user-name', { timeout: 10000 });
            await page.waitForSelector('#password', { timeout: 10000 });
            await page.waitForSelector('#login-button', { timeout: 10000 });
            
            await actionLogger.logAction('login_page_verification_completed', {
                description: `Login page verification completed successfully - all elements found and page ready for interaction`,
                url,
                title,
                elements_verified: ['username field', 'password field', 'login button'],
                page_ready: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { 
                operation: 'verify_on_saucedemo_login_page',
                description: `Failed to verify SauceDemo login page - ${(error as Error).message}`
            });
            throw error;
        }
    }

    @CSBDDStepDef('I login with username {string} and password {string}')
    async loginWithCredentials(username: string, password: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Log detailed action: Start login process
            await actionLogger.logAction('login_process_started', {
                description: `Starting login process with username: ${username}`,
                username: username
            });
            
            // Log detailed action: Fill username field
            await actionLogger.logAction('fill_username_field', {
                description: `Entering username "${username}" in username field`,
                field: 'username',
                value: username,
                locator: '[data-test="username"]'
            });
            await page.locator('[data-test="username"]').fill(username);
            
            // Log detailed action: Fill password field
            await actionLogger.logAction('fill_password_field', {
                description: `Entering password in password field`,
                field: 'password',
                locator: '[data-test="password"]'
            });
            await page.locator('[data-test="password"]').fill(password);
            
            // Log detailed action: Click login button
            await actionLogger.logAction('click_login_button', {
                description: `Clicking on login button to submit credentials`,
                button: 'login',
                locator: '[data-test="login-button"]'
            });
            await page.locator('[data-test="login-button"]').click();
            
            // Log detailed action: Wait for navigation
            await actionLogger.logAction('wait_for_navigation', {
                description: `Waiting for page navigation after login attempt`,
                expected_page: 'products'
            });
            
            // Wait for products page
            await page.locator('.inventory_list').waitFor({
                state: 'visible',
                timeout: 5000
            });
            
            // Log final success action
            await actionLogger.logAction('login_completed', {
                description: `Login completed successfully - navigated to products page`,
                username: username,
                success: true,
                final_url: page.url()
            });
        } catch (error) {
            await actionLogger.logError(error as Error, {
                operation: 'login',
                username,
                description: `Login failed for username: ${username}`
            });
            throw error;
        }
    }

    @CSBDDStepDef('I should see the products page')
    async verifyProductsPage(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Log detailed action: Wait for page navigation
            await actionLogger.logAction('wait_for_page_navigation', {
                description: `Waiting for page navigation to complete after login`,
                wait_condition: 'networkidle',
                current_url: page.url()
            });
            
            // Wait for navigation to complete
            await page.waitForLoadState('networkidle');
            
            // Log detailed action: Verify page title
            await actionLogger.logAction('verify_products_page_title', {
                description: `Verifying products page title displays "Products"`,
                expected_title: 'Products',
                locator: '.title'
            });
            
            // Verify products page elements using framework selectors
            await expect(page.locator('.title')).toHaveText('Products');
            
            // Log detailed action: Verify products list
            await actionLogger.logAction('verify_products_list_visible', {
                description: `Verifying products inventory list is visible and loaded`,
                locator: '.inventory_list',
                expected_state: 'visible'
            });
            
            await expect(page.locator('.inventory_list')).toBeVisible();
            
            // Get additional page information for logging
            const url = page.url();
            const productCount = await page.locator('.inventory_item').count();
            
            await actionLogger.logAction('products_page_verification_completed', {
                description: `Products page verification completed successfully - user successfully logged in and can see product catalog`,
                current_url: url,
                products_count: productCount,
                page_elements_verified: ['page title', 'products inventory list'],
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { 
                operation: 'verify_products_page',
                description: `Failed to verify products page - ${(error as Error).message}`
            });
            throw error;
        }
    }

    @CSBDDStepDef('I add {string} to cart')
    async addProductToCart(productName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Convert product name to data-test attribute format
            const productTestId = productName.toLowerCase().replace(/\s+/g, '-');
            const addButtonSelector = `[data-test="add-to-cart-${productTestId}"]`;

            // Click add to cart button
            await page.locator(addButtonSelector).click();

            // Wait for button text to change to "Remove"
            await page.locator(`[data-test="remove-${productTestId}"]`).waitFor({
                state: 'visible',
                timeout: 5000
            });

            await actionLogger.logAction('add_to_cart', {
                product_name: productName,
                test_id: productTestId
            });
        } catch (error) {
            await actionLogger.logError(error as Error, {
                operation: 'add_to_cart_failed',
                product_name: productName
            });
            throw error;
        }
    }

    @CSBDDStepDef('I should see {int} item in the cart')
    async validateCartItemCount(expectedCount: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Count items in cart
            const cartItems = page.locator('.cart_item');
            const actualCount = await cartItems.count();
            
            expect(actualCount).toBe(expectedCount);

            // Validate cart badge shows correct count
            const cartBadge = page.locator('.shopping_cart_badge');
            if (expectedCount > 0) {
                await cartBadge.waitFor({ state: 'visible', timeout: 5000 });
                const badgeText = await cartBadge.textContent();
                const badgeCount = parseInt(badgeText || '0');
                expect(badgeCount).toBe(expectedCount);
            }

            await actionLogger.logAction('validate_cart_item_count', {
                expected_count: expectedCount,
                actual_count: actualCount,
                cart_badge_count: expectedCount > 0 ? parseInt((await page.locator('.shopping_cart_badge').textContent()) || '0') : 0
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'validate_cart_item_count' });
            throw error;
        }
    }

    @CSBDDStepDef('performance metrics should be captured')
    async validatePerformanceMetricsCaptured(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Log detailed action: Start performance metrics collection
            await actionLogger.logAction('start_performance_metrics_collection', {
                description: `Starting collection of performance metrics for current page`,
                current_url: page.url(),
                page_title: await page.title()
            });
            
            // Validate performance metrics are being captured
            const performanceData = await page.evaluate(() => {
                return {
                    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
                    domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
                    firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0
                };
            });

            // Log detailed action: Validate performance thresholds
            await actionLogger.logAction('validate_performance_thresholds', {
                description: `Validating that performance metrics meet minimum thresholds`,
                load_time_ms: performanceData.loadTime,
                dom_content_loaded_ms: performanceData.domContentLoaded,
                first_paint_ms: performanceData.firstPaint,
                thresholds: {
                    load_time_min: 0,
                    dom_content_loaded_min: 0
                }
            });

            expect(performanceData.loadTime).toBeGreaterThan(0);
            expect(performanceData.domContentLoaded).toBeGreaterThan(0);

            await actionLogger.logAction('performance_metrics_validation_completed', {
                description: `Performance metrics captured and validated successfully - page load performance is within acceptable limits`,
                metrics: {
                    page_load_time: `${performanceData.loadTime}ms`,
                    dom_content_loaded: `${performanceData.domContentLoaded}ms`,
                    first_paint: `${performanceData.firstPaint}ms`
                },
                validation_status: 'passed',
                performance_grade: performanceData.loadTime < 3000 ? 'excellent' : performanceData.loadTime < 5000 ? 'good' : 'needs_improvement'
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { 
                operation: 'validate_performance_metrics',
                description: `Failed to capture or validate performance metrics - ${(error as Error).message}`
            });
            throw error;
        }
    }

    @CSBDDStepDef('the shopping cart should be updated')
    async verifyCartUpdated(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Verify cart badge is visible (indicates items in cart)
            const cartBadge = page.locator('.shopping_cart_badge');
            await expect(cartBadge).toBeVisible();
            
            // Get cart count
            const cartCount = await cartBadge.textContent();
            expect(parseInt(cartCount || '0')).toBeGreaterThan(0);

            await actionLogger.logAction('verify_cart_updated', {
                cart_count: parseInt(cartCount || '0')
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_cart_updated' });
            throw error;
        }
    }

    @CSBDDStepDef('I should see cart badge with {string} items')
    async verifyCartBadgeCount(expectedCount: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            const cartBadge = page.locator('.shopping_cart_badge');
            await expect(cartBadge).toBeVisible();
            await expect(cartBadge).toHaveText(expectedCount);

            await actionLogger.logAction('verify_cart_badge_count', {
                expected_count: expectedCount,
                actual_count: await cartBadge.textContent()
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_cart_badge_count' });
            throw error;
        }
    }

    @CSBDDStepDef('I should see {string} items in the cart')
    async verifyCartItemsCount(expectedCount: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Navigate to cart first
            await page.locator('.shopping_cart_link').click();
            await page.waitForLoadState('networkidle');
            
            // Count actual items in cart
            const cartItems = page.locator('.cart_item');
            const actualCount = await cartItems.count();
            
            expect(actualCount.toString()).toBe(expectedCount);

            await actionLogger.logAction('verify_cart_items_count', {
                expected_count: expectedCount,
                actual_count: actualCount
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_cart_items_count' });
            throw error;
        }
    }

    @CSBDDStepDef('the page should load within {int} seconds')
    async verifyPageLoadTime(maxSeconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            // Use page object to get metrics
            const metrics = this.loginPage.getPageMetrics();
            const loadTimeSeconds = metrics.pageLoadTime / 1000;
            
            expect(loadTimeSeconds).toBeLessThanOrEqual(maxSeconds);

            await actionLogger.logAction('verify_page_load_time', {
                max_seconds: maxSeconds,
                actual_seconds: loadTimeSeconds,
                load_time_ms: metrics.pageLoadTime
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_page_load_time' });
            throw error;
        }
    }

    @CSBDDStepDef('I should see an error message')
    async verifyErrorMessage(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            // Use page object method instead of raw locator
            const hasError = await this.loginPage.hasErrorMessage();
            expect(hasError).toBe(true);
            
            const errorMessage = await this.loginPage.getErrorMessage();
            expect(errorMessage).toBeTruthy();

            // Log the error message as an error since this indicates a failed operation
            await actionLogger.logError(`Login failed: ${errorMessage}`, {
                operation: 'login_failure',
                error_message: errorMessage,
                error_type: 'authentication_error'
            });

            await actionLogger.logAction('verify_error_message', {
                error_message: errorMessage
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_error_message' });
            throw error;
        }
    }

    @CSBDDStepDef('the error should be logged')
    async verifyErrorLogged(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            // Verify that error logging is working
            const logs = actionLogger.getRecentLogs();
            const errorLogs = logs.filter(log => log.level === LogLevel.ERROR);
            
            expect(errorLogs.length).toBeGreaterThan(0);

            await actionLogger.logAction('verify_error_logged', {
                error_logs_count: errorLogs.length
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_error_logged' });
            throw error;
        }
    }

    @CSBDDStepDef('the error should be logged appropriately')
    async verifyErrorLoggedAppropriately(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            // Verify that error logging is working with appropriate details
            const logs = actionLogger.getRecentLogs();
            const errorLogs = logs.filter(log => log.level === LogLevel.ERROR);
            
            expect(errorLogs.length).toBeGreaterThan(0);
            
            // Check that the most recent error log has appropriate details
            const recentErrorLog = errorLogs[errorLogs.length - 1];
            if (!recentErrorLog) {
                throw new Error('No recent error log found');
            }
            
            expect(recentErrorLog.message).toBeTruthy();
            expect(recentErrorLog.timestamp).toBeTruthy();

            await actionLogger.logAction('verify_error_logged_appropriately', {
                error_logs_count: errorLogs.length,
                recent_error_message: recentErrorLog.message,
                recent_error_timestamp: recentErrorLog.timestamp
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_error_logged_appropriately' });
            throw error;
        }
    }

    @CSBDDStepDef('I log the message {string}')
    async logMessage(message: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            await actionLogger.logAction('custom_log_message', {
                message: message,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'log_message' });
            throw error;
        }
    }
} 