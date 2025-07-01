import { Page } from 'playwright';
import { ActionLogger } from '../logging/ActionLogger';

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
    
    private setupNavigationListeners(): void {
        this.page.on('framenavigated', (frame) => {
            if (frame === this.page.mainFrame()) {
                const newUrl = frame.url();
                if (newUrl !== this.lastUrl) {
                    ActionLogger.logDebug(`Navigation detected: ${this.lastUrl} -> ${newUrl}`);
                    this.lastUrl = newUrl;
                    this.isNavigating = true;
                    
                    this.navigationPromise = this.waitForPageStability();
                }
            }
        });
        
        this.page.on('requestfailed', (request) => {
            if (request.failure()?.errorText.includes('net::ERR_ABORTED')) {
                this.isNavigating = true;
            }
        });
        
        this.page.context().on('page', (newPage) => {
            ActionLogger.logDebug('New page detected in context');
        });
    }
    
    private async waitForPageStability(): Promise<void> {
        try {
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
            
            await this.waitForUrlStability();
            
            await this.waitForDomStability();
            
            await this.page.waitForTimeout(500);
            
            this.isNavigating = false;
            ActionLogger.logDebug('Page is now stable after navigation');
        } catch (error) {
            ActionLogger.logDebug('Error waiting for page stability:', error as Error);
            this.isNavigating = false;
        }
    }
    
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
    
    private async waitForDomStability(): Promise<void> {
        try {
            await this.page.waitForFunction(
                () => {
                    if (document.readyState !== 'complete') return false;
                    
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
        } catch (error: any) {
            if (error.message?.includes('unsafe-eval') || 
                error.message?.includes('CSP') ||
                error.message?.includes('EvalError')) {
                ActionLogger.logDebug('CSP restriction during DOM stability check, using timeout');
                await this.page.waitForTimeout(2000);
            }
        }
    }
    
    public isNavigationInProgress(): boolean {
        return this.isNavigating;
    }
    
    public async waitForNavigation(): Promise<void> {
        if (this.navigationPromise) {
            await this.navigationPromise;
        }
    }
    
    public async ensurePageReady(): Promise<void> {
        if (this.isNavigating) {
            await this.waitForNavigation();
        }
        
        try {
            await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        } catch {
        }
    }
    
    public getCurrentUrl(): string {
        return this.page.url();
    }
    
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
