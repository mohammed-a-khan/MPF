import { Page } from 'playwright';
import { ActionLogger } from '../logging/ActionLogger';
import { logger } from '../utils/Logger';

/**
 * Handles cross-domain navigation scenarios like NetScaler authentication
 * Ensures page context is preserved during domain switches
 */
export class CrossDomainNavigationHandler {
    private page: Page;
    private originalDomain: string = '';
    private isNavigating: boolean = false;
    private navigationPromise: Promise<void> | null = null;
    
    constructor(page: Page) {
        this.page = page;
        this.setupNavigationHandlers();
    }
    
    /**
     * Setup handlers for cross-domain navigation
     */
    private setupNavigationHandlers(): void {
        // Don't track initial domain yet - it might be NetScaler
        
        // Handle navigation events
        this.page.on('framenavigated', async (frame) => {
            if (frame === this.page.mainFrame()) {
                const currentUrl = frame.url();
                const currentDomain = this.extractDomain(currentUrl);
                
                // If original domain is not set and we're on a login page, this might be NetScaler
                if (!this.originalDomain && this.isAuthenticationPage(currentUrl)) {
                    ActionLogger.logDebug(`Initial navigation to authentication page: ${currentDomain}`);
                    this.isNavigating = true;
                    return;
                }
                
                // If we have an original domain and navigated away
                if (this.originalDomain && currentDomain !== this.originalDomain) {
                    ActionLogger.logDebug(`Cross-domain navigation detected: ${this.originalDomain} -> ${currentDomain}`);
                    this.isNavigating = true;
                    
                    // Create a promise that resolves when we're back on original domain
                    this.navigationPromise = this.waitForReturnToOriginalDomain();
                }
            }
        });
        
        // Handle page lifecycle events
        this.page.on('load', () => {
            const currentDomain = this.extractDomain(this.page.url());
            if (this.originalDomain && currentDomain === this.originalDomain && this.isNavigating) {
                ActionLogger.logDebug('Returned to original domain after authentication');
                this.isNavigating = false;
            }
        });
    }
    
    /**
     * Check if URL is an authentication page
     */
    private isAuthenticationPage(url: string): boolean {
        const authIndicators = [
            'netscaler',
            'citrix',
            'auth',
            'login',
            'logon',
            'signin',
            'sso',
            'adfs',
            'okta'
        ];
        
        const lowerUrl = url.toLowerCase();
        return authIndicators.some(indicator => lowerUrl.includes(indicator));
    }
    
    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return '';
        }
    }
    
    /**
     * Wait for navigation to return to original domain
     */
    private async waitForReturnToOriginalDomain(): Promise<void> {
        const maxWaitTime = 60000; // 60 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const currentDomain = this.extractDomain(this.page.url());
            
            if (currentDomain === this.originalDomain) {
                // We're back on original domain
                ActionLogger.logDebug('Successfully returned to original domain');
                
                // Wait for page to stabilize
                await this.waitForPageStability();
                return;
            }
            
            // Check every 500ms
            await this.page.waitForTimeout(500);
        }
        
        throw new Error('Timeout waiting for return to original domain after authentication');
    }
    
    /**
     * Wait for page to be completely stable
     */
    private async waitForPageStability(): Promise<void> {
        try {
            // Wait for network to be idle
            await this.page.waitForLoadState('networkidle', { timeout: 30000 });
            
            // Additional stability checks
            await this.page.evaluate(() => {
                return new Promise((resolve) => {
                    if (document.readyState === 'complete') {
                        // Wait a bit more for any dynamic content
                        setTimeout(resolve, 1000);
                    } else {
                        window.addEventListener('load', () => {
                            setTimeout(resolve, 1000);
                        });
                    }
                });
            });
            
            ActionLogger.logDebug('Page is stable after cross-domain navigation');
        } catch (error) {
            logger.warn('Page stability check failed, continuing anyway', error as Error);
        }
    }
    
    /**
     * Handle cross-domain navigation
     */
    public async handleCrossDomainNavigation(): Promise<void> {
        if (this.navigationPromise) {
            ActionLogger.logDebug('Waiting for cross-domain navigation to complete...');
            await this.navigationPromise;
            this.navigationPromise = null;
        }
    }
    
    /**
     * Check if cross-domain navigation is in progress
     */
    public isInCrossDomainNavigation(): boolean {
        return this.isNavigating;
    }
    
    /**
     * Update original domain (useful when navigating to a new base URL)
     */
    public updateOriginalDomain(url: string): void {
        this.originalDomain = this.extractDomain(url);
        ActionLogger.logDebug(`Updated original domain to: ${this.originalDomain}`);
    }
    
    /**
     * Force wait for navigation completion
     */
    public async forceWaitForNavigation(): Promise<void> {
        // First check if we're in cross-domain navigation
        if (this.isNavigating) {
            await this.handleCrossDomainNavigation();
        }
        
        // Then ensure page is stable
        await this.waitForPageStability();
    }
    
    /**
     * Handle initial navigation that redirects to authentication
     */
    public async handleInitialAuthRedirect(targetUrl: string): Promise<void> {
        const targetDomain = this.extractDomain(targetUrl);
        
        // Set the target domain as our original domain
        this.originalDomain = targetDomain;
        ActionLogger.logDebug(`Target domain set to: ${this.originalDomain}`);
        
        // Wait for either:
        // 1. We reach the target domain (no auth needed)
        // 2. We get redirected to auth page
        const maxWaitTime = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const currentUrl = this.page.url();
            const currentDomain = this.extractDomain(currentUrl);
            
            if (currentDomain === this.originalDomain) {
                // We reached target domain directly
                ActionLogger.logDebug('Reached target domain without authentication');
                await this.waitForPageStability();
                return;
            }
            
            if (this.isAuthenticationPage(currentUrl)) {
                // We were redirected to auth page
                ActionLogger.logDebug('Redirected to authentication page');
                this.isNavigating = true;
                
                // Now wait for authentication to complete and return to target
                this.navigationPromise = this.waitForReturnToOriginalDomain();
                return;
            }
            
            await this.page.waitForTimeout(500);
        }
    }
}