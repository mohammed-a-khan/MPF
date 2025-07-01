import { CSBasePage } from '../CSBasePage';
import { BDDContext } from '../../../bdd/context/BDDContext';

export function AutoInitPage(target: any, propertyKey: string) {
    let pageInstance: CSBasePage | null = null;
    let isInitializing = false;

    const getter = async function(this: any) {
        if (pageInstance && pageInstance['_initialized']) {
            return pageInstance;
        }

        if (isInitializing) {
            return pageInstance;
        }

        try {
            isInitializing = true;

            if (!pageInstance) {
                const PageClass = Reflect.getMetadata('design:type', target, propertyKey);
                if (!PageClass) {
                    throw new Error(`Cannot determine type for property ${propertyKey}. Make sure TypeScript's emitDecoratorMetadata is enabled.`);
                }
                pageInstance = new PageClass();
            }

            const page = BDDContext.getCurrentPage();
            
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

    if (delete target[propertyKey]) {
        Object.defineProperty(target, propertyKey, {
            get: getter,
            set: setter,
            enumerable: true,
            configurable: true
        });
    }
}
