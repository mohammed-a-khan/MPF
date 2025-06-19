// src/core/elements/decorators/CSGetElement.ts
import { CSWebElement, ElementConfig } from '../CSWebElement';
import { CSGetElementOptions } from '../types/element.types';
import { Page } from 'playwright';
import { ElementMetadata } from './ElementMetadata';

/**
 * Decorator for defining page elements with automatic initialization
 * @param options Element locator options
 */
export function CSGetElement(options: CSGetElementOptions): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        const propertyName = propertyKey.toString();
        const className = target.constructor.name;
        
        // Store metadata for CSBasePage initialization
        ElementMetadata.store(className, propertyName, options);
        
        // Create a private property to store the element instance
        const privateKey = `_element_${propertyName}`;
        
        Object.defineProperty(target, propertyKey, {
            get: function () {
                // Check if element already exists
                if (this[privateKey]) {
                    return this[privateKey];
                }
                
                // Ensure page is available
                const page = this.page as Page;
                if (!page) {
                    throw new Error(`Page is not initialized for ${className}.${propertyName}. Make sure the page object is properly initialized with a page instance.`);
                }

                // Create element configuration
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

                // Create and cache the element
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

// Additional decorators for common element types

/**
 * Decorator for button elements
 */
export function CSButton(options: Partial<CSGetElementOptions> & { text: string }): PropertyDecorator {
    return CSGetElement({
        locatorType: 'role',
        locatorValue: `button:${options.text}`,
        description: options.description || `${options.text} button`,
        ...options
    });
}

/**
 * Decorator for input elements
 */
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

/**
 * Decorator for link elements
 */
export function CSLink(options: Partial<CSGetElementOptions> & { text: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'role',
    locatorValue: `link:${options.text}`,
    description: options.description || `${options.text} link`,
    ...options
  });
}

/**
 * Decorator for checkbox elements
 */
export function CSCheckbox(options: Partial<CSGetElementOptions> & { label: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'role',
    locatorValue: `checkbox:${options.label}`,
    description: options.description || `${options.label} checkbox`,
    ...options
  });
}

/**
 * Decorator for select/dropdown elements
 */
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

/**
 * Decorator for text elements
 */
export function CSText(options: Partial<CSGetElementOptions> & { text: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'text',
    locatorValue: options.text,
    description: options.description || `Text: ${options.text}`,
    ...options
  });
}

/**
 * Decorator for elements by test ID
 */
export function CSTestId(options: Partial<CSGetElementOptions> & { testId: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'testid',
    locatorValue: options.testId,
    description: options.description || `Test ID: ${options.testId}`,
    ...options
  });
}

/**
 * Decorator for image elements
 */
export function CSImage(options: Partial<CSGetElementOptions> & { alt: string }): PropertyDecorator {
  return CSGetElement({
    locatorType: 'alt',
    locatorValue: options.alt,
    description: options.description || `Image: ${options.alt}`,
    ...options
  });
}
