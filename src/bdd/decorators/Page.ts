import 'reflect-metadata';
import { CSBasePage } from '../../core/pages/CSBasePage';
import { BDDContext } from '../context/BDDContext';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Decorator for automatic page object initialization
 * Usage: @Page(LoginPage) loginPage!: LoginPage;
 */
export function Page<T extends CSBasePage>(PageClass: new () => T) {
    return function (target: any, propertyKey: string) {
        const cacheKey = Symbol(`_${propertyKey}_cache`);
        const initKey = Symbol(`_${propertyKey}_initialized`);

        Object.defineProperty(target, propertyKey, {
            get: function() {
                // Check if already initialized
                if (this[initKey]) {
                    return this[cacheKey];
                }

                // Create and initialize the page object
                const pageInstance = new PageClass();
                const page = BDDContext.getCurrentPage();
                
                // Initialize synchronously by returning a proxy that handles async initialization
                const proxy = new Proxy(pageInstance, {
                    get: (target, prop) => {
                        // For any method call, ensure initialization first
                        const value = (target as any)[prop];
                        if (typeof value === 'function') {
                            return async (...args: any[]) => {
                                // Initialize if not already done
                                if (!(target as any)['_initialized']) {
                                    await target.initialize(page);
                                    ActionLogger.logDebug(`Page object auto-initialized: ${PageClass.name}`);
                                }
                                // Call the original method
                                return value.apply(target, args);
                            };
                        }
                        return value;
                    }
                });

                // Cache the proxy
                this[cacheKey] = proxy;
                this[initKey] = true;

                return proxy;
            },
            enumerable: true,
            configurable: true
        });
    };
}

/**
 * Alternative simpler decorator that requires async initialization in before() hook
 * This is cleaner but requires a one-time setup
 */
export function PageObject<T extends CSBasePage>(PageClass: new () => T) {
    return function (target: any, propertyKey: string) {
        // Store the page class metadata
        Reflect.defineMetadata('page:class', PageClass, target, propertyKey);
        
        // Mark this property as a page object
        const existingPages = Reflect.getMetadata('page:properties', target) || [];
        existingPages.push(propertyKey);
        Reflect.defineMetadata('page:properties', existingPages, target);
    };
}