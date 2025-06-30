import { Page } from 'playwright';
import { ActionLogger } from '../logging/ActionLogger';

/**
 * Observes and handles page navigation automatically
 * Detects navigation events and ensures page stability
 */
export class NavigationObserver {
    private page: Page;
    private lastUrl: string;
    private isNavigating: boolean = false;
    private navigationPromise: Promise<void> | null = null;
    private frameNavigationPromises: Map<string, Promise<void>> = new Map();
    
    constructor(page: Page) {
        this.page = page;
        this.lastUrl = page.url();
        this.setupNavigationListeners();
    }
    
    /**
     * Setup listeners for navigation events
     */
    private setupNavigationListeners(): void {
        // Track navigation start
        this.page.on('framenavigated', (frame) => {
            if (frame === this.page.mainFrame()) {
                const newUrl = frame.url();
                if (newUrl !== this.lastUrl) {
                    ActionLogger.logDebug(`Navigation detected: ${this.lastUrl} -> ${newUrl}`);
                    this.lastUrl = newUrl;
                    this.isNavigating = true;
                    
                    // Create navigation promise that resolves when page is stable
                    this.navigationPromise = this.waitForPageStability();
                }
            }
        });
        
        // Track request failures that might indicate navigation issues
        this.page.on('requestfailed', (request) => {
            if (request.failure()?.errorText.includes('net::ERR_ABORTED')) {
                // This often happens during navigation
                this.isNavigating = true;
            }
        });
        
        // Track new page contexts (for popups)
        this.page.context().on('page', (newPage) => {
            ActionLogger.logDebug('New page detected in context');
        });
    }
    
    /**
     * Wait for page to be completely stable after navigation
     */
    private async waitForPageStability(): Promise<void> {
        try {
            // First, wait for basic load state
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
            
            // Then check for URL stability (handles multiple redirects)
            await this.waitForUrlStability();
            
            // Wait for DOM to be stable
            await this.waitForDomStability();
            
            // Small final wait to ensure everything is settled
            await this.page.waitForTimeout(500);
            
            this.isNavigating = false;
            ActionLogger.logDebug('Page is now stable after navigation');
        } catch (error) {
            ActionLogger.logDebug('Error waiting for page stability:', error as Error);
            this.isNavigating = false;
        }
    }
    
    /**
     * Wait for URL to stop changing (handles redirects)
     */
    private async waitForUrlStability(): Promise<void> {
        let previousUrl = this.page.url();
        let stableCount = 0;
        const requiredStableChecks = 3;
        const checkInterval = 500;
        const maxWaitTime = 30000;
        const startTime = Date.now();
        
        while (stableCount < requiredStableChecks) {
            await this.page.waitForTimeout(checkInterval);
            const currentUrl = this.page.url();
            
            if (currentUrl === previousUrl) {
                stableCount++;
            } else {
                stableCount = 0;
                ActionLogger.logDebug(`URL changed during stability check: ${currentUrl}`);
            }
            
            previousUrl = currentUrl;
            
            if (Date.now() - startTime > maxWaitTime) {
                ActionLogger.logDebug('URL stability check timeout');
                break;
            }
        }
    }
    
    /**
     * Wait for DOM to be stable (no major changes)
     */
    private async waitForDomStability(): Promise<void> {
        try {
            await this.page.waitForFunction(
                () => {
                    // Check if key indicators of page readiness exist
                    if (document.readyState !== 'complete') return false;
                    
                    // Check for common loading indicators
                    const loadingIndicators = [
                        '.loading', '.spinner', '.loader',
                        '[data-loading="true"]', '[aria-busy="true"]'
                    ];
                    
                    for (const selector of loadingIndicators) {
                        const element = document.querySelector(selector);
                        if (element && window.getComputedStyle(element).display !== 'none') {
                            return false;
                        }
                    }
                    
                    return true;
                },
                { timeout: 10000 }
            );
        } catch {
            // If this fails, it's okay - we tried our best
        }
    }
    
    /**
     * Check if navigation is currently in progress
     */
    public isNavigationInProgress(): boolean {
        return this.isNavigating;
    }
    
    /**
     * Wait for any ongoing navigation to complete
     */
    public async waitForNavigation(): Promise<void> {
        if (this.navigationPromise) {
            await this.navigationPromise;
        }
    }
    
    /**
     * Ensure page is ready for interaction
     */
    public async ensurePageReady(): Promise<void> {
        // If navigation is in progress, wait for it
        if (this.isNavigating) {
            await this.waitForNavigation();
        }
        
        // Additional check for page readiness
        try {
            await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        } catch {
            // Page might already be loaded
        }
    }
    
    /**
     * Get current page URL
     */
    public getCurrentUrl(): string {
        return this.page.url();
    }
    
    /**
     * Check if we're on a different domain (like NetScaler)
     */
    public isOnDifferentDomain(originalDomain: string): boolean {
        try {
            const currentUrl = new URL(this.page.url());
            const originalUrl = new URL(originalDomain);
            return currentUrl.hostname !== originalUrl.hostname;
        } catch {
            return false;
        }
    }
}