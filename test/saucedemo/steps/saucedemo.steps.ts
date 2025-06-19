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
            
            // Initialize the page object with the current page
            await this.loginPage.initialize(page);
            
            // Navigate using the page object
            await this.loginPage.navigateTo();
            
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
            
            // First navigate to the SauceDemo application using raw Playwright
            await page.goto('https://www.saucedemo.com', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            // Properly initialize the page object using the initialize method
            await this.loginPage.initialize(page);
            
            // Verify we're on the login page using simple page checks
            const url = page.url();
            const title = await page.title();
            
            if (!url.includes('saucedemo.com')) {
                throw new Error(`Expected SauceDemo URL, but got: ${url}`);
            }
            
            if (!title.toLowerCase().includes('swag labs')) {
                throw new Error(`Expected Swag Labs page, but got: ${title}`);
            }
            
            // Verify elements exist using raw Playwright (as backup)
            await page.waitForSelector('#user-name', { timeout: 10000 });
            await page.waitForSelector('#password', { timeout: 10000 });
            await page.waitForSelector('#login-button', { timeout: 10000 });
            
            await actionLogger.logAction('verify_on_saucedemo_login_page', {
                url,
                title,
                elements_verified: ['username', 'password', 'login-button']
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_on_saucedemo_login_page' });
            throw error;
        }
    }

    @CSBDDStepDef('I login with username {string} and password {string}')
    async loginWithCredentials(username: string, password: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            // Use page object method instead of raw locators
            await this.loginPage.login(username, password);
            
            await actionLogger.logAction('login_attempt', {
                username,
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, {
                operation: 'login',
                username
            });
            throw error;
        }
    }

    @CSBDDStepDef('I should see the products page')
    async verifyProductsPage(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Wait for navigation to complete
            await page.waitForLoadState('networkidle');
            
            // Verify products page elements using framework selectors
            await expect(page.locator('.title')).toHaveText('Products');
            await expect(page.locator('.inventory_list')).toBeVisible();
            
            await actionLogger.logAction('verify_products_page', {
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_products_page' });
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
            
            // Validate performance metrics are being captured
            const performanceData = await page.evaluate(() => {
                return {
                    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
                    domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
                    firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0
                };
            });

            expect(performanceData.loadTime).toBeGreaterThan(0);
            expect(performanceData.domContentLoaded).toBeGreaterThan(0);

            await actionLogger.logAction('performance_metrics_captured', performanceData);
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'validate_performance_metrics' });
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