// src/core/elements/ElementResolver.ts
import { Locator, Page, Frame } from 'playwright';
import { CSWebElement } from './CSWebElement';
import { AdvancedSelectors } from './AdvancedSelectors';
import { ElementCache } from './ElementCache';
import { AIElementIdentifier } from '../ai/engine/AIElementIdentifier';
import { ActionLogger } from '../logging/ActionLogger';
import { 
  CSGetElementOptions, 
  ElementResolutionResult,
  LocatorStrategy,
  ComponentOptions
} from './types/element.types';

export class ElementResolver {
  private static instance: ElementResolver;
  private cache: ElementCache;
  private advancedSelectors: AdvancedSelectors;

  private constructor() {
    this.cache = ElementCache.getInstance();
    this.advancedSelectors = AdvancedSelectors.getInstance();
  }

  static getInstance(): ElementResolver {
    if (!ElementResolver.instance) {
      ElementResolver.instance = new ElementResolver();
    }
    return ElementResolver.instance;
  }

  async resolve(element: CSWebElement): Promise<Locator> {
    const startTime = Date.now();
    const options = element.options;
    
    ActionLogger.logInfo(`Element resolution started: ${element.description}`, {
      locatorType: options.locatorType,
      locatorValue: options.locatorValue
    });

    // Check cache first
    const cacheKey = this.generateCacheKey(element);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      ActionLogger.logInfo(`Cache hit for element: ${element.description}`);
      return cached;
    }

    let locator: Locator | null = null;
    let strategy: LocatorStrategy = 'direct';
    let attempts = 0;
    let fallbacksUsed = 0;

    try {
      // Try primary locator
      attempts++;
      locator = await this.tryPrimaryLocator(element);
      
      if (!locator) {
        // Try advanced selectors
        attempts++;
        locator = await this.tryAdvancedSelectors(element);
        if (locator) {
          strategy = this.determineAdvancedStrategy(options);
        }
      }

      // Try fallbacks if primary and advanced failed
      if (!locator && options.fallbacks) {
        const fallbackResult = await this.tryFallbacks(element);
        if (fallbackResult) {
          locator = fallbackResult.locator;
          strategy = 'fallback';
          fallbacksUsed = fallbackResult.fallbackIndex + 1;
          attempts += fallbacksUsed;
        }
      }

      // Try AI identification as last resort
      if (!locator && options.aiEnabled && options.aiDescription) {
        attempts++;
        locator = await this.tryAIIdentification(element);
        if (locator) {
          strategy = 'ai';
        }
      }

      if (!locator) {
        throw new Error(`Unable to locate element: ${element.description}`);
      }

      // Ensure element exists
      if (options.strict !== false) {
        const count = await locator.count();
        if (count === 0) {
          throw new Error(`Element not found: ${element.description}`);
        }
        if (count > 1 && options.strict) {
          throw new Error(`Multiple elements found (${count}): ${element.description}`);
        }
      }

      // Apply additional filters
      locator = await this.applyFilters(locator, options);

      // Apply nth selector if specified
      if (options.nth !== undefined) {
        locator = await this.applyNthSelector(locator, options.nth);
      }

      // Cache successful resolution
      this.cache.set(cacheKey, locator);

      const result: ElementResolutionResult = {
        locator,
        strategy,
        confidence: 1.0,
        fallbacksUsed,
        resolutionTime: Date.now() - startTime
      };

      ActionLogger.logInfo(`Element resolved successfully: ${element.description}`, result);
      return locator;

    } catch (error) {
      ActionLogger.logError(`Element resolution failed: ${element.description}`, error as Error);
      throw error;
    }
  }

  private async tryPrimaryLocator(element: CSWebElement): Promise<Locator | null> {
    const options = element.options;
    const page = element.page;

    try {
      let locator = this.buildLocator(page, options);
      
      // Apply iframe context if specified
      if (options.iframe !== undefined) {
        locator = await this.applyIframeContext(element, options.iframe);
      }

      // Apply shadow DOM context if specified
      if (options.shadowRoot) {
        locator = await this.applyShadowDOMContext(locator);
      }

      // Wait for element if configured
      if (options.waitForVisible) {
        const waitOptions: { state: 'visible'; timeout?: number } = { state: 'visible' };
        if (options.waitTimeout !== undefined) {
          waitOptions.timeout = options.waitTimeout;
        }
        await locator.waitFor(waitOptions);
      } else if (options.waitForEnabled) {
        const waitOptions: { state: 'attached'; timeout?: number } = { state: 'attached' };
        if (options.waitTimeout !== undefined) {
          waitOptions.timeout = options.waitTimeout;
        }
        await locator.waitFor(waitOptions);
        
        // Wait for enabled state using custom logic since Playwright doesn't have 'enabled' state
        const waitFunctionOptions: { timeout?: number } = {};
        if (options.waitTimeout !== undefined) {
          waitFunctionOptions.timeout = options.waitTimeout;
        }
        
        await element.page.waitForFunction(
          (selector: string) => {
            const el = document.querySelector(selector);
            return el && !(el as any).disabled;
          },
          this.getSelector(options),
          waitFunctionOptions
        );
      }

      return locator;
    } catch (error) {
      ActionLogger.logDebug('Primary locator failed', {
        element: element.description,
        error: (error as Error).message
      });
      return null;
    }
  }

  private buildLocator(page: Page, options: CSGetElementOptions): Locator {
    switch (options.locatorType) {
      case 'css':
        return page.locator(options.locatorValue);
      
      case 'xpath':
        return page.locator(`xpath=${options.locatorValue}`);
      
      case 'id':
        return page.locator(`#${options.locatorValue}`);
      
      case 'text':
        if (options.exact !== undefined) {
          return page.getByText(options.locatorValue, { exact: options.exact });
        }
        return page.getByText(options.locatorValue);
      
      case 'role':
        // Parse role options from locator value
        const [role, ...roleOptionsStr] = options.locatorValue.split(':');
        const roleOptions = roleOptionsStr.length > 0 
          ? this.parseRoleOptions(roleOptionsStr.join(':'))
          : undefined;
        return page.getByRole(role as any, roleOptions);
      
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
        throw new Error(`Unknown locator type: ${options.locatorType}`);
    }
  }

  private parseRoleOptions(optionsStr: string): any {
    try {
      // Parse options like "name=Submit" or "pressed=true"
      const options: any = {};
      const pairs = optionsStr.split(',');
      
      for (const pair of pairs) {
        const [key, value] = pair.trim().split('=');
        if (key && value) {
          // Convert boolean strings
          if (value === 'true') options[key] = true;
          else if (value === 'false') options[key] = false;
          else options[key] = value;
        }
      }
      
      return options;
    } catch {
      return undefined;
    }
  }

  private async tryAdvancedSelectors(element: CSWebElement): Promise<Locator | null> {
    const options = element.options;
    const page = element.page;
    
    try {
      // Try layout selectors
      if (this.hasLayoutSelectors(options)) {
        const baseLocator = this.createBaseLocator(page, options);
        const layoutOptions = {
          base: baseLocator,
          options: options
        };
        return this.advancedSelectors.resolveLayoutSelector(page, layoutOptions);
      }

      // Try filter selectors
      if (options.hasText || options.hasNotText || options.has || options.hasNot) {
        const filterOptions: any = {};
        if (options.hasText !== undefined) {
          filterOptions.hasText = options.hasText;
        }
        if (options.hasNotText !== undefined) {
          filterOptions.hasNotText = options.hasNotText;
        }
        if (options.has !== undefined) {
          filterOptions.has = options.has;
        }
        if (options.hasNot !== undefined) {
          filterOptions.hasNot = options.hasNot;
        }
        return this.advancedSelectors.resolveFilterSelector(page, filterOptions);
      }

      // Try component selectors
      if (options.react || options.vue) {
        const framework = options.react ? 'react' : 'vue';
        const componentName = (options.react || options.vue) as string;
        const componentOptions: ComponentOptions = {
          framework: framework as 'react' | 'vue' | 'angular',
          componentName,
          props: {}
        };
        return this.advancedSelectors.resolveComponentSelector(page, componentOptions);
      }

      return null;
    } catch (error) {
      ActionLogger.logDebug('Advanced selectors failed', {
        element: element.description,
        error: (error as Error).message
      });
      return null;
    }
  }

  private async tryFallbacks(element: CSWebElement): Promise<{ locator: Locator; fallbackIndex: number } | null> {
    if (!element.options.fallbacks) return null;

    for (let i = 0; i < element.options.fallbacks.length; i++) {
      const fallback = element.options.fallbacks[i];
      if (!fallback) continue;
      
      try {
        const fallbackOptions: CSGetElementOptions = {
          locatorType: fallback.locatorType as any,
          locatorValue: fallback.value,
          description: `${element.description} (fallback ${i + 1})`
        };

        const fallbackElement = new CSWebElement();
        fallbackElement.page = element.page;
        fallbackElement.options = fallbackOptions;
        fallbackElement.description = fallbackOptions.description;

        const locator = await this.tryPrimaryLocator(fallbackElement);
        if (locator) {
          ActionLogger.logInfo(`Fallback successful for element: ${element.description}`, {
            fallbackIndex: i,
            fallbackValue: fallback?.value || 'unknown'
          });
          return { locator, fallbackIndex: i };
        }
      } catch (error) {
        ActionLogger.logDebug(`Fallback attempt failed for element: ${element.description}`, {
          fallbackIndex: i,
          error: (error as Error).message
        });
      }
    }

    return null;
  }

  private async tryAIIdentification(element: CSWebElement): Promise<Locator | null> {
    if (!element.options.aiEnabled || !element.options.aiDescription) {
      return null;
    }

    try {
      const identifier = AIElementIdentifier.getInstance();
      const locator = await identifier.identifyByDescription(
        element.options.aiDescription,
        element.page
      );
      
      ActionLogger.logInfo(`AI identification successful for element: ${element.description}`, {
        description: element.options.aiDescription,
        confidence: element.options.aiConfidenceThreshold || 0.8
      });
      return locator;
    } catch (error) {
      ActionLogger.logError(`AI identification failed for element: ${element.description}`, error as Error);
      return null;
    }
  }

  private async applyFilters(locator: Locator, options: CSGetElementOptions): Promise<Locator> {
    let filtered = locator;

    // Apply text filters
    if (options.hasText !== undefined || options.hasNotText !== undefined) {
      const filterOptions: any = {};
      if (options.hasText !== undefined) {
        filterOptions.hasText = options.hasText;
      }
      if (options.hasNotText !== undefined) {
        filterOptions.hasNotText = options.hasNotText;
      }
      filtered = filtered.filter(filterOptions);
    }

    // Apply locator filters
    if (options.has) {
      const hasLocator = this.buildLocator(locator.page(), options.has);
      filtered = filtered.filter({ has: hasLocator });
    }

    if (options.hasNot) {
      const hasNotLocator = this.buildLocator(locator.page(), options.hasNot);
      filtered = filtered.filter({ hasNot: hasNotLocator });
    }

    return filtered;
  }

  private async applyNthSelector(locator: Locator, nth: number | 'first' | 'last'): Promise<Locator> {
    return this.advancedSelectors.resolveNthSelector(locator, nth);
  }

  private async applyIframeContext(element: CSWebElement, frameSelector: string | number): Promise<Locator> {
    const page = element.page;
    
    if (typeof frameSelector === 'number') {
      // Use frame index
      const frames = page.frames();
      if (frameSelector >= 0 && frameSelector < frames.length) {
        const frame = frames[frameSelector];
        if (frame) {
          return this.buildLocatorInFrame(frame, element.options);
        }
      }
      throw new Error(`Frame index ${frameSelector} out of bounds`);
    } else {
      // Use frame selector
      const frameLocator = page.frameLocator(frameSelector);
      return this.createFrameLocator(frameLocator, element.options);
    }
  }

  private buildLocatorInFrame(frame: Frame, options: CSGetElementOptions): Locator {
    const page = frame.page();
    // Build locator using the page context, but it will be resolved within the frame
    return this.buildLocator(page, options);
  }

  private createFrameLocator(frameLocator: any, options: CSGetElementOptions): Locator {
    // Create locator within frame context
    switch (options.locatorType) {
      case 'css':
        return frameLocator.locator(options.locatorValue);
      case 'xpath':
        return frameLocator.locator(`xpath=${options.locatorValue}`);
      default:
        return frameLocator.locator(options.locatorValue);
    }
  }

  private async applyShadowDOMContext(locator: Locator): Promise<Locator> {
    // Shadow DOM is handled by the locator itself in Playwright
    return locator;
  }

  private generateCacheKey(element: CSWebElement): string {
    const options = element.options;
    const pageUrl = element.page.url();
    return `${pageUrl}::${options.locatorType}::${options.locatorValue}`;
  }

  private getSelector(options: CSGetElementOptions): string {
    switch (options.locatorType) {
      case 'css':
        return options.locatorValue;
      case 'xpath':
        return options.locatorValue;
      case 'id':
        return `#${options.locatorValue}`;
      case 'testid':
        return `[data-testid="${options.locatorValue}"]`;
      default:
        return options.locatorValue;
    }
  }

  private hasLayoutSelectors(options: CSGetElementOptions): boolean {
    return !!(options.leftOf || options.rightOf || options.above || options.below || options.near);
  }

  private createBaseLocator(page: Page, options: CSGetElementOptions): Locator {
    // Create a base locator for layout selectors
    return page.locator(options.locatorValue);
  }

  private determineAdvancedStrategy(options: CSGetElementOptions): LocatorStrategy {
    if (this.hasLayoutSelectors(options)) return 'layout';
    if (options.hasText || options.hasNotText || options.has || options.hasNot) return 'filter';
    if (options.react || options.vue) return 'component';
    if (options.shadowRoot) return 'shadow';
    return 'direct';
  }

  clearCache(): void {
    // Clear all cached entries
    this.cache.invalidateAll();
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}