import { Page } from 'playwright';
import { ActionLogger } from '../logging/ActionLogger';
import { logger } from '../utils/Logger';

export class CrossDomainNavigationHandler {
    private page: Page;
    private originalDomain: string = '';
    private isNavigating: boolean = false;
    private navigationPromise: Promise<void> | null = null;
    
    constructor(page: Page) {
        this.page = page;
        this.setupNavigationHandlers();
    }
    
    private setupNavigationHandlers(): void {
        
        this.page.on('framenavigated', async (frame) => {
            if (frame === this.page.mainFrame()) {
                const currentUrl = frame.url();
                const currentDomain = this.extractDomain(currentUrl);
                
                if (this.originalDomain && 
                    currentDomain === this.originalDomain && 
                    this.isNavigating) {
                    ActionLogger.logDebug(`Returned to original domain: ${this.originalDomain}`);
                    this.isNavigating = false;
                }
                
                if (this.originalDomain && 
                    currentDomain !== this.originalDomain && 
                    !this.isAuthenticationPage(currentUrl)) {
                    ActionLogger.logDebug(`Cross-domain navigation detected: ${this.originalDomain} -> ${currentDomain}`);
                    this.isNavigating = true;
                    
                    this.navigationPromise = this.waitForReturnToOriginalDomain();
                }
            }
        });
        
        this.page.on('load', () => {
            const currentDomain = this.extractDomain(this.page.url());
            if (this.originalDomain && currentDomain === this.originalDomain && this.isNavigating) {
                ActionLogger.logDebug('Returned to original domain after authentication');
                this.isNavigating = false;
            }
        });
    }
    
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
    
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return '';
        }
    }
    
    private async waitForReturnToOriginalDomain(): Promise<void> {
        const maxWaitTime = 60000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const currentDomain = this.extractDomain(this.page.url());
            
            if (currentDomain === this.originalDomain) {
                ActionLogger.logDebug('Successfully returned to original domain');
                
                await this.waitForPageStability();
                return;
            }
            
            await this.page.waitForTimeout(500);
        }
        
        throw new Error('Timeout waiting for return to original domain after authentication');
    }
    
    private async waitForPageStability(): Promise<void> {
        try {
            if (this.page.url() === 'about:blank') {
                await this.page.waitForNavigation({ 
                    waitUntil: 'domcontentloaded', 
                    timeout: 10000 
                }).catch(() => {});
            }
            
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
                return this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            });
            
            try {
                await this.page.evaluate(() => {
                    return new Promise((resolve) => {
                        if (document.readyState === 'complete') {
                            setTimeout(resolve, 1000);
                        } else {
                            window.addEventListener('load', () => {
                                setTimeout(resolve, 1000);
                            });
                        }
                    });
                });
            } catch (error: any) {
                if (error.message?.includes('unsafe-eval') || error.message?.includes('CSP')) {
                    ActionLogger.logDebug('CSP restriction detected, using alternative wait method');
                    await this.page.waitForTimeout(2000);
                } else {
                    throw error;
                }
            }
            
            ActionLogger.logDebug('Page is stable after cross-domain navigation');
        } catch (error) {
            logger.warn('Page stability check failed, continuing anyway', error as Error);
        }
    }
    
    public async handleCrossDomainNavigation(): Promise<void> {
        if (this.navigationPromise) {
            ActionLogger.logDebug('Waiting for cross-domain navigation to complete...');
            await this.navigationPromise;
            this.navigationPromise = null;
        }
    }
    
    public isInCrossDomainNavigation(): boolean {
        return this.isNavigating;
    }
    
    public updateOriginalDomain(url: string): void {
        this.originalDomain = this.extractDomain(url);
        ActionLogger.logDebug(`Updated original domain to: ${this.originalDomain}`);
    }
    
    public async forceWaitForNavigation(): Promise<void> {
        if (this.isNavigating) {
            await this.handleCrossDomainNavigation();
        }
        
        await this.waitForPageStability();
    }
    
    public async handleInitialAuthRedirect(targetUrl: string): Promise<void> {
        const targetDomain = this.extractDomain(targetUrl);
        
        this.originalDomain = targetDomain;
        ActionLogger.logDebug(`Target domain set to: ${this.originalDomain}`);
        
        let attempts = 0;
        while (this.page.url() === 'about:blank' && attempts < 20) {
            await this.page.waitForTimeout(100);
            attempts++;
        }
        
        ActionLogger.logDebug(`Current URL after navigation: ${this.page.url()}`);
        
        const currentPageUrl = this.page.url();
        if (currentPageUrl !== 'about:blank' && this.isAuthenticationPage(currentPageUrl)) {
            ActionLogger.logDebug(`Already on authentication page: ${currentPageUrl}`);
            this.isNavigating = false;
            return;
        }
        
        const maxWaitTime = 10000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const currentUrl = this.page.url();
            
            if (currentUrl === 'about:blank') {
                await this.page.waitForTimeout(500);
                continue;
            }
            
            const currentDomain = this.extractDomain(currentUrl);
            
            if (currentDomain === this.originalDomain) {
                ActionLogger.logDebug('Reached target domain without authentication');
                await this.waitForPageStability();
                return;
            }
            
            if (this.isAuthenticationPage(currentUrl)) {
                ActionLogger.logDebug(`Redirected to authentication page: ${currentUrl}`);
                this.isNavigating = false;
                
                try {
                    await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
                } catch {
                }
                
                ActionLogger.logDebug('Authentication page is ready for user interaction');
                return;
            }
            
            await this.page.waitForTimeout(500);
        }
        
        ActionLogger.logDebug(`Timeout waiting for navigation. Current URL: ${this.page.url()}`);
    }
}
