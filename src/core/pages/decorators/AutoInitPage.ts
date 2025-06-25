import { CSBasePage } from '../CSBasePage';
import { BDDContext } from '../../../bdd/context/BDDContext';

/**
 * Decorator for automatic page object initialization
 * Ensures page objects are initialized before use
 */
export function AutoInitPage(target: any, propertyKey: string) {
    let pageInstance: CSBasePage | null = null;
    let isInitializing = false;

    const getter = async function(this: any) {
        // If already initialized, return the instance
        if (pageInstance && pageInstance['_initialized']) {
            return pageInstance;
        }

        // Prevent recursive initialization
        if (isInitializing) {
            return pageInstance;
        }

        try {
            isInitializing = true;

            // Create instance if not exists
            if (!pageInstance) {
                const PageClass = Reflect.getMetadata('design:type', target, propertyKey);
                if (!PageClass) {
                    throw new Error(`Cannot determine type for property ${propertyKey}. Make sure TypeScript's emitDecoratorMetadata is enabled.`);
                }
                pageInstance = new PageClass();
            }

            // Get current page from BDDContext
            const page = BDDContext.getCurrentPage();
            
            // Initialize the page object
            if (pageInstance) {
                await pageInstance.initialize(page);
            }
            
            return pageInstance;
        } finally {
            isInitializing = false;
        }
    };

    const setter = function(value: any) {
        pageInstance = value;
    };

    // Delete the original property
    if (delete target[propertyKey]) {
        // Define the property with getter/setter
        Object.defineProperty(target, propertyKey, {
            get: getter,
            set: setter,
            enumerable: true,
            configurable: true
        });
    }
}