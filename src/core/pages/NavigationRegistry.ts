import { Page } from 'playwright';
import { NavigationObserver } from './NavigationObserver';

/**
 * Registry to manage NavigationObservers for pages
 * This ensures automatic navigation handling across the framework
 */
export class NavigationRegistry {
    private static instance: NavigationRegistry;
    private observers: WeakMap<Page, NavigationObserver> = new WeakMap();
    
    private constructor() {}
    
    static getInstance(): NavigationRegistry {
        if (!NavigationRegistry.instance) {
            NavigationRegistry.instance = new NavigationRegistry();
        }
        return NavigationRegistry.instance;
    }
    
    /**
     * Register a NavigationObserver for a page
     */
    register(page: Page, observer: NavigationObserver): void {
        this.observers.set(page, observer);
    }
    
    /**
     * Get NavigationObserver for a page
     */
    getObserver(page: Page): NavigationObserver | undefined {
        return this.observers.get(page);
    }
    
    /**
     * Ensure page is ready for interaction
     */
    async ensurePageReady(page: Page): Promise<void> {
        const observer = this.observers.get(page);
        if (observer) {
            await observer.ensurePageReady();
        }
    }
    
    /**
     * Check if navigation is in progress for a page
     */
    isNavigationInProgress(page: Page): boolean {
        const observer = this.observers.get(page);
        return observer?.isNavigationInProgress() || false;
    }
    
    /**
     * Unregister observer when page is closed
     */
    unregister(page: Page): void {
        this.observers.delete(page);
    }
}