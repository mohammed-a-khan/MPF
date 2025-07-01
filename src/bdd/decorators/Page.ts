import 'reflect-metadata';
import { CSBasePage } from '../../core/pages/CSBasePage';
import { BDDContext } from '../context/BDDContext';
import { ActionLogger } from '../../core/logging/ActionLogger';

export function Page<T extends CSBasePage>(PageClass: new () => T) {
    return function (target: any, propertyKey: string) {
        const cacheKey = Symbol(`_${propertyKey}_cache`);
        const initKey = Symbol(`_${propertyKey}_initialized`);

        Object.defineProperty(target, propertyKey, {
            get: function() {
                if (this[initKey]) {
                    return this[cacheKey];
                }

                const pageInstance = new PageClass();
                const page = BDDContext.getCurrentPage();
                
                const proxy = new Proxy(pageInstance, {
                    get: (target, prop) => {
                        const value = (target as any)[prop];
                        if (typeof value === 'function') {
                            return async (...args: any[]) => {
                                if (!(target as any)['_initialized']) {
                                    await target.initialize(page);
                                    ActionLogger.logDebug(`Page object auto-initialized: ${PageClass.name}`);
                                }
                                return value.apply(target, args);
                            };
                        }
                        return value;
                    }
                });

                this[cacheKey] = proxy;
                this[initKey] = true;

                return proxy;
            },
            enumerable: true,
            configurable: true
        });
    };
}

export function PageObject<T extends CSBasePage>(PageClass: new () => T) {
    return function (target: any, propertyKey: string) {
        Reflect.defineMetadata('page:class', PageClass, target, propertyKey);
        
        const existingPages = Reflect.getMetadata('page:properties', target) || [];
        existingPages.push(propertyKey);
        Reflect.defineMetadata('page:properties', existingPages, target);
    };
}
