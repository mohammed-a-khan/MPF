import { Page } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { CSWebElement } from '../elements/CSWebElement';
import { ElementMetadata } from '../elements/decorators/ElementMetadata';
import { PageContext } from './PageContext';
import { WaitOptions, ValidationError } from './types/page.types';
import { expect } from '@playwright/test';

/**
 * CSBasePage - Base class for all page objects
 * Provides common functionality and element management
 */
export abstract class CSBasePage {
    protected page!: Page;
    protected context!: PageContext;
    private _initialized: boolean = false;
    private _pageLoadTime: number = 0;
    private _validationErrors: ValidationError[] = [];

    /**
     * Get page URL - must be implemented by child classes
     */
    protected abstract get pageUrl(): string;

    /**
     * Wait for page to be ready - must be implemented by child classes
     */
    protected abstract waitForPageLoad(): Promise<void>;

    /**
     * Custom page initialization - optional override
     */
    protected async onPageReady(): Promise<void> {
        // Override in child classes if needed
    }

    /**
     * Initialize the page object
     */
    async initialize(page: Page): Promise<void> {
        if (this._initialized) {
            logger.warn(`${this.constructor.name}: Already initialized`);
            return;
        }

        const startTime = Date.now();

        try {
            this.page = page;
            this.context = new PageContext(page);
            
            // Initialize all decorated elements
            this.initializeElements();
            
            // Wait for page to be ready
            await this.waitForPageLoad();
            
            // Record load time
            this._pageLoadTime = Date.now() - startTime;
            this.context.recordMetric('pageLoadTime', this._pageLoadTime);
            
            // Custom initialization
            await this.onPageReady();
            
            this._initialized = true;
            
            ActionLogger.logPageOperation('page_initialized', this.constructor.name, {
                url: this.page.url(),
                loadTime: this._pageLoadTime
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Initialization failed`, error as Error);
            throw error;
        }
    }

    /**
     * Navigate to this page
     */
    async navigateTo(url?: string): Promise<void> {
        try {
            const targetUrl = url || this.pageUrl;
            
            if (!targetUrl) {
                throw new Error('No URL specified for navigation');
            }
            
            const startTime = Date.now();
            
            await this.page.goto(targetUrl, {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            // Wait for page load without re-initializing
            await this.waitForPageLoad();
            
            const navigationTime = Date.now() - startTime;
            
            ActionLogger.logPageOperation('page_navigate', this.constructor.name, {
                url: targetUrl,
                navigationTime
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Navigation failed`, error as Error);
            throw error;
        }
    }

    /**
     * Reload the page
     */
    async reload(): Promise<void> {
        try {
            const startTime = Date.now();
            
            await this.page.reload({
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            // Re-initialize after reload
            await this.initialize(this.page);
            
            const reloadTime = Date.now() - startTime;
            
            ActionLogger.logPageOperation('page_reload', this.constructor.name, {
                reloadTime
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Reload failed`, error as Error);
            throw error;
        }
    }

    /**
     * Go back in browser history
     */
    async goBack(): Promise<void> {
        try {
            await this.page.goBack({
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            ActionLogger.logPageOperation('page_back', this.constructor.name);
        } catch (error) {
            logger.error(`${this.constructor.name}: Go back failed`, error as Error);
            throw error;
        }
    }

    /**
     * Go forward in browser history
     */
    async goForward(): Promise<void> {
        try {
            await this.page.goForward({
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            ActionLogger.logPageOperation('page_forward', this.constructor.name);
        } catch (error) {
            logger.error(`${this.constructor.name}: Go forward failed`, error as Error);
            throw error;
        }
    }

    /**
     * Get page title
     */
    async getTitle(): Promise<string> {
        try {
            const title = await this.page.title();
            
            ActionLogger.logPageOperation('page_get_title', this.constructor.name, {
                title
            });
            
            return title;
        } catch (error) {
            logger.error(`${this.constructor.name}: Failed to get title`, error as Error);
            throw error;
        }
    }

    /**
     * Get current URL
     */
    getURL(): string {
        return this.page.url();
    }

    /**
     * Take page screenshot
     */
    async takeScreenshot(name: string): Promise<void> {
        try {
            const screenshotPath = `./screenshots/${this.constructor.name}_${name}_${Date.now()}.png`;
            
            await this.page.screenshot({
                path: screenshotPath,
                fullPage: true
            });
            
            ActionLogger.logPageOperation('page_screenshot', this.constructor.name, {
                path: screenshotPath
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Screenshot failed`, error as Error);
            throw error;
        }
    }

    /**
     * Wait for specific load state
     */
    async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<void> {
        try {
            await this.page.waitForLoadState(state, {
                timeout: 60000
            });
            
            ActionLogger.logPageOperation('page_wait_load_state', this.constructor.name, {
                state
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Wait for load state failed`, error as Error);
            throw error;
        }
    }

    /**
     * Wait for URL to match
     */
    async waitForURL(url: string | RegExp, options?: WaitOptions): Promise<void> {
        try {
            await this.page.waitForURL(url, {
                timeout: options?.timeout || 30000,
                waitUntil: options?.waitUntil || 'networkidle'
            });
            
            ActionLogger.logPageOperation('page_wait_url', this.constructor.name, {
                url: url.toString()
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Wait for URL failed`, error as Error);
            throw error;
        }
    }

    /**
     * Check if this is the current page
     */
    async isCurrentPage(): Promise<boolean> {
        try {
            const currentUrl = this.page.url();
            const expectedUrl = this.pageUrl;
            
            // Basic URL matching - can be overridden for complex logic
            const isMatch = currentUrl.includes(expectedUrl);
            
            ActionLogger.logPageOperation('page_check_current', this.constructor.name, {
                currentUrl,
                expectedUrl,
                isMatch
            });
            
            return isMatch;
        } catch (error) {
            logger.error(`${this.constructor.name}: Failed to check current page`, error as Error);
            throw error;
        }
    }

    /**
     * Wait for element to be ready
     */
    async waitForElement(element: CSWebElement, options?: WaitOptions): Promise<void> {
        try {
            await element.waitFor({
                state: options?.state || 'visible',
                timeout: options?.timeout || 30000
            });
            
            ActionLogger.logPageOperation('page_wait_element', this.constructor.name, {
                element: element.description
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Wait for element failed`, error as Error);
            throw error;
        }
    }

    /**
     * Scroll to element
     */
    async scrollToElement(element: CSWebElement): Promise<void> {
        try {
            await element.scrollIntoView();
            
            ActionLogger.logPageOperation('page_scroll_to_element', this.constructor.name, {
                element: element.description
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Scroll to element failed`, error as Error);
            throw error;
        }
    }

    /**
     * Highlight element for debugging
     */
    async highlightElement(element: CSWebElement, duration: number = 2000): Promise<void> {
        try {
            await this.page.evaluate(
                ({ selector, duration }) => {
                    const el = document.querySelector(selector);
                    if (el) {
                        const originalStyle = el.getAttribute('style') || '';
                        el.setAttribute('style', `${originalStyle}; border: 3px solid #93186C !important; background-color: rgba(147, 24, 108, 0.1) !important;`);
                        
                        setTimeout(() => {
                            el.setAttribute('style', originalStyle);
                        }, duration);
                    }
                },
                { 
                    selector: element.options.locatorValue, 
                    duration 
                }
            );
            
            ActionLogger.logPageOperation('page_highlight_element', this.constructor.name, {
                element: element.description,
                duration
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Highlight element failed`, error as Error);
            // Non-critical error, don't throw
        }
    }

    /**
     * Validate page state
     */
    async validatePage(): Promise<boolean> {
        try {
            this._validationErrors = [];
            
            // Check if we're on the correct page
            const isCorrectPage = await this.isCurrentPage();
            if (!isCorrectPage) {
                this._validationErrors.push({
                    field: 'url',
                    message: 'Not on expected page',
                    severity: 'high'
                });
            }
            
            // Check all required elements are present
            const elements = ElementMetadata.getAll(this.constructor.name);
            for (const [propertyName, options] of Array.from(elements.entries())) {
                try {
                    const element = (this as any)[propertyName] as CSWebElement;
                    const isPresent = await element.isPresent();
                    
                    if (!isPresent && options.required) {
                        this._validationErrors.push({
                            field: propertyName,
                            message: `Required element '${options.description}' not found`,
                            severity: 'high'
                        });
                    }
                } catch (error) {
                    this._validationErrors.push({
                        field: propertyName,
                        message: `Error checking element '${options.description}': ${error}`,
                        severity: 'medium'
                    });
                }
            }
            
            // Run custom validation if implemented
            await this.customValidation();
            
            const isValid = this._validationErrors.filter(e => e.severity === 'high').length === 0;
            
            ActionLogger.logPageOperation('page_validate', this.constructor.name, {
                valid: isValid,
                errors: this._validationErrors.length
            });
            
            return isValid;
        } catch (error) {
            logger.error(`${this.constructor.name}: Validation failed`, error as Error);
            throw error;
        }
    }

    /**
     * Get validation errors
     */
    getValidationErrors(): ValidationError[] {
        return [...this._validationErrors];
    }

    /**
     * Custom validation - override in child classes
     */
    protected async customValidation(): Promise<void> {
        // Override in child classes to add custom validation
    }

    /**
     * Get page metrics
     */
    getMetrics(): any {
        return this.context.getMetrics();
    }

    /**
     * Execute action with retry
     */
    protected async executeWithRetry<T>(
        action: () => Promise<T>,
        retries: number = 3,
        delay: number = 1000
    ): Promise<T> {
        let lastError: Error | null = null;
        
        for (let i = 0; i < retries; i++) {
            try {
                return await action();
            } catch (error) {
                lastError = error as Error;
                logger.warn(`${this.constructor.name}: Retry ${i + 1}/${retries} after error:`, { error });
                
                if (i < retries - 1) {
                    await this.page.waitForTimeout(delay);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Wait for page to be stable (no network activity)
     */
    protected async waitForPageStability(timeout: number = 5000): Promise<void> {
        const startTime = Date.now();
        let lastRequestTime = Date.now();
        
        // Monitor network requests
        const requestHandler = () => {
            lastRequestTime = Date.now();
        };
        
        this.page.on('request', requestHandler);
        
        try {
            // Wait until no requests for specified time
            while (Date.now() - startTime < timeout) {
                if (Date.now() - lastRequestTime > 1000) {
                    // No requests for 1 second, consider stable
                    break;
                }
                await this.page.waitForTimeout(100);
            }
        } finally {
            this.page.off('request', requestHandler);
        }
    }

    // Private methods

    private initializeElements(): void {
        // Elements are now initialized by the @CSGetElement decorator
        // This method is kept for compatibility but no longer needed
        // The decorator handles element creation automatically when accessed
        
        ActionLogger.logPageOperation('page_elements_ready', this.constructor.name, {
            elementCount: ElementMetadata.getAll(this.constructor.name).size
        });
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        try {
            this._initialized = false;
            
            ActionLogger.logPageOperation('page_cleanup', this.constructor.name);
        } catch (error) {
            logger.error(`${this.constructor.name}: Cleanup failed`, error as Error);
        }
    }

    // ============================================================================
    // GENERIC ELEMENT METHODS - Use these instead of raw Playwright locators
    // ============================================================================

    /**
     * Create a temporary CSWebElement for one-time operations
     * Use this instead of page.locator()
     */
    protected createElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, description?: string): CSWebElement {
        return CSWebElement.createDynamic(this.page, {
            locatorType,
            locatorValue,
            description: description || `Dynamic element: ${locatorValue}`,
            waitForVisible: false,
            waitForEnabled: false,
            waitTimeout: 30000,
            required: false,
            aiEnabled: false,
            aiDescription: '',
            aiConfidenceThreshold: 0.8,
            fallbacks: []
        });
    }

    /**
     * Find element by CSS selector
     */
    protected findByCSS(selector: string, description?: string): CSWebElement {
        return this.createElement('css', selector, description);
    }

    /**
     * Find element by XPath
     */
    protected findByXPath(xpath: string, description?: string): CSWebElement {
        return this.createElement('xpath', xpath, description);
    }

    /**
     * Find element by ID
     */
    protected findById(id: string, description?: string): CSWebElement {
        return this.createElement('id', id, description);
    }

    /**
     * Find element by test ID (data-testid)
     */
    protected findByTestId(testId: string, description?: string): CSWebElement {
        return this.createElement('testid', testId, description);
    }

    /**
     * Find element by text content
     */
    protected findByText(text: string, description?: string): CSWebElement {
        return this.createElement('css', `text="${text}"`, description);
    }

    /**
     * Find element by partial text content
     */
    protected findByPartialText(text: string, description?: string): CSWebElement {
        return this.createElement('css', `text*="${text}"`, description);
    }

    /**
     * Find element by aria-label
     */
    protected findByAriaLabel(label: string, description?: string): CSWebElement {
        return this.createElement('css', `[aria-label="${label}"]`, description);
    }

    /**
     * Find element by role
     */
    protected findByRole(role: string, description?: string): CSWebElement {
        return this.createElement('css', `[role="${role}"]`, description);
    }

    /**
     * Find element by placeholder
     */
    protected findByPlaceholder(placeholder: string, description?: string): CSWebElement {
        return this.createElement('css', `[placeholder="${placeholder}"]`, description);
    }

    /**
     * Find element by title attribute
     */
    protected findByTitle(title: string, description?: string): CSWebElement {
        return this.createElement('css', `[title="${title}"]`, description);
    }

    /**
     * Find element by data attribute
     */
    protected findByDataAttribute(attribute: string, value: string, description?: string): CSWebElement {
        return this.createElement('css', `[data-${attribute}="${value}"]`, description);
    }

    /**
     * Wait for element to be visible using framework methods
     * Use this instead of page.waitForSelector()
     */
    protected async waitForElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'visible', timeout });
    }

    /**
     * Wait for element to be hidden
     */
    protected async waitForElementHidden(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'hidden', timeout });
    }

    /**
     * Wait for element to be attached to DOM
     */
    protected async waitForElementAttached(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'attached', timeout });
    }

    /**
     * Wait for element to be detached from DOM
     */
    protected async waitForElementDetached(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'detached', timeout });
    }

    /**
     * Check if element exists using framework methods
     * Use this instead of page.locator().count()
     */
    protected async elementExists(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<boolean> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.isPresent();
    }

    /**
     * Get element count using framework methods
     */
    protected async getElementCount(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<number> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getCount();
    }

    /**
     * Check if element is visible
     */
    protected async isElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<boolean> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.isVisible();
    }

    /**
     * Check if element is enabled
     */
    protected async isElementEnabled(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<boolean> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.isEnabled();
    }

    /**
     * Get element text content
     */
    protected async getElementText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<string> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getText();
    }

    /**
     * Click element using framework methods
     */
    protected async clickElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.click();
    }

    /**
     * Fill element using framework methods
     */
    protected async fillElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, text: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.fill(text);
    }

    /**
     * Type into element using framework methods
     */
    protected async typeIntoElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, text: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.type(text);
    }

    /**
     * Clear element using framework methods
     */
    protected async clearElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.clear();
    }

    /**
     * Hover over element using framework methods
     */
    protected async hoverElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.hover();
    }

    /**
     * Double click element using framework methods
     */
    protected async doubleClickElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.doubleClick();
    }

    /**
     * Right click element using framework methods
     */
    protected async rightClickElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.rightClick();
    }

    /**
     * Select option from dropdown using framework methods
     */
    protected async selectOption(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, value: string | string[]): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.selectOption(value);
    }

    /**
     * Check checkbox/radio using framework methods
     */
    protected async checkElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.check();
    }

    /**
     * Uncheck checkbox using framework methods
     */
    protected async uncheckElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.uncheck();
    }

    /**
     * Upload file using framework methods
     */
    protected async uploadFile(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, files: string | string[]): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.upload(files);
    }

    /**
     * Take screenshot of element using framework methods
     */
    protected async screenshotElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<Buffer> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.screenshot();
    }

    /**
     * Scroll element into view using framework methods
     */
    protected async scrollElementIntoView(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.scrollIntoView();
    }

    /**
     * Get element attribute using framework methods
     */
    protected async getElementAttribute(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, attributeName: string): Promise<string | null> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getAttribute(attributeName);
    }

    /**
     * Get element CSS property using framework methods
     */
    protected async getElementCSSProperty(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, property: string): Promise<string> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getCSSProperty(property);
    }

    /**
     * Assert element text using framework methods
     */
    protected async assertElementText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, expectedText: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.assertText(expectedText);
    }

    /**
     * Assert element is visible using framework methods
     */
    protected async assertElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.assertVisible();
    }

    /**
     * Assert element is hidden using framework methods
     */
    protected async assertElementHidden(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.assertHidden();
    }

    // ============================================================================
    // CONVENIENCE METHODS - Shortcuts for common operations
    // ============================================================================

    /**
     * Quick click by CSS selector
     */
    protected async clickByCSS(selector: string): Promise<void> {
        await this.clickElement('css', selector);
    }

    /**
     * Quick click by ID
     */
    protected async clickById(id: string): Promise<void> {
        await this.clickElement('id', id);
    }

    /**
     * Quick click by test ID
     */
    protected async clickByTestId(testId: string): Promise<void> {
        await this.clickElement('testid', testId);
    }

    /**
     * Quick fill by CSS selector
     */
    protected async fillByCSS(selector: string, text: string): Promise<void> {
        await this.fillElement('css', selector, text);
    }

    /**
     * Quick fill by ID
     */
    protected async fillById(id: string, text: string): Promise<void> {
        await this.fillElement('id', id, text);
    }

    /**
     * Quick fill by test ID
     */
    protected async fillByTestId(testId: string, text: string): Promise<void> {
        await this.fillElement('testid', testId, text);
    }

    /**
     * Quick wait for element visible by CSS
     */
    protected async waitForCSS(selector: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('css', selector, timeout);
    }

    /**
     * Quick wait for element visible by ID
     */
    protected async waitForId(id: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('id', id, timeout);
    }

    /**
     * Quick wait for element visible by test ID
     */
    protected async waitForTestId(testId: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('testid', testId, timeout);
    }

    /**
     * Quick check if element exists by CSS
     */
    protected async existsByCSS(selector: string): Promise<boolean> {
        return await this.elementExists('css', selector);
    }

    /**
     * Quick check if element exists by ID
     */
    protected async existsById(id: string): Promise<boolean> {
        return await this.elementExists('id', id);
    }

    /**
     * Quick check if element exists by test ID
     */
    protected async existsByTestId(testId: string): Promise<boolean> {
        return await this.elementExists('testid', testId);
    }

    /**
     * Quick get text by CSS selector
     */
    protected async getTextByCSS(selector: string): Promise<string> {
        return await this.getElementText('css', selector);
    }

    /**
     * Quick get text by ID
     */
    protected async getTextById(id: string): Promise<string> {
        return await this.getElementText('id', id);
    }

    /**
     * Quick get text by test ID
     */
    protected async getTextByTestId(testId: string): Promise<string> {
        return await this.getElementText('testid', testId);
    }

    // ============================================================================
    // ASSERTION METHODS - Integration with Playwright expect
    // ============================================================================

    /**
     * Assert element text using Playwright expect (for step definitions)
     */
    protected async expectElementText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, expectedText: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        const locator = await element.getLocator();
        await expect(locator).toHaveText(expectedText);
    }

    /**
     * Assert element is visible using Playwright expect
     */
    protected async expectElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        const locator = await element.getLocator();
        await expect(locator).toBeVisible();
    }

    /**
     * Assert element count using Playwright expect
     */
    protected async expectElementCount(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, count: number): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        const locator = await element.getLocator();
        await expect(locator).toHaveCount(count);
    }

    /**
     * Quick expect by CSS selector
     */
    protected async expectCSS(selector: string, expectedText: string): Promise<void> {
        await this.expectElementText('css', selector, expectedText);
    }

    /**
     * Quick expect visible by CSS
     */
    protected async expectCSSVisible(selector: string): Promise<void> {
        await this.expectElementVisible('css', selector);
    }

    /**
     * Quick expect by test ID
     */
    protected async expectTestId(testId: string, expectedText: string): Promise<void> {
        await this.expectElementText('testid', testId, expectedText);
    }

    /**
     * Quick expect visible by test ID
     */
    protected async expectTestIdVisible(testId: string): Promise<void> {
        await this.expectElementVisible('testid', testId);
    }

    /**
     * Wait for element with specific text to be visible
     */
    protected async waitForElementWithText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, text: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitForText(text, timeout);
    }

    /**
     * Get element by data-test attribute (common in modern web apps)
     */
    protected findByDataTest(value: string, description?: string): CSWebElement {
        return this.createElement('css', `[data-test="${value}"]`, description);
    }

    /**
     * Click element by data-test attribute
     */
    protected async clickByDataTest(value: string): Promise<void> {
        await this.clickElement('css', `[data-test="${value}"]`);
    }

    /**
     * Wait for element by data-test attribute
     */
    protected async waitForDataTest(value: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('css', `[data-test="${value}"]`, timeout);
    }

    /**
     * Check if element exists by data-test attribute
     */
    protected async existsByDataTest(value: string): Promise<boolean> {
        return await this.elementExists('css', `[data-test="${value}"]`);
    }

    /**
     * Get text by data-test attribute
     */
    protected async getTextByDataTest(value: string): Promise<string> {
        return await this.getElementText('css', `[data-test="${value}"]`);
    }

    /**
     * Assert element text by data-test attribute
     */
    protected async expectDataTest(value: string, expectedText: string): Promise<void> {
        await this.expectElementText('css', `[data-test="${value}"]`, expectedText);
    }

    /**
     * Assert element visible by data-test attribute
     */
    protected async expectDataTestVisible(value: string): Promise<void> {
        await this.expectElementVisible('css', `[data-test="${value}"]`);
    }
}