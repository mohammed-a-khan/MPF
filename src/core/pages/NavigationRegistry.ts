import { Page } from 'playwright';
import { NavigationObserver } from './NavigationObserver';

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
    
    register(page: Page, observer: NavigationObserver): void {
        this.observers.set(page, observer);
    }
    
    getObserver(page: Page): NavigationObserver | undefined {
        return this.observers.get(page);
    }
    
    async ensurePageReady(page: Page): Promise<void> {
        const observer = this.observers.get(page);
        if (observer) {
            await observer.ensurePageReady();
        }
    }
    
    isNavigationInProgress(page: Page): boolean {
        const observer = this.observers.get(page);
        return observer?.isNavigationInProgress() || false;
    }
    
    unregister(page: Page): void {
        this.observers.delete(page);
    }
}
