import { Locator, Page } from 'playwright';
import { CSWebElement } from './CSWebElement';
import { ActionLogger } from '../logging/ActionLogger';
import { logger } from '../utils/Logger';

/**
 * Smart element resolver that handles context destruction and re-resolution
 */
export class SmartElementResolver {
    private static readonly MAX_RETRIES = 3;
    private static readonly RETRY_DELAY = 1000;
    
    /**
     * Resolve element with automatic retry on context destruction
     */
    static async resolveWithRetry(element: CSWebElement): Promise<Locator> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                // Get current page
                const page = element.page;
                
                // Create locator
                const locator = await this.createLocator(element, page);
                
                // Verify locator is valid
                await this.verifyLocator(locator, element.description);
                
                return locator;
            } catch (error: any) {
                lastError = error;
                
                if (this.isContextDestroyedError(error)) {
                    ActionLogger.logDebug(`Context destroyed for element "${element.description}", attempt ${attempt}/${this.MAX_RETRIES}`);
                    
                    if (attempt < this.MAX_RETRIES) {
                        // Wait before retry
                        await this.wait(this.RETRY_DELAY);
                        
                        // Wait for page to be ready
                        await this.waitForPageReady(element.page);
                        
                        continue;
                    }
                }
                
                // For non-context errors or final attempt, throw
                break;
            }
        }
        
        throw lastError || new Error(`Failed to resolve element: ${element.description}`);
    }
    
    /**
     * Create locator based on element configuration
     */
    private static async createLocator(element: CSWebElement, page: Page): Promise<Locator> {
        const options = element.options;
        
        switch (options.locatorType) {
            case 'xpath':
                return page.locator(`xpath=${options.locatorValue}`);
            case 'css':
                return page.locator(options.locatorValue);
            case 'id':
                return page.locator(`#${options.locatorValue}`);
            case 'text':
                return page.getByText(options.locatorValue);
            case 'role':
                return page.getByRole(options.locatorValue as any);
            case 'testid':
                return page.getByTestId(options.locatorValue);
            case 'label':
                return page.getByLabel(options.locatorValue);
            case 'placeholder':
                return page.getByPlaceholder(options.locatorValue);
            case 'alt':
                return page.getByAltText(options.locatorValue);
            case 'title':
                return page.getByTitle(options.locatorValue);
            default:
                return page.locator(options.locatorValue);
        }
    }
    
    /**
     * Verify locator is valid
     */
    private static async verifyLocator(locator: Locator, description: string): Promise<void> {
        try {
            // Try to count elements - this will fail if context is destroyed
            const count = await locator.count();
            
            if (count === 0) {
                ActionLogger.logDebug(`No elements found for: ${description}`);
            } else {
                ActionLogger.logDebug(`Found ${count} element(s) for: ${description}`);
            }
        } catch (error: any) {
            if (this.isContextDestroyedError(error)) {
                throw error; // Re-throw to trigger retry
            }
            
            // For other errors, log and continue
            logger.warn(`Error verifying locator for ${description}:`, error);
        }
    }
    
    /**
     * Check if error is due to context destruction
     */
    private static isContextDestroyedError(error: any): boolean {
        const errorMessage = error?.message || '';
        return errorMessage.includes('Execution context was destroyed') ||
               errorMessage.includes('Target page, context or browser has been closed') ||
               errorMessage.includes('frame got detached');
    }
    
    /**
     * Wait for specified time
     */
    private static async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Wait for page to be ready
     */
    private static async waitForPageReady(page: Page): Promise<void> {
        try {
            // Wait for page to be in a stable state
            await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
            
            // Additional check for document ready
            await page.evaluate(() => {
                return new Promise((resolve) => {
                    if (document.readyState === 'complete') {
                        resolve(undefined);
                    } else {
                        window.addEventListener('load', () => resolve(undefined));
                    }
                });
            });
        } catch (error) {
            // If waiting fails, continue anyway
            logger.debug('Page ready check failed, continuing...', error as Error);
        }
    }
}