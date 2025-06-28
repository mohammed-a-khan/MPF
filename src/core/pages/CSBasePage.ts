import { Page, Locator, Download, ElementHandle } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { CSWebElement } from '../elements/CSWebElement';
import { ElementMetadata } from '../elements/decorators/ElementMetadata';
import { PageContext } from './PageContext';
import { WaitOptions, ValidationError } from './types/page.types';
import { expect } from '@playwright/test';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import { BDDContext } from '../../bdd/context/BDDContext';

interface NavigationOptions {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
}

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
     * Wait for a specific URL pattern
     * @param urlPattern - URL string or regex pattern to wait for
     * @param options - Wait options
     */
    async waitForURL(urlPattern: string | RegExp, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
        await this.currentPage.waitForURL(urlPattern, options);
    }

    /**
     * Wait for the page to reach a specific load state
     * @param state - The load state to wait for
     * @param options - Wait options
     */
    async waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle', options?: { timeout?: number }): Promise<void> {
        await this.currentPage.waitForLoadState(state, options);
    }

    /**
     * Get the current page instance
     */
    public get currentPage(): Page {
        return this.page;
    }

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
        // Always reinitialize if page has changed
        if (this._initialized && this.page === page) {
            logger.warn(`${this.constructor.name}: Already initialized with same page`);
            return;
        }

        const startTime = Date.now();

        try {
            // If reinitializing with a new page, clear element cache first
            if (this._initialized && this.page !== page) {
                logger.debug(`${this.constructor.name}: Reinitializing with new page - clearing element cache`);
                this.clearElementCache();
            }
            
            this.page = page;
            this.context = new PageContext(page);
            
            // Initialize all decorated elements
            this.initializeElements();
            
            // Note: Browser maximization is now handled in PageFactory.createPage()
            // This ensures consistent maximization for both new-per-scenario and reuse-browser strategies
            
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
        const actionLogger = ActionLogger.getInstance();
        const targetUrl = url || this.pageUrl;
        
        await actionLogger.logAction('Page Navigation', { 
            description: `Navigating to ${this.constructor.name} page`,
            url: targetUrl,
            pageName: this.constructor.name,
            details: `Opening ${this.constructor.name} at ${targetUrl}`
        });
        
        try {
            if (!targetUrl) {
                throw new Error('No URL specified for navigation');
            }
            
            // Use currentPage getter which will get the latest page
            const page = this.currentPage;
            
            // Check if the page is closed before attempting any operation
            if (page.isClosed()) {
                throw new Error('Cannot navigate - page has been closed. Page object needs to be reinitialized with a valid page.');
            }
            
            // Check if we're already on the target URL to avoid unnecessary navigation
            const currentUrl = page.url();
            if (currentUrl === targetUrl) {
                logger.debug(`Already on target URL: ${targetUrl}`);
                await this.waitForPageLoad();
                return;
            }
            
            const startTime = Date.now();
            
            await page.goto(targetUrl, {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            // Wait for page load without re-initializing
            await this.waitForPageLoad();
            
            const navigationTime = Date.now() - startTime;
            
            await actionLogger.logAction('Navigation Success', { 
                description: `Successfully navigated to ${this.constructor.name}`,
                url: targetUrl,
                pageName: this.constructor.name,
                navigationTime: navigationTime,
                details: `${this.constructor.name} loaded successfully in ${navigationTime}ms`
            });
            
            ActionLogger.logPageOperation('page_navigate', this.constructor.name, {
                url: targetUrl,
                navigationTime
            });
        } catch (error) {
            await actionLogger.logAction('Navigation Failed', { 
                description: `Failed to navigate to ${this.constructor.name}`,
                url: targetUrl,
                pageName: this.constructor.name,
                error: (error as Error).message,
                details: `Navigation to ${this.constructor.name} failed: ${(error as Error).message}`
            });
            
            logger.error(`${this.constructor.name}: Navigation failed`, error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Reload the page
     */
    async reload(): Promise<void> {
        try {
            const startTime = Date.now();
            
            await this.currentPage.reload({
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
            // Re-initialize after reload
            await this.initialize(this.currentPage);
            
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
            await this.currentPage.goBack({
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
            await this.currentPage.goForward({
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
            const title = await this.currentPage.title();
            
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
        return this.currentPage.url();
    }

    /**
     * Take page screenshot
     */
    async takeScreenshot(name: string): Promise<void> {
        try {
            const screenshotPath = `./screenshots/${this.constructor.name}_${name}_${Date.now()}.png`;
            
            await this.currentPage.screenshot({
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
     * Check if this is the current page
     */
    async isCurrentPage(): Promise<boolean> {
        try {
            const currentUrl = this.currentPage.url();
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
     * Wait for selector to be visible
     */
    async waitForSelector(selector: string, options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }): Promise<void> {
        try {
            await this.currentPage.waitForSelector(selector, {
                timeout: options?.timeout || 30000,
                state: options?.state || 'visible'
            });
            
            ActionLogger.logPageOperation('page_wait_selector', this.constructor.name, {
                selector,
                state: options?.state || 'visible'
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Wait for selector failed - ${selector}`, error as Error);
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
            await this.currentPage.evaluate(
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
                    await this.currentPage.waitForTimeout(delay);
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
        
        this.currentPage.on('request', requestHandler);
        
        try {
            // Wait until no requests for specified time
            while (Date.now() - startTime < timeout) {
                if (Date.now() - lastRequestTime > 1000) {
                    // No requests for 1 second, consider stable
                    break;
                }
                await this.currentPage.waitForTimeout(100);
            }
        } finally {
            this.currentPage.off('request', requestHandler);
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
     * Clear cached element instances when page context changes
     */
    private clearElementCache(): void {
        const elementMetadata = ElementMetadata.getAll(this.constructor.name);
        
        // Clear all possible element cache keys
        const allKeys = Object.keys(this);
        for (const key of allKeys) {
            if (key.startsWith('_element_')) {
                delete (this as any)[key];
            }
        }
        
        // Also check for elements stored with metadata
        for (const [propertyName, _options] of elementMetadata) {
            const privateKey = `_element_${propertyName}`;
            if (this.hasOwnProperty(privateKey)) {
                // Clear the cached CSWebElement instance
                delete (this as any)[privateKey];
            }
        }
        
        logger.debug(`${this.constructor.name}: Cleared cached elements`);
    }
    
    /**
     * Force clear all element caches (public method for framework use)
     */
    public clearAllElementCaches(): void {
        this.clearElementCache();
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        try {
            // Clear element cache first
            this.clearElementCache();
            
            // Clean up context if it has cleanup method
            if (this.context && typeof (this.context as any).cleanup === 'function') {
                await (this.context as any).cleanup();
            }
            
            // Clear page reference
            this.page = null as any;
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
        return CSWebElement.createDynamic(this.currentPage, {
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
        const actionLogger = ActionLogger.getInstance();
        const elementDescription = `${locatorType}=${locatorValue}`;
        
        await actionLogger.logAction('Page Element Click', { 
            description: `Clicking element on ${this.constructor.name} page`,
            element: elementDescription,
            locatorType,
            locatorValue,
            pageName: this.constructor.name,
            details: `Performing click action on ${elementDescription} in ${this.constructor.name}`
        });
        
        try {
            const element = this.createElement(locatorType, locatorValue);
            await element.click();
            
            await actionLogger.logAction('Page Element Click Success', { 
                description: `Successfully clicked element on ${this.constructor.name}`,
                element: elementDescription,
                pageName: this.constructor.name,
                details: `Click action completed successfully on ${elementDescription}`
            });
        } catch (error) {
            await actionLogger.logAction('Page Element Click Failed', { 
                description: `Failed to click element on ${this.constructor.name}`,
                element: elementDescription,
                pageName: this.constructor.name,
                error: (error as Error).message,
                details: `Click action failed on ${elementDescription}: ${(error as Error).message}`
            });
            throw error;
        }
    }

    /**
     * Fill element using framework methods
     */
    protected async fillElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, text: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        const elementDescription = `${locatorType}=${locatorValue}`;
        
        await actionLogger.logAction('Page Element Fill', { 
            description: `Filling element on ${this.constructor.name} page`,
            element: elementDescription,
            locatorType,
            locatorValue,
            textLength: text.length,
            pageName: this.constructor.name,
            details: `Entering text into ${elementDescription} in ${this.constructor.name} (${text.length} characters)`
        });
        
        try {
            const element = this.createElement(locatorType, locatorValue);
            await element.fill(text);
            
            await actionLogger.logAction('Page Element Fill Success', { 
                description: `Successfully filled element on ${this.constructor.name}`,
                element: elementDescription,
                textLength: text.length,
                pageName: this.constructor.name,
                details: `Text entry completed successfully on ${elementDescription}`
            });
        } catch (error) {
            await actionLogger.logAction('Page Element Fill Failed', { 
                description: `Failed to fill element on ${this.constructor.name}`,
                element: elementDescription,
                pageName: this.constructor.name,
                error: (error as Error).message,
                details: `Text entry failed on ${elementDescription}: ${(error as Error).message}`
            });
            throw error;
        }
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

    /**
     * Check if page needs reinitialization
     */
    public needsReinitialization(): boolean {
        return !this.page || this.page.isClosed() || !this._initialized;
    }

    /**
     * Get current page URL safely
     */
    public getCurrentUrl(): string {
        try {
            return this.page ? this.page.url() : '';
        } catch (error) {
            return '';
        }
    }

    // ============================================================================
    // FRAME HANDLING METHODS
    // ============================================================================

    /**
     * Switch to frame by selector
     */
    async switchToFrame(frameSelector: string): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Switch to Frame', {
                description: `Switching to frame: ${frameSelector}`,
                frameSelector,
                pageName: this.constructor.name
            });

            const frameLocator = this.currentPage.frameLocator(frameSelector);
            // Store frame reference for later use
            (this as any).__currentFrame = frameLocator;
            
            ActionLogger.logPageOperation('frame_switch', this.constructor.name, {
                frameSelector,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Frame Switch Success', {
                description: `Successfully switched to frame: ${frameSelector}`,
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Frame Switch Failed', {
                description: `Failed to switch to frame: ${frameSelector}`,
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to switch to frame`, error as Error);
            throw error;
        }
    }

    /**
     * Switch back to main frame/default content
     */
    async switchToMainFrame(): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Switch to Main Frame', {
                description: 'Switching back to main frame',
                pageName: this.constructor.name
            });

            // Clear frame reference
            delete (this as any).__currentFrame;
            
            ActionLogger.logPageOperation('frame_switch_main', this.constructor.name, {
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Main Frame Switch Success', {
                description: 'Successfully switched to main frame',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Main Frame Switch Failed', {
                description: 'Failed to switch to main frame',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to switch to main frame`, error as Error);
            throw error;
        }
    }

    /**
     * Get frame by name or id
     */
    async getFrameByName(name: string): Promise<any> {
        const startTime = Date.now();
        try {
            const frame = this.currentPage.frame({ name }) || this.currentPage.frame({ url: name });
            
            ActionLogger.logPageOperation('frame_get_by_name', this.constructor.name, {
                frameName: name,
                found: !!frame,
                duration: Date.now() - startTime
            });
            
            return frame;
        } catch (error) {
            logger.error(`${this.constructor.name}: Failed to get frame by name`, error as Error);
            throw error;
        }
    }

    /**
     * Get all frames in the page
     */
    async getAllFrames(): Promise<any[]> {
        try {
            const frames = this.currentPage.frames();
            
            ActionLogger.logPageOperation('frame_get_all', this.constructor.name, {
                frameCount: frames.length
            });
            
            return frames;
        } catch (error) {
            logger.error(`${this.constructor.name}: Failed to get all frames`, error as Error);
            throw error;
        }
    }

    // ============================================================================
    // WINDOW/TAB HANDLING METHODS
    // ============================================================================

    /**
     * Switch to window by index
     */
    async switchToWindow(index: number): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Switch to Window', {
                description: `Switching to window at index: ${index}`,
                windowIndex: index,
                pageName: this.constructor.name
            });

            const pages = this.currentPage.context().pages();
            if (index >= pages.length) {
                throw new Error(`Window index ${index} out of range. Total windows: ${pages.length}`);
            }
            
            const targetPage = pages[index];
            if (!targetPage) {
                throw new Error(`Window at index ${index} not found`);
            }
            await targetPage.bringToFront();
            
            // Update page reference if needed
            if (BDDContext) {
                await BDDContext.getInstance().setCurrentPage(targetPage);
            }
            
            ActionLogger.logPageOperation('window_switch', this.constructor.name, {
                windowIndex: index,
                totalWindows: pages.length,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Window Switch Success', {
                description: `Successfully switched to window ${index}`,
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Window Switch Failed', {
                description: `Failed to switch to window ${index}`,
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to switch to window`, error as Error);
            throw error;
        }
    }

    /**
     * Switch to window by title
     */
    async switchToWindowByTitle(title: string): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Switch to Window by Title', {
                description: `Switching to window with title: ${title}`,
                windowTitle: title,
                pageName: this.constructor.name
            });

            const pages = this.currentPage.context().pages();
            let targetPage = null;
            
            for (const page of pages) {
                const pageTitle = await page.title();
                if (pageTitle.includes(title)) {
                    targetPage = page;
                    break;
                }
            }
            
            if (!targetPage) {
                throw new Error(`No window found with title containing: ${title}`);
            }
            
            await targetPage.bringToFront();
            
            // Update page reference if needed
            if (BDDContext) {
                await BDDContext.getInstance().setCurrentPage(targetPage);
            }
            
            ActionLogger.logPageOperation('window_switch_by_title', this.constructor.name, {
                windowTitle: title,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Window Switch Success', {
                description: `Successfully switched to window with title: ${title}`,
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Window Switch Failed', {
                description: `Failed to switch to window with title: ${title}`,
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to switch to window by title`, error as Error);
            throw error;
        }
    }

    /**
     * Close current window/tab
     */
    async closeWindow(): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Close Window', {
                description: 'Closing current window',
                pageName: this.constructor.name
            });

            await this.currentPage.close();
            
            ActionLogger.logPageOperation('window_close', this.constructor.name, {
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Window Close Success', {
                description: 'Successfully closed window',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Window Close Failed', {
                description: 'Failed to close window',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to close window`, error as Error);
            throw error;
        }
    }

    /**
     * Get all open windows/tabs
     */
    async getAllWindows(): Promise<Page[]> {
        try {
            const pages = this.currentPage.context().pages();
            
            ActionLogger.logPageOperation('window_get_all', this.constructor.name, {
                windowCount: pages.length
            });
            
            return pages;
        } catch (error) {
            logger.error(`${this.constructor.name}: Failed to get all windows`, error as Error);
            throw error;
        }
    }

    /**
     * Open new window/tab
     */
    async openNewWindow(url?: string): Promise<Page> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Open New Window', {
                description: `Opening new window${url ? ` with URL: ${url}` : ''}`,
                url,
                pageName: this.constructor.name
            });

            const newPage = await this.currentPage.context().newPage();
            
            if (url) {
                await newPage.goto(url);
            }
            
            ActionLogger.logPageOperation('window_open_new', this.constructor.name, {
                url,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('New Window Success', {
                description: 'Successfully opened new window',
                duration: Date.now() - startTime
            });
            
            return newPage;
        } catch (error) {
            await ActionLogger.getInstance().logAction('New Window Failed', {
                description: 'Failed to open new window',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to open new window`, error as Error);
            throw error;
        }
    }

    // ============================================================================
    // ALERT/DIALOG HANDLING METHODS
    // ============================================================================

    /**
     * Accept alert/confirm/prompt dialog
     */
    async acceptAlert(promptText?: string): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Accept Alert', {
                description: 'Setting up alert acceptance handler',
                promptText,
                pageName: this.constructor.name
            });

            this.currentPage.once('dialog', async dialog => {
                await ActionLogger.getInstance().logAction('Alert Detected', {
                    description: `Alert detected: ${dialog.message()}`,
                    type: dialog.type(),
                    message: dialog.message()
                });
                
                if (promptText && dialog.type() === 'prompt') {
                    await dialog.accept(promptText);
                } else {
                    await dialog.accept();
                }
                
                ActionLogger.logPageOperation('alert_accept', this.constructor.name, {
                    dialogType: dialog.type(),
                    message: dialog.message(),
                    promptText,
                    duration: Date.now() - startTime
                });
            });

            await ActionLogger.getInstance().logAction('Alert Handler Set', {
                description: 'Alert acceptance handler configured',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Alert Accept Failed', {
                description: 'Failed to set up alert acceptance',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to accept alert`, error as Error);
            throw error;
        }
    }

    /**
     * Dismiss alert/confirm dialog
     */
    async dismissAlert(): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Dismiss Alert', {
                description: 'Setting up alert dismissal handler',
                pageName: this.constructor.name
            });

            this.currentPage.once('dialog', async dialog => {
                await ActionLogger.getInstance().logAction('Alert Detected', {
                    description: `Alert detected: ${dialog.message()}`,
                    type: dialog.type(),
                    message: dialog.message()
                });
                
                await dialog.dismiss();
                
                ActionLogger.logPageOperation('alert_dismiss', this.constructor.name, {
                    dialogType: dialog.type(),
                    message: dialog.message(),
                    duration: Date.now() - startTime
                });
            });

            await ActionLogger.getInstance().logAction('Alert Handler Set', {
                description: 'Alert dismissal handler configured',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Alert Dismiss Failed', {
                description: 'Failed to set up alert dismissal',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to dismiss alert`, error as Error);
            throw error;
        }
    }

    /**
     * Get alert text
     */
    async getAlertText(): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for alert'));
            }, 5000);

            this.currentPage.once('dialog', async dialog => {
                clearTimeout(timeout);
                const text = dialog.message();
                
                await ActionLogger.getInstance().logAction('Alert Text Retrieved', {
                    description: `Got alert text: ${text}`,
                    type: dialog.type(),
                    message: text
                });
                
                ActionLogger.logPageOperation('alert_get_text', this.constructor.name, {
                    dialogType: dialog.type(),
                    message: text
                });
                
                await dialog.dismiss();
                resolve(text);
            });
        });
    }

    /**
     * Handle dialog with custom logic
     */
    async handleDialog(handler: (dialog: any) => Promise<void>): Promise<void> {
        try {
            await ActionLogger.getInstance().logAction('Set Dialog Handler', {
                description: 'Setting up custom dialog handler',
                pageName: this.constructor.name
            });

            this.currentPage.on('dialog', handler);
            
            ActionLogger.logPageOperation('dialog_handler_set', this.constructor.name, {
                hasHandler: true
            });
        } catch (error) {
            logger.error(`${this.constructor.name}: Failed to set dialog handler`, error as Error);
            throw error;
        }
    }

    // ============================================================================
    // ADVANCED NAVIGATION METHODS
    // ============================================================================

    /**
     * Wait for navigation to complete
     */
    async waitForNavigation(options?: NavigationOptions): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Wait for Navigation', {
                description: 'Waiting for navigation to complete',
                options,
                pageName: this.constructor.name
            });

            await this.currentPage.waitForLoadState(options?.waitUntil || 'load', 
                options?.timeout ? { timeout: options.timeout } : undefined
            );
            
            ActionLogger.logPageOperation('navigation_wait', this.constructor.name, {
                waitUntil: options?.waitUntil || 'load',
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Navigation Complete', {
                description: 'Navigation completed successfully',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Navigation Wait Failed', {
                description: 'Failed to wait for navigation',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to wait for navigation`, error as Error);
            throw error;
        }
    }

    /**
     * Wait for specific response
     */
    async waitForResponse(urlPattern: string | RegExp, timeout: number = 30000): Promise<any> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Wait for Response', {
                description: `Waiting for response matching: ${urlPattern}`,
                urlPattern: urlPattern.toString(),
                timeout,
                pageName: this.constructor.name
            });

            const response = await this.currentPage.waitForResponse(urlPattern, { timeout });
            
            ActionLogger.logPageOperation('response_wait', this.constructor.name, {
                urlPattern: urlPattern.toString(),
                statusCode: response.status(),
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Response Received', {
                description: `Response received: ${response.url()}`,
                status: response.status(),
                duration: Date.now() - startTime
            });
            
            return response;
        } catch (error) {
            await ActionLogger.getInstance().logAction('Response Wait Failed', {
                description: `Failed to wait for response: ${urlPattern}`,
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to wait for response`, error as Error);
            throw error;
        }
    }

    /**
     * Wait for specific request
     */
    async waitForRequest(urlPattern: string | RegExp, timeout: number = 30000): Promise<any> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Wait for Request', {
                description: `Waiting for request matching: ${urlPattern}`,
                urlPattern: urlPattern.toString(),
                timeout,
                pageName: this.constructor.name
            });

            const request = await this.currentPage.waitForRequest(urlPattern, { timeout });
            
            ActionLogger.logPageOperation('request_wait', this.constructor.name, {
                urlPattern: urlPattern.toString(),
                method: request.method(),
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Request Detected', {
                description: `Request detected: ${request.url()}`,
                method: request.method(),
                duration: Date.now() - startTime
            });
            
            return request;
        } catch (error) {
            await ActionLogger.getInstance().logAction('Request Wait Failed', {
                description: `Failed to wait for request: ${urlPattern}`,
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to wait for request`, error as Error);
            throw error;
        }
    }

    // ============================================================================
    // PAGE STATE METHODS
    // ============================================================================

    /**
     * Set viewport size
     */
    async setViewportSize(width: number, height: number): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Set Viewport Size', {
                description: `Setting viewport to ${width}x${height}`,
                width,
                height,
                pageName: this.constructor.name
            });

            await this.currentPage.setViewportSize({ width, height });
            
            ActionLogger.logPageOperation('viewport_set', this.constructor.name, {
                width,
                height,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Viewport Set Success', {
                description: `Viewport set to ${width}x${height}`,
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Viewport Set Failed', {
                description: 'Failed to set viewport size',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to set viewport size`, error as Error);
            throw error;
        }
    }

    /**
     * Emulate media type or features
     */
    async emulateMedia(options?: { media?: 'screen' | 'print' | null; colorScheme?: 'light' | 'dark' | 'no-preference' | null }): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Emulate Media', {
                description: 'Emulating media settings',
                options,
                pageName: this.constructor.name
            });

            await this.currentPage.emulateMedia(options);
            
            ActionLogger.logPageOperation('media_emulate', this.constructor.name, {
                options,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Media Emulate Success', {
                description: 'Media settings emulated successfully',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Media Emulate Failed', {
                description: 'Failed to emulate media',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to emulate media`, error as Error);
            throw error;
        }
    }

    /**
     * Add script tag to page
     */
    async addScriptTag(options: { url?: string; path?: string; content?: string; type?: string }): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Add Script Tag', {
                description: 'Adding script tag to page',
                options,
                pageName: this.constructor.name
            });

            await this.currentPage.addScriptTag(options);
            
            ActionLogger.logPageOperation('script_add', this.constructor.name, {
                hasUrl: !!options.url,
                hasPath: !!options.path,
                hasContent: !!options.content,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Script Tag Added', {
                description: 'Script tag added successfully',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Script Tag Failed', {
                description: 'Failed to add script tag',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to add script tag`, error as Error);
            throw error;
        }
    }

    /**
     * Add style tag to page
     */
    async addStyleTag(options: { url?: string; path?: string; content?: string }): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Add Style Tag', {
                description: 'Adding style tag to page',
                options,
                pageName: this.constructor.name
            });

            await this.currentPage.addStyleTag(options);
            
            ActionLogger.logPageOperation('style_add', this.constructor.name, {
                hasUrl: !!options.url,
                hasPath: !!options.path,
                hasContent: !!options.content,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Style Tag Added', {
                description: 'Style tag added successfully',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Style Tag Failed', {
                description: 'Failed to add style tag',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to add style tag`, error as Error);
            throw error;
        }
    }

    /**
     * Expose function to page context
     */
    async exposeFunction(name: string, callback: Function): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Expose Function', {
                description: `Exposing function: ${name}`,
                functionName: name,
                pageName: this.constructor.name
            });

            await this.currentPage.exposeFunction(name, callback);
            
            ActionLogger.logPageOperation('function_expose', this.constructor.name, {
                functionName: name,
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Function Exposed', {
                description: `Function ${name} exposed successfully`,
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Function Expose Failed', {
                description: `Failed to expose function: ${name}`,
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to expose function`, error as Error);
            throw error;
        }
    }

    /**
     * Add initialization script (runs before page scripts)
     */
    async addInitScript<Arg = any>(script: string | { path?: string; content?: string } | ((arg: Arg) => any), arg?: Arg): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Add Init Script', {
                description: 'Adding initialization script',
                pageName: this.constructor.name
            });

            await this.currentPage.addInitScript(script as any, arg);
            
            ActionLogger.logPageOperation('init_script_add', this.constructor.name, {
                duration: Date.now() - startTime
            });

            await ActionLogger.getInstance().logAction('Init Script Added', {
                description: 'Initialization script added successfully',
                duration: Date.now() - startTime
            });
        } catch (error) {
            await ActionLogger.getInstance().logAction('Init Script Failed', {
                description: 'Failed to add initialization script',
                error: (error as Error).message
            });
            logger.error(`${this.constructor.name}: Failed to add init script`, error as Error);
            throw error;
        }
    }
}