// src/core/elements/AdvancedSelectors.ts
import { Page, Locator } from 'playwright';
import {
  CSGetElementOptions,
  FilterOptions,
  ComponentOptions,
  ChainedSelector
} from './types/element.types';

export class AdvancedSelectors {
  private static instance: AdvancedSelectors;

  private constructor() {}

  static getInstance(): AdvancedSelectors {
    if (!AdvancedSelectors.instance) {
      AdvancedSelectors.instance = new AdvancedSelectors();
    }
    return AdvancedSelectors.instance;
  }

  async resolveLayoutSelector(
    page: Page,
    options: { base: Locator; options: CSGetElementOptions }
  ): Promise<Locator> {
    const { base, options: elementOptions } = options;
    let result = base;
    
    if (elementOptions.rightOf) {
      result = await this.applyRightOf(page, result, elementOptions.rightOf, elementOptions.maxDistance);
    }
    
    if (elementOptions.leftOf) {
      result = await this.applyLeftOf(page, result, elementOptions.leftOf, elementOptions.maxDistance);
    }
    
    if (elementOptions.above) {
      result = await this.applyAbove(page, result, elementOptions.above, elementOptions.maxDistance);
    }
    
    if (elementOptions.below) {
      result = await this.applyBelow(page, result, elementOptions.below, elementOptions.maxDistance);
    }
    
    if (elementOptions.near) {
      result = await this.applyNear(page, result, elementOptions.near, elementOptions.maxDistance);
    }
    
    return result;
  }

  private async applyRightOf(
    page: Page,
    base: Locator,
    rightOf: CSGetElementOptions,
    maxDistance?: number
  ): Promise<Locator> {
    const referenceLocator = this.createLocator(page, rightOf);
    
    const baseElements = await base.all();
    const filteredElements: Locator[] = [];
    
    for (const element of baseElements) {
      const elementBox = await element.boundingBox();
      const refBox = await referenceLocator.boundingBox();
      
      if (!refBox || !elementBox) continue;
      
      if (elementBox.x <= refBox.x + refBox.width) continue;
      
      const verticalOverlap = 
        elementBox.y < refBox.y + refBox.height &&
        elementBox.y + elementBox.height > refBox.y;
      
      if (!verticalOverlap) continue;
      
      if (maxDistance) {
        const distance = elementBox.x - (refBox.x + refBox.width);
        if (distance > maxDistance) continue;
      }
      
      filteredElements.push(element);
    }
    
    if (filteredElements.length > 0) {
      const firstElement = filteredElements[0];
      if (firstElement) {
        return firstElement;
      }
    }
    
    return page.locator('xpath=//no-such-element');
  }

  private async applyLeftOf(
    page: Page,
    base: Locator,
    leftOf: CSGetElementOptions,
    maxDistance?: number
  ): Promise<Locator> {
    const referenceLocator = this.createLocator(page, leftOf);
    
    const baseElements = await base.all();
    const filteredElements: Locator[] = [];
    
    for (const element of baseElements) {
      const elementBox = await element.boundingBox();
      const refBox = await referenceLocator.boundingBox();
      
      if (!refBox || !elementBox) continue;
      
      if (elementBox.x + elementBox.width >= refBox.x) continue;
      
      const verticalOverlap = 
        elementBox.y < refBox.y + refBox.height &&
        elementBox.y + elementBox.height > refBox.y;
      
      if (!verticalOverlap) continue;
      
      if (maxDistance) {
        const distance = refBox.x - (elementBox.x + elementBox.width);
        if (distance > maxDistance) continue;
      }
      
      filteredElements.push(element);
    }
    
    if (filteredElements.length > 0) {
      const firstElement = filteredElements[0];
      if (firstElement) {
        return firstElement;
      }
    }
    
    return page.locator('xpath=//no-such-element');
  }

  private async applyAbove(
    page: Page,
    base: Locator,
    above: CSGetElementOptions,
    maxDistance?: number
  ): Promise<Locator> {
    const referenceLocator = this.createLocator(page, above);
    
    const baseElements = await base.all();
    const filteredElements: Locator[] = [];
    
    for (const element of baseElements) {
      const elementBox = await element.boundingBox();
      const refBox = await referenceLocator.boundingBox();
      
      if (!refBox || !elementBox) continue;
      
      if (elementBox.y + elementBox.height >= refBox.y) continue;
      
      const horizontalOverlap = 
        elementBox.x < refBox.x + refBox.width &&
        elementBox.x + elementBox.width > refBox.x;
      
      if (!horizontalOverlap) continue;
      
      if (maxDistance) {
        const distance = refBox.y - (elementBox.y + elementBox.height);
        if (distance > maxDistance) continue;
      }
      
      filteredElements.push(element);
    }
    
    if (filteredElements.length > 0) {
      const firstElement = filteredElements[0];
      if (firstElement) {
        return firstElement;
      }
    }
    
    return page.locator('xpath=//no-such-element');
  }

