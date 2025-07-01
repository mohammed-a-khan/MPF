// src/core/elements/decorators/CSGetElement.ts
import { CSWebElement, ElementConfig } from '../CSWebElement';
import { CSGetElementOptions } from '../types/element.types';
import { Page } from 'playwright';
import { ElementMetadata } from './ElementMetadata';

export function CSGetElement(options: CSGetElementOptions): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        const propertyName = propertyKey.toString();
        const className = target.constructor.name;
        
        ElementMetadata.store(className, propertyName, options);
        
        const privateKey = `_element_${propertyName}`;
        
        Object.defineProperty(target, propertyKey, {
            get: function () {
                const page = this.page as Page;
                if (!page) {
                    throw new Error(`Page is not initialized for ${className}.${propertyName}. Make sure the page object is properly initialized with a page instance.`);
                }
                
                if (this[privateKey]) {
                    const element = this[privateKey] as CSWebElement;
                    try {
                        if (page.isClosed()) {
                            delete this[privateKey];
                        } else if (element.page !== page || element.page.isClosed()) {
                            delete this[privateKey];
                        } else {
                            element.page = page;
                            return element;
                        }
                    } catch (error) {
                        delete this[privateKey];
                    }
                }

                const config: ElementConfig = {
                    locatorType: options.locatorType,
                    locatorValue: options.locatorValue,
                    description: options.description,
                    waitForVisible: options.waitForVisible ?? false,
                    waitForEnabled: options.waitForEnabled ?? false,
                    waitTimeout: options.waitTimeout ?? 30000,
                    required: options.required ?? false,
                    aiEnabled: options.aiEnabled ?? false,
                    aiDescription: options.aiDescription ?? options.description,
                    aiConfidenceThreshold: options.aiConfidenceThreshold ?? 0.8,
                    fallbacks: []
                };

                const element = new CSWebElement(page, config);
                this[privateKey] = element;
                
                return element;
            },
            set: function (_value) {
                throw new Error(`Cannot set ${className}.${propertyName}. Elements are read-only.`);
            },
            enumerable: true,
            configurable: true
        });
    };
}


export function CSButton(options: Partial<CSGetElementOptions> & { text: string }): PropertyDecorator {
    return CSGetElement({
        locatorType: 'role',
        locatorValue: `button:${options.text}`,
        description: options.description || `${options.text} button`,
        ...options
    });
}

export function CSInput(options: Partial<CSGetElementOptions> & { label?: string; placeholder?: string }): PropertyDecorator {
  if (options.label) {
    return CSGetElement({
      locatorType: 'label',
      locatorValue: options.label,
      description: options.description || `${options.label} input`,
      ...options
    });
  } else if (options.placeholder) {
    return CSGetElement({
      locatorType: 'placeholder',
      locatorValue: options.placeholder,
      description: options.description || `${options.placeholder} input`,
      ...options
    });
  } else {
    throw new Error('CSInput requires either label or placeholder');
  }
}

export function CSLink(options: Partial<CSGetElementOptions> & { text: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'role',
    locatorValue: `link:${options.text}`,
    description: options.description || `${options.text} link`,
    ...options
  });
}

export function CSCheckbox(options: Partial<CSGetElementOptions> & { label: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'role',
    locatorValue: `checkbox:${options.label}`,
    description: options.description || `${options.label} checkbox`,
    ...options
  });
}

export function CSSelect(options: Partial<CSGetElementOptions> & { label?: string; name?: string }): PropertyDecorator {
  if (options.label) {
    return CSGetElement({
      locatorType: 'label',
      locatorValue: options.label,
      description: options.description || `${options.label} dropdown`,
      ...options
    });
  } else if (options.name) {
    return CSGetElement({
      locatorType: 'css',
      locatorValue: `select[name="${options.name}"]`,
      description: options.description || `${options.name} dropdown`,
      ...options
    });
  } else {
    throw new Error('CSSelect requires either label or name');
  }
}

export function CSText(options: Partial<CSGetElementOptions> & { text: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'text',
    locatorValue: options.text,
    description: options.description || `Text: ${options.text}`,
    ...options
  });
}

export function CSTestId(options: Partial<CSGetElementOptions> & { testId: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'testid',
    locatorValue: options.testId,
    description: options.description || `Test ID: ${options.testId}`,
    ...options
  });
}

export function CSImage(options: Partial<CSGetElementOptions> & { alt: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'alt',
    locatorValue: options.alt,
    description: options.description || `Image: ${options.alt}`,
    ...options
  });
}
