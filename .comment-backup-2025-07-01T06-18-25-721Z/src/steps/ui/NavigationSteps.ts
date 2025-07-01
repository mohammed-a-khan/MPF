// src/steps/ui/NavigationSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { PageFactory } from '../../core/pages/PageFactory';
import { CSBasePage } from '../../core/pages/CSBasePage';
import { BDDContext } from '../../bdd/context/BDDContext';

export class NavigationSteps extends CSBDDBaseStepDefinition {
    private _baseUrl: string | null = null;
    private currentPage: CSBasePage | null = null;

    constructor() {
        super();
    }

    private get baseUrl(): string {
        if (this._baseUrl === null) {
            this._baseUrl = ConfigurationManager.get('BASE_URL', '');
        }
        return this._baseUrl;
    }

    @CSBDDStepDef('user navigates to {string}')
    @CSBDDStepDef('I navigate to {string}')
    @CSBDDStepDef('the user navigates to {string}')
    async navigateToUrl(url: string): Promise<void> {
        ActionLogger.logInfo('Navigate to URL', { url, type: 'navigation_step' });
        
        try {
            // Handle relative and absolute URLs
            const fullUrl = this.resolveUrl(url);
            
            await this.page.goto(fullUrl, {
                waitUntil: ConfigurationManager.get('NAVIGATION_WAIT_UNTIL', 'networkidle') as any,
                timeout: ConfigurationManager.getInt('NAVIGATION_TIMEOUT', 30000)
            });

            // Wait for any custom page load conditions
            const waitSelector = ConfigurationManager.get('PAGE_LOAD_SELECTOR', '');
            if (waitSelector) {
                await this.page.waitForSelector(waitSelector, {
                    state: 'visible',
                    timeout: ConfigurationManager.getInt('PAGE_LOAD_TIMEOUT', 10000)
                });
            }

            // Clear current page object as we've navigated
            this.currentPage = null;

            ActionLogger.logInfo('Navigation completed', { 
                url: fullUrl, 
                currentUrl: this.page.url(),
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Navigation failed', error as Error);
            throw new Error(`Failed to navigate to ${url}: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user navigates to {string} page')
    @CSBDDStepDef('I navigate to {string} page')
    @CSBDDStepDef('the user navigates to {string} page')
    async navigateToPageByName(pageName: string): Promise<void> {
        ActionLogger.logInfo('Navigate to page by name', { pageName, type: 'navigation_step' });
        
        try {
            // Get page URL from configuration
            const pageUrlKey = `${pageName.toUpperCase().replace(/\s+/g, '_')}_PAGE_URL`;
            let pageUrl = ConfigurationManager.get(pageUrlKey, '');
            
            if (!pageUrl) {
                // Try alternate key format
                pageUrl = ConfigurationManager.get(`PAGE_${pageName.toUpperCase()}`, '');
            }
            
            if (!pageUrl) {
                throw new Error(`Page URL not found for ${pageName}. Please define ${pageUrlKey} in configuration.`);
            }

            await this.navigateToUrl(pageUrl);

            // Try to create page object if registered
            try {
                this.currentPage = await PageFactory.createPageByName(pageName, this.page);
                this.context.store('currentPage', this.currentPage, 'scenario');
                ActionLogger.logInfo(`Page object created for ${pageName}`);
            } catch (error) {
                ActionLogger.logDebug(`No page object registered for ${pageName}`);
            }
        } catch (error) {
            ActionLogger.logError('Navigation to page failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('user refreshes the page')
    @CSBDDStepDef('I refresh the page')
    @CSBDDStepDef('the page is refreshed')
    async refreshPage(): Promise<void> {
        ActionLogger.logInfo('Refresh page', { type: 'navigation_step' });
        
        try {
            const currentUrl = this.page.url();
            
            await this.page.reload({
                waitUntil: ConfigurationManager.get('NAVIGATION_WAIT_UNTIL', 'networkidle') as any,
                timeout: ConfigurationManager.getInt('NAVIGATION_TIMEOUT', 30000)
            });

            // Wait for page to be ready after refresh
            await this.page.waitForLoadState('domcontentloaded');

            ActionLogger.logInfo('Page refreshed', { url: currentUrl, type: 'navigation_success' });
        } catch (error) {
            ActionLogger.logError('Page refresh failed', error as Error);
            throw new Error(`Failed to refresh page: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user goes back')
    @CSBDDStepDef('I go back')
    @CSBDDStepDef('the user navigates back')
    async goBack(): Promise<void> {
        ActionLogger.logInfo('Navigate back', { type: 'navigation_step' });
        
        try {
            const currentUrl = this.page.url();
            
            await this.page.goBack({
                waitUntil: ConfigurationManager.get('NAVIGATION_WAIT_UNTIL', 'networkidle') as any,
                timeout: ConfigurationManager.getInt('NAVIGATION_TIMEOUT', 30000)
            });

            const newUrl = this.page.url();
            
            if (currentUrl === newUrl) {
                ActionLogger.logWarn('Navigation back had no effect (possibly at first page in history)');
            }

            // Clear current page object as we've navigated
            this.currentPage = null;

            ActionLogger.logInfo('Navigated back', { 
                from: currentUrl, 
                to: newUrl,
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Navigate back failed', error as Error);
            throw new Error(`Failed to navigate back: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user goes forward')
    @CSBDDStepDef('I go forward')
    @CSBDDStepDef('the user navigates forward')
    async goForward(): Promise<void> {
        ActionLogger.logInfo('Navigate forward', { type: 'navigation_step' });
        
        try {
            const currentUrl = this.page.url();
            
            await this.page.goForward({
                waitUntil: ConfigurationManager.get('NAVIGATION_WAIT_UNTIL', 'networkidle') as any,
                timeout: ConfigurationManager.getInt('NAVIGATION_TIMEOUT', 30000)
            });

            const newUrl = this.page.url();
            
            if (currentUrl === newUrl) {
                ActionLogger.logWarn('Navigation forward had no effect (possibly at last page in history)');
            }

            // Clear current page object as we've navigated
            this.currentPage = null;

            ActionLogger.logInfo('Navigated forward', { 
                from: currentUrl, 
                to: newUrl,
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Navigate forward failed', error as Error);
            throw new Error(`Failed to navigate forward: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user waits for navigation')
    @CSBDDStepDef('I wait for navigation')
    @CSBDDStepDef('the navigation completes')
    async waitForNavigation(): Promise<void> {
        ActionLogger.logInfo('Wait for navigation', { type: 'navigation_step' });
        
        try {
            await this.page.waitForNavigation({
                waitUntil: ConfigurationManager.get('NAVIGATION_WAIT_UNTIL', 'networkidle') as any,
                timeout: ConfigurationManager.getInt('NAVIGATION_TIMEOUT', 30000)
            });

            ActionLogger.logInfo('Navigation completed', { 
                url: this.page.url(),
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Wait for navigation failed', error as Error);
            throw new Error(`Failed to wait for navigation: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user waits for page to load')
    @CSBDDStepDef('I wait for page to load')
    @CSBDDStepDef('the page finishes loading')
    async waitForPageLoad(): Promise<void> {
        ActionLogger.logInfo('Wait for page load', { type: 'navigation_step' });
        
        try {
            await this.page.waitForLoadState('networkidle', {
                timeout: ConfigurationManager.getInt('PAGE_LOAD_TIMEOUT', 30000)
            });

            ActionLogger.logInfo('Page loaded', { 
                url: this.page.url(),
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Wait for page load failed', error as Error);
            throw new Error(`Failed to wait for page load: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user navigates to {string} in new tab')
    @CSBDDStepDef('I open {string} in new tab')
    async navigateToUrlInNewTab(url: string): Promise<void> {
        ActionLogger.logInfo('Navigate to URL in new tab', { url, type: 'navigation_step' });
        
        try {
            const fullUrl = this.resolveUrl(url);
            
            // Create new page (tab)
            const browserContext = this.context.getCurrentBrowserContext();
            const newPage = await browserContext.newPage();
            
            // Navigate in new tab
            await newPage.goto(fullUrl, {
                waitUntil: ConfigurationManager.get('NAVIGATION_WAIT_UNTIL', 'networkidle') as any,
                timeout: ConfigurationManager.getInt('NAVIGATION_TIMEOUT', 30000)
            });

            // Store new page in context
            this.context.store('currentPage', newPage, 'scenario');

            ActionLogger.logInfo('Navigated to URL in new tab', { 
                url: fullUrl,
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Navigate to URL in new tab failed', error as Error);
            throw new Error(`Failed to navigate to ${url} in new tab: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user closes current tab')
    @CSBDDStepDef('I close current tab')
    async closeCurrentTab(): Promise<void> {
        ActionLogger.logInfo('Close current tab', { type: 'navigation_step' });
        
        try {
            await this.page.close();
            
            // Get remaining pages
            const browserContext = this.context.getCurrentBrowserContext();
            const pages = browserContext.pages();
            
            if (pages.length > 0) {
                const lastPage = pages[pages.length - 1];
                if (!lastPage) {
                    throw new Error('Failed to get last page reference');
                }
                // Switch to last page
                await lastPage.bringToFront();
                this.context.store('currentPage', lastPage, 'scenario');
            }

            ActionLogger.logInfo('Closed current tab', { type: 'navigation_success' });
        } catch (error) {
            ActionLogger.logError('Close current tab failed', error as Error);
            throw new Error(`Failed to close current tab: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user switches to tab {int}')
    @CSBDDStepDef('I switch to tab {int}')
    async switchToTab(tabIndex: number): Promise<void> {
        ActionLogger.logInfo('Switch to tab', { tabIndex, type: 'navigation_step' });
        
        try {
            const browserContext = this.context.getCurrentBrowserContext();
            const pages = browserContext.pages();
            
            if (tabIndex < 0 || tabIndex >= pages.length) {
                throw new Error(`Invalid tab index ${tabIndex}. Available tabs: 0-${pages.length - 1}`);
            }
            
            const targetPage = pages[tabIndex];
            if (!targetPage) {
                throw new Error(`Failed to get page at index ${tabIndex}`);
            }

            await targetPage.bringToFront();
            this.context.store('currentPage', targetPage, 'scenario');

            ActionLogger.logInfo('Switched to tab', { 
                tabIndex,
                url: targetPage.url(),
                type: 'navigation_success'
            });
        } catch (error) {
            ActionLogger.logError('Switch to tab failed', error as Error);
            throw new Error(`Failed to switch to tab ${tabIndex}: ${(error as Error).message}`);
        }
    }

    // Removed duplicate step definition - using SauceDemoSteps.loginWithCredentials() instead
    // which provides more detailed action logging

    @CSBDDStepDef('I should see the products page')
    async validateProductsPage(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Verify products page elements
            await page.locator('.inventory_list').waitFor({
                state: 'visible',
                timeout: 5000
            });
            
            await page.locator('.inventory_item').first().waitFor({
                state: 'visible',
                timeout: 5000
            });
            
            await actionLogger.logAction('validate_products_page', {
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'validate_products_page' });
            throw error;
        }
    }

    @CSBDDStepDef('I should see products displayed')
    async validateProductsDisplayed(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Count products
            const products = page.locator('.inventory_item');
            const count = await products.count();
            
            if (count === 0) {
                throw new Error('No products found on page');
            }
            
            await actionLogger.logAction('validate_products_displayed', {
                product_count: count
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'validate_products_displayed' });
            throw error;
        }
    }

    @CSBDDStepDef('I add a product to cart')
    async addProductToCart(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Click first add to cart button
            await page.locator('[data-test^="add-to-cart"]').first().click();
            
            await actionLogger.logAction('add_product_to_cart', {
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'add_product_to_cart' });
            throw error;
        }
    }

    @CSBDDStepDef('I view the shopping cart')
    async viewShoppingCart(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            await page.locator('.shopping_cart_link').click();
            
            await actionLogger.logAction('view_shopping_cart', {
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'view_shopping_cart' });
            throw error;
        }
    }

    @CSBDDStepDef('I should see the item in the cart')
    async validateItemInCart(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        try {
            const page = BDDContext.getCurrentPage();
            
            // Wait for cart item
            await page.locator('.cart_item').waitFor({
                state: 'visible',
                timeout: 5000
            });
            
            // Count cart items
            const count = await page.locator('.cart_item').count();
            
            await actionLogger.logAction('validate_item_in_cart', {
                item_count: count
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'validate_item_in_cart' });
            throw error;
        }
    }

    private resolveUrl(url: string): string {
        // If URL is absolute, return as is
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        // If base URL is not set, return URL as is
        if (!this.baseUrl) {
            return url;
        }
        
        // Join base URL and relative URL
        return new URL(url, this.baseUrl).toString();
    }
}