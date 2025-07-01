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
import { NavigationObserver } from './NavigationObserver';
import { NavigationRegistry } from './NavigationRegistry';
import { CrossDomainNavigationHandler } from '../navigation/CrossDomainNavigationHandler';

interface NavigationOptions {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
}

export abstract class CSBasePage {
    protected page!: Page;
    protected context!: PageContext;
    private _initialized: boolean = false;
    private _pageLoadTime: number = 0;
    private _validationErrors: ValidationError[] = [];
    private navigationObserver?: NavigationObserver;
    private crossDomainHandler?: CrossDomainNavigationHandler;

    async waitForURL(urlPattern: string | RegExp, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
        await this.currentPage.waitForURL(urlPattern, options);
    }

    async waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle', options?: { timeout?: number }): Promise<void> {
        await this.currentPage.waitForLoadState(state, options);
    }

    public get currentPage(): Page {
        return this.page;
    }

    protected abstract get pageUrl(): string;

    protected abstract waitForPageLoad(): Promise<void>;

    protected async onPageReady(): Promise<void> {
    }

    async initialize(page: Page): Promise<void> {
        if (this._initialized && this.page === page) {
            logger.warn(`${this.constructor.name}: Already initialized with same page`);
            return;
        }

        const startTime = Date.now();

        try {
            if (this._initialized && this.page !== page) {
                logger.debug(`${this.constructor.name}: Reinitializing with new page - clearing element cache`);
                this.clearElementCache();
            }
            
            this.page = page;
            this.context = new PageContext(page);
            
            this.navigationObserver = new NavigationObserver(page);
            
            this.crossDomainHandler = new CrossDomainNavigationHandler(page);
            
            NavigationRegistry.getInstance().register(page, this.navigationObserver);
            
            this.initializeElements();
            
            // Note: Browser maximization is now handled in PageFactory.createPage()
            
            await this.waitForPageLoad();
            
            this._pageLoadTime = Date.now() - startTime;
            this.context.recordMetric('pageLoadTime', this._pageLoadTime);
            
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
            
            const page = this.currentPage;
            
            if (page.isClosed()) {
                throw new Error('Cannot navigate - page has been closed. Page object needs to be reinitialized with a valid page.');
            }
            
            const currentUrl = page.url();
            if (currentUrl === targetUrl) {
                logger.debug(`Already on target URL: ${targetUrl}`);
                await this.waitForPageLoad();
                return;
            }
            
            const startTime = Date.now();
            
            ActionLogger.logDebug(`Current URL before navigation: ${currentUrl}`);
            
            await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            

            if (this.crossDomainHandler?.isInCrossDomainNavigation()) {
                ActionLogger.logDebug('Detected authentication redirect, waiting for completion...');
                await this.crossDomainHandler.forceWaitForNavigation();
            }

            if (this.navigationObserver) {
                await this.navigationObserver.waitForNavigation();
            }

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

    async reload(): Promise<void> {
        try {
            const startTime = Date.now();
            
            await this.currentPage.reload({
                waitUntil: 'networkidle',
                timeout: 60000
            });
            
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

    getURL(): string {
        return this.currentPage.url();
    }

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



    async isCurrentPage(): Promise<boolean> {
        try {
            const currentUrl = this.currentPage.url();
            const expectedUrl = this.pageUrl;
            
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
        }
    }

    async validatePage(): Promise<boolean> {
        try {
            this._validationErrors = [];
            
            const isCorrectPage = await this.isCurrentPage();
            if (!isCorrectPage) {
                this._validationErrors.push({
                    field: 'url',
                    message: 'Not on expected page',
                    severity: 'high'
                });
            }
            
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

    getValidationErrors(): ValidationError[] {
        return [...this._validationErrors];
    }

    protected async customValidation(): Promise<void> {
    }

    getMetrics(): any {
        return this.context.getMetrics();
    }

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

    protected async waitForPageStability(timeout: number = 5000): Promise<void> {
        const startTime = Date.now();
        let lastRequestTime = Date.now();
        
        const requestHandler = () => {
            lastRequestTime = Date.now();
        };
        
        this.currentPage.on('request', requestHandler);
        
        try {
            while (Date.now() - startTime < timeout) {
                if (Date.now() - lastRequestTime > 1000) {
                    break;
                }
                await this.currentPage.waitForTimeout(100);
            }
        } finally {
            this.currentPage.off('request', requestHandler);
        }
    }

    protected async ensurePageReady(): Promise<void> {
        if (this.crossDomainHandler?.isInCrossDomainNavigation()) {
            await this.crossDomainHandler.handleCrossDomainNavigation();
        }
        
        if (this.navigationObserver) {
            await this.navigationObserver.ensurePageReady();
        }
    }

    protected isNavigationInProgress(): boolean {
        return this.navigationObserver?.isNavigationInProgress() || false;
    }


    private initializeElements(): void {
        
        ActionLogger.logPageOperation('page_elements_ready', this.constructor.name, {
            elementCount: ElementMetadata.getAll(this.constructor.name).size
        });
    }
    
    private clearElementCache(): void {
        const elementMetadata = ElementMetadata.getAll(this.constructor.name);
        
        const allKeys = Object.keys(this);
        for (const key of allKeys) {
            if (key.startsWith('_element_')) {
                delete (this as any)[key];
            }
        }
        
        for (const [propertyName, _options] of elementMetadata) {
            const privateKey = `_element_${propertyName}`;
            if (this.hasOwnProperty(privateKey)) {
                delete (this as any)[privateKey];
            }
        }
        
        logger.debug(`${this.constructor.name}: Cleared cached elements`);
    }
    
    public clearAllElementCaches(): void {
        this.clearElementCache();
    }

    async cleanup(): Promise<void> {
        try {
            this.clearElementCache();
            
            if (this.context && typeof (this.context as any).cleanup === 'function') {
                await (this.context as any).cleanup();
            }
            
            this.page = null as any;
            this._initialized = false;
            
            ActionLogger.logPageOperation('page_cleanup', this.constructor.name);
        } catch (error) {
            logger.error(`${this.constructor.name}: Cleanup failed`, error as Error);
        }
    }


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

    protected findByCSS(selector: string, description?: string): CSWebElement {
        return this.createElement('css', selector, description);
    }

    protected findByXPath(xpath: string, description?: string): CSWebElement {
        return this.createElement('xpath', xpath, description);
    }

    protected findById(id: string, description?: string): CSWebElement {
        return this.createElement('id', id, description);
    }

    protected findByTestId(testId: string, description?: string): CSWebElement {
        return this.createElement('testid', testId, description);
    }

    protected findByText(text: string, description?: string): CSWebElement {
        return this.createElement('css', `text="${text}"`, description);
    }

    protected findByPartialText(text: string, description?: string): CSWebElement {
        return this.createElement('css', `text*="${text}"`, description);
    }

    protected findByAriaLabel(label: string, description?: string): CSWebElement {
        return this.createElement('css', `[aria-label="${label}"]`, description);
    }

    protected findByRole(role: string, description?: string): CSWebElement {
        return this.createElement('css', `[role="${role}"]`, description);
    }

    protected findByPlaceholder(placeholder: string, description?: string): CSWebElement {
        return this.createElement('css', `[placeholder="${placeholder}"]`, description);
    }

    protected findByTitle(title: string, description?: string): CSWebElement {
        return this.createElement('css', `[title="${title}"]`, description);
    }

    protected findByDataAttribute(attribute: string, value: string, description?: string): CSWebElement {
        return this.createElement('css', `[data-${attribute}="${value}"]`, description);
    }

    protected async waitForElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'visible', timeout });
    }

    protected async waitForElementHidden(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'hidden', timeout });
    }

    protected async waitForElementAttached(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'attached', timeout });
    }

    protected async waitForElementDetached(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitFor({ state: 'detached', timeout });
    }

    protected async elementExists(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<boolean> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.isPresent();
    }

    protected async getElementCount(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<number> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getCount();
    }

    protected async isElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<boolean> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.isVisible();
    }

    protected async isElementEnabled(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<boolean> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.isEnabled();
    }

    protected async getElementText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<string> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getText();
    }

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

    protected async typeIntoElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, text: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.type(text);
    }

    protected async clearElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.clear();
    }

    protected async hoverElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.hover();
    }

    protected async doubleClickElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.doubleClick();
    }

    protected async rightClickElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.rightClick();
    }

    protected async selectOption(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, value: string | string[]): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.selectOption(value);
    }

    protected async checkElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.check();
    }

    protected async uncheckElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.uncheck();
    }

    protected async uploadFile(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, files: string | string[]): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.upload(files);
    }

    protected async screenshotElement(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<Buffer> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.screenshot();
    }

    protected async scrollElementIntoView(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.scrollIntoView();
    }

    protected async getElementAttribute(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, attributeName: string): Promise<string | null> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getAttribute(attributeName);
    }

    protected async getElementCSSProperty(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, property: string): Promise<string> {
        const element = this.createElement(locatorType, locatorValue);
        return await element.getCSSProperty(property);
    }

    protected async assertElementText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, expectedText: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.assertText(expectedText);
    }

    protected async assertElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.assertVisible();
    }

    protected async assertElementHidden(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.assertHidden();
    }


    protected async clickByCSS(selector: string): Promise<void> {
        await this.clickElement('css', selector);
    }

    protected async clickById(id: string): Promise<void> {
        await this.clickElement('id', id);
    }

    protected async clickByTestId(testId: string): Promise<void> {
        await this.clickElement('testid', testId);
    }

    protected async fillByCSS(selector: string, text: string): Promise<void> {
        await this.fillElement('css', selector, text);
    }

    protected async fillById(id: string, text: string): Promise<void> {
        await this.fillElement('id', id, text);
    }

    protected async fillByTestId(testId: string, text: string): Promise<void> {
        await this.fillElement('testid', testId, text);
    }

    protected async waitForCSS(selector: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('css', selector, timeout);
    }

    protected async waitForId(id: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('id', id, timeout);
    }

    protected async waitForTestId(testId: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('testid', testId, timeout);
    }

    protected async existsByCSS(selector: string): Promise<boolean> {
        return await this.elementExists('css', selector);
    }

    protected async existsById(id: string): Promise<boolean> {
        return await this.elementExists('id', id);
    }

    protected async existsByTestId(testId: string): Promise<boolean> {
        return await this.elementExists('testid', testId);
    }

    protected async getTextByCSS(selector: string): Promise<string> {
        return await this.getElementText('css', selector);
    }

    protected async getTextById(id: string): Promise<string> {
        return await this.getElementText('id', id);
    }

    protected async getTextByTestId(testId: string): Promise<string> {
        return await this.getElementText('testid', testId);
    }


    protected async expectElementText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, expectedText: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        const locator = await element.getLocator();
        await expect(locator).toHaveText(expectedText);
    }

    protected async expectElementVisible(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        const locator = await element.getLocator();
        await expect(locator).toBeVisible();
    }

    protected async expectElementCount(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, count: number): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        const locator = await element.getLocator();
        await expect(locator).toHaveCount(count);
    }

    protected async expectCSS(selector: string, expectedText: string): Promise<void> {
        await this.expectElementText('css', selector, expectedText);
    }

    protected async expectCSSVisible(selector: string): Promise<void> {
        await this.expectElementVisible('css', selector);
    }

    protected async expectTestId(testId: string, expectedText: string): Promise<void> {
        await this.expectElementText('testid', testId, expectedText);
    }

    protected async expectTestIdVisible(testId: string): Promise<void> {
        await this.expectElementVisible('testid', testId);
    }

    protected async waitForElementWithText(locatorType: 'css' | 'xpath' | 'id' | 'testid', locatorValue: string, text: string, timeout: number = 30000): Promise<void> {
        const element = this.createElement(locatorType, locatorValue);
        await element.waitForText(text, timeout);
    }

    protected findByDataTest(value: string, description?: string): CSWebElement {
        return this.createElement('css', `[data-test="${value}"]`, description);
    }

    protected async clickByDataTest(value: string): Promise<void> {
        await this.clickElement('css', `[data-test="${value}"]`);
    }

    protected async waitForDataTest(value: string, timeout: number = 30000): Promise<void> {
        await this.waitForElementVisible('css', `[data-test="${value}"]`, timeout);
    }

    protected async existsByDataTest(value: string): Promise<boolean> {
        return await this.elementExists('css', `[data-test="${value}"]`);
    }

    protected async getTextByDataTest(value: string): Promise<string> {
        return await this.getElementText('css', `[data-test="${value}"]`);
    }

    protected async expectDataTest(value: string, expectedText: string): Promise<void> {
        await this.expectElementText('css', `[data-test="${value}"]`, expectedText);
    }

    protected async expectDataTestVisible(value: string): Promise<void> {
        await this.expectElementVisible('css', `[data-test="${value}"]`);
    }

    public needsReinitialization(): boolean {
        return !this.page || this.page.isClosed() || !this._initialized;
    }

    public getCurrentUrl(): string {
        try {
            return this.page ? this.page.url() : '';
        } catch (error) {
            return '';
        }
    }


    async switchToFrame(frameSelector: string): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Switch to Frame', {
                description: `Switching to frame: ${frameSelector}`,
                frameSelector,
                pageName: this.constructor.name
            });

            const frameLocator = this.currentPage.frameLocator(frameSelector);
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

    async switchToMainFrame(): Promise<void> {
        const startTime = Date.now();
        try {
            await ActionLogger.getInstance().logAction('Switch to Main Frame', {
                description: 'Switching back to main frame',
                pageName: this.constructor.name
            });

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