  private async applyBelow(
    page: Page,
    base: Locator,
    below: CSGetElementOptions,
    maxDistance?: number
  ): Promise<Locator> {
    const referenceLocator = this.createLocator(page, below);
    
    const baseElements = await base.all();
    const filteredElements: Locator[] = [];
    
    for (const element of baseElements) {
      const elementBox = await element.boundingBox();
      const refBox = await referenceLocator.boundingBox();
      
      if (!refBox || !elementBox) continue;
      
      if (elementBox.y <= refBox.y + refBox.height) continue;
      
      const horizontalOverlap = 
        elementBox.x < refBox.x + refBox.width &&
        elementBox.x + elementBox.width > refBox.x;
      
      if (!horizontalOverlap) continue;
      
      if (maxDistance) {
        const distance = elementBox.y - (refBox.y + refBox.height);
        if (distance > maxDistance) continue;
      }
      
      filteredElements.push(element);
    }
    
    if (filteredElements.length > 0) {
      const firstElement = filteredElements[0];
      if (firstElement) {
        return firstElement;
      }
    }
    
    return page.locator('xpath=//no-such-element');
  }

  private async applyNear(
    page: Page,
    base: Locator,
    near: CSGetElementOptions,
    maxDistance: number = 100
  ): Promise<Locator> {
    const referenceLocator = this.createLocator(page, near);
    
    const baseElements = await base.all();
    const filteredElements: Locator[] = [];
    
    for (const element of baseElements) {
      const elementBox = await element.boundingBox();
      const refBox = await referenceLocator.boundingBox();
      
      if (!refBox || !elementBox) continue;
      
      const refCenterX = refBox.x + refBox.width / 2;
      const refCenterY = refBox.y + refBox.height / 2;
      const elementCenterX = elementBox.x + elementBox.width / 2;
      const elementCenterY = elementBox.y + elementBox.height / 2;
      
      const distance = Math.sqrt(
        Math.pow(elementCenterX - refCenterX, 2) +
        Math.pow(elementCenterY - refCenterY, 2)
      );
      
      if (distance <= maxDistance) {
        filteredElements.push(element);
      }
    }
    
    if (filteredElements.length > 0) {
      const firstElement = filteredElements[0];
      if (firstElement) {
        return firstElement;
      }
    }
    
    return page.locator('xpath=//no-such-element');
  }

  async resolveFilterSelector(
    page: Page,
    options: FilterOptions
  ): Promise<Locator> {
    let locator = page.locator('*');
    
    if (options.hasText) {
      locator = locator.filter({ hasText: options.hasText });
    }
    
    if (options.hasNotText) {
      locator = locator.filter({ hasNotText: options.hasNotText });
    }
    
    if (options.has) {
      const hasLocator = this.createLocator(page, options.has);
      locator = locator.filter({ has: hasLocator });
    }
    
    if (options.hasNot) {
      const hasNotLocator = this.createLocator(page, options.hasNot);
      locator = locator.filter({ hasNot: hasNotLocator });
    }
    
    return locator;
  }

  async resolveComponentSelector(
    page: Page,
    options: ComponentOptions
  ): Promise<Locator> {
    switch (options.framework) {
      case 'react':
        return this.resolveReactComponent(page, options);
      case 'vue':
        return this.resolveVueComponent(page, options);
      case 'angular':
        return this.resolveAngularComponent(page, options);
      default:
        throw new Error(`Unsupported framework: ${options.framework}`);
    }
  }

  private async resolveReactComponent(
    page: Page,
    options: ComponentOptions
  ): Promise<Locator> {
    const selector = `_react=${options.componentName}`;
    
    if (options.props) {
      const propsString = Object.entries(options.props)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(',');
      return page.locator(`${selector}[${propsString}]`);
    }
    
    return page.locator(selector);
  }

  private async resolveVueComponent(
    page: Page,
    options: ComponentOptions
  ): Promise<Locator> {
    const selector = `_vue=${options.componentName}`;
    
    if (options.props) {
      const propsString = Object.entries(options.props)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(',');
      return page.locator(`${selector}[${propsString}]`);
    }
    
    return page.locator(selector);
  }

  private async resolveAngularComponent(
    page: Page,
    options: ComponentOptions
  ): Promise<Locator> {
    const selector = options.componentName.toLowerCase().replace(/([A-Z])/g, '-$1');
    return page.locator(selector);
  }

  async resolveShadowSelector(
    page: Page,
    selector: string
  ): Promise<Locator> {
    const parts = selector.split('>>>').map(s => s.trim());
    
    if (parts.length === 1) {
      return page.locator(selector);
    }
    
    let current = page.locator(parts[0] || '');
    
    for (let i = 1; i < parts.length; i++) {
      current = current.locator(parts[i] || '');
    }
    
    return current;
  }

  async resolveChainedSelector(
    page: Page,
    chain: ChainedSelector[]
  ): Promise<Locator> {
    let current = page.locator('body');
    
    for (const link of chain) {
      switch (link.type) {
        case 'parent':
          current = current.locator('..');
          break;
        case 'child':
          current = current.locator(link.selector);
          break;
        case 'sibling':
          current = current.locator(`../${link.selector}`);
          break;
      }
    }
    
    return current;
  }

  async resolveNthSelector(
    base: Locator,
    nth: number | 'first' | 'last'
  ): Promise<Locator> {
    if (nth === 'first') {
      return base.first();
    } else if (nth === 'last') {
      return base.last();
    } else {
      return base.nth(nth);
    }
  }

  async combineSelectors(
    page: Page,
    selectors: CSGetElementOptions[]
  ): Promise<Locator> {
    const combinedSelector = selectors
      .map(sel => this.optionsToSelector(sel))
      .join(', ');
    
    return page.locator(combinedSelector);
  }

  private createLocator(page: Page, options: CSGetElementOptions): Locator {
    switch (options.locatorType) {
      case 'css':
        return page.locator(options.locatorValue);
      case 'xpath':
        return page.locator(`xpath=${options.locatorValue}`);
      case 'text':
        if (options.exact !== undefined) {
          return page.getByText(options.locatorValue, { exact: options.exact });
        }
        return page.getByText(options.locatorValue);
      case 'role':
        const [role, ...nameparts] = options.locatorValue.split(':');
        const name = nameparts.join(':').trim();
        return page.getByRole(role as any, name ? { name } : undefined);
      case 'testid':
        return page.getByTestId(options.locatorValue);
      case 'label':
        if (options.exact !== undefined) {
          return page.getByLabel(options.locatorValue, { exact: options.exact });
        }
        return page.getByLabel(options.locatorValue);
      case 'placeholder':
        if (options.exact !== undefined) {
          return page.getByPlaceholder(options.locatorValue, { exact: options.exact });
        }
        return page.getByPlaceholder(options.locatorValue);
      case 'title':
        if (options.exact !== undefined) {
          return page.getByTitle(options.locatorValue, { exact: options.exact });
        }
        return page.getByTitle(options.locatorValue);
      case 'alt':
        if (options.exact !== undefined) {
          return page.getByAltText(options.locatorValue, { exact: options.exact });
        }
        return page.getByAltText(options.locatorValue);
      default:
        throw new Error(`Unsupported locator type: ${options.locatorType}`);
    }
  }

  private optionsToSelector(options: CSGetElementOptions): string {
    switch (options.locatorType) {
      case 'css':
        return options.locatorValue;
      case 'xpath':
        throw new Error('Cannot combine XPath selectors');
      case 'text':
        return `text="${options.locatorValue}"`;
      case 'testid':
        return `[data-testid="${options.locatorValue}"]`;
      default:
        return options.locatorValue;
    }
  }

  async findElementsByTextPattern(
    page: Page,
    pattern: RegExp
  ): Promise<Locator[]> {
    const elements = await page.locator('*').all();
    const matches: Locator[] = [];
    
    for (const element of elements) {
      try {
        const text = await element.textContent();
        if (text && pattern.test(text)) {
          matches.push(element);
        }
      } catch {
      }
    }
    
    return matches;
  }

  async findElementsByAttribute(
    page: Page,
    attributeName: string,
    attributeValue?: string | RegExp
  ): Promise<Locator> {
    if (attributeValue === undefined) {
      return page.locator(`[${attributeName}]`);
    } else if (typeof attributeValue === 'string') {
      return page.locator(`[${attributeName}="${attributeValue}"]`);
    } else {
      const allElements = await page.locator(`[${attributeName}]`).all();
      const matchingElements: Locator[] = [];
      
      for (const element of allElements) {
        const value = await element.getAttribute(attributeName);
        if (value && attributeValue.test(value)) {
          matchingElements.push(element);
        }
      }
      
      if (matchingElements.length > 0) {
        const firstElement = matchingElements[0];
        if (firstElement) {
          return firstElement;
        }
      }
      return page.locator('xpath=//no-such-element');
    }
  }

  async findElementsByCustomDataAttribute(
    page: Page,
    dataAttribute: string,
    value?: string
  ): Promise<Locator> {
    const attribute = `data-${dataAttribute}`;
    return this.findElementsByAttribute(page, attribute, value);
  }

  async findInteractableElements(page: Page): Promise<Locator> {
    const selector = [
      'a',
      'button',
      'input',
      'select',
      'textarea',
      '[onclick]',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="combobox"]',
      '[role="textbox"]',
      '[role="searchbox"]',
      '[role="slider"]',
      '[role="switch"]',
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');
    
    return page.locator(selector);
  }

  async findFormElements(page: Page, formSelector?: string): Promise<Locator> {
    const form = formSelector ? page.locator(formSelector) : page.locator('form');
    return form.locator('input, select, textarea, button[type="submit"]');
  }

  async findElementsByAccessibilityRole(
    page: Page,
    role: string,
    name?: string
  ): Promise<Locator> {
    return page.getByRole(role as any, name ? { name } : undefined);
  }

  async findElementsByAriaLabel(
    page: Page,
    label: string,
    exact: boolean = true
  ): Promise<Locator> {
    if (exact) {
      return page.locator(`[aria-label="${label}"]`);
    } else {
      return page.locator(`[aria-label*="${label}"]`);
    }
  }
}
