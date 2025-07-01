// src/core/elements/ElementExtensions.ts
import { Locator } from 'playwright';

/**
 * Extended element functionality that adds missing methods to Playwright's Locator
 * These are production-ready implementations of commonly needed element operations
 */
export class ElementExtensions {
  /**
   * Wait for an element to be enabled (not disabled)
   * This is a common requirement in form interactions
   */
  static async waitForEnabled(
    locator: Locator,
    options?: { timeout?: number }
  ): Promise<void> {
    const timeout = options?.timeout ?? 30000;
    const startTime = Date.now();

    // First ensure element is visible
    await locator.waitFor({ state: 'visible', timeout });

    // Then wait for it to be enabled
    while (Date.now() - startTime < timeout) {
      try {
        const isDisabled = await locator.evaluate((el) => {
          return (el as HTMLInputElement).disabled === true;
        });

        if (!isDisabled) {
          return; // Element is enabled
        }
      } catch (e) {
        // Element might not exist yet, continue waiting
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Element did not become enabled within ${timeout}ms`);
  }

  /**
   * Check if element is in the viewport
   * Useful for scrolling and visibility checks
   */
  static async isInViewport(locator: Locator): Promise<boolean> {
    try {
      const box = await locator.boundingBox();
      if (!box) return false;

      // Evaluate in browser context for accurate viewport check
      return await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const windowWidth = window.innerWidth || document.documentElement.clientWidth;

        // Check if element is at least partially visible
        const verticalVisible = rect.top < windowHeight && rect.bottom > 0;
        const horizontalVisible = rect.left < windowWidth && rect.right > 0;

        return verticalVisible && horizontalVisible;
      });
    } catch {
      return false;
    }
  }

  /**
   * Get all text content including child elements
   * More comprehensive than textContent
   */
  static async getAllText(locator: Locator): Promise<string> {
    return await locator.evaluate((element) => {
      // Recursively get all text nodes
      const getTextNodes = (node: Node): string[] => {
        const texts: string[] = [];
        
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) texts.push(text);
        } else {
          for (const child of Array.from(node.childNodes)) {
            texts.push(...getTextNodes(child));
          }
        }
        
        return texts;
      };

      return getTextNodes(element).join(' ');
    });
  }

  /**
   * Wait for element's text to match expected value
   * Useful for dynamic content
   */
  static async waitForText(
    locator: Locator,
    expectedText: string,
    options?: { timeout?: number; exact?: boolean }
  ): Promise<void> {
    const timeout = options?.timeout ?? 30000;
    const exact = options?.exact ?? true;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const actualText = await locator.textContent();
        if (actualText) {
          const matches = exact
            ? actualText.trim() === expectedText.trim()
            : actualText.includes(expectedText);
          
          if (matches) return;
        }
      } catch {
        // Element might not exist yet
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Text did not match expected value within ${timeout}ms`);
  }

  /**
   * Get element's computed style property
   * More reliable than getting inline styles
   */
  static async getComputedStyle(
    locator: Locator,
    property: string
  ): Promise<string> {
    return await locator.evaluate((element, prop) => {
      return window.getComputedStyle(element).getPropertyValue(prop);
    }, property);
  }

  /**
   * Scroll element to center of viewport
   * Better than scrollIntoView for user experience
   */
  static async scrollToCenter(locator: Locator): Promise<void> {
    await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const absoluteTop = rect.top + window.pageYOffset;
      const absoluteLeft = rect.left + window.pageXOffset;
      
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      window.scrollTo({
        top: absoluteTop - (viewportHeight / 2) + (rect.height / 2),
        left: absoluteLeft - (viewportWidth / 2) + (rect.width / 2),
        behavior: 'smooth'
      });
    });
  }

  /**
   * Check if element has a specific CSS class
   * Useful for state validation
   */
  static async hasClass(locator: Locator, className: string): Promise<boolean> {
    try {
      const classes = await locator.getAttribute('class');
      if (!classes) return false;
      
      return classes.split(/\s+/).includes(className);
    } catch {
      return false;
    }
  }

  /**
   * Wait for element to have specific attribute value
   */
  static async waitForAttribute(
    locator: Locator,
    attributeName: string,
    expectedValue: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const timeout = options?.timeout ?? 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const actualValue = await locator.getAttribute(attributeName);
        if (actualValue === expectedValue) return;
      } catch {
        // Element might not exist yet
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Attribute ${attributeName} did not match expected value within ${timeout}ms`);
  }

  /**
   * Get element's dimensions including border, padding, and margin
   */
  static async getDimensions(locator: Locator): Promise<{
    width: number;
    height: number;
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
  }> {
    return await locator.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      // Parse margin values
      const marginTop = parseFloat(computed.marginTop) || 0;
      const marginBottom = parseFloat(computed.marginBottom) || 0;
      const marginLeft = parseFloat(computed.marginLeft) || 0;
      const marginRight = parseFloat(computed.marginRight) || 0;
      
      // Parse padding values
      const paddingTop = parseFloat(computed.paddingTop) || 0;
      const paddingBottom = parseFloat(computed.paddingBottom) || 0;
      const paddingLeft = parseFloat(computed.paddingLeft) || 0;
      const paddingRight = parseFloat(computed.paddingRight) || 0;
      
      return {
        width: rect.width,
        height: rect.height,
        innerWidth: rect.width - paddingLeft - paddingRight,
        innerHeight: rect.height - paddingTop - paddingBottom,
        outerWidth: rect.width + marginLeft + marginRight,
        outerHeight: rect.height + marginTop + marginBottom
      };
    });
  }

  /**
   * Highlight element for debugging purposes
   * Adds a temporary border to make element visible
   */
  static async highlight(
    locator: Locator,
    options?: { color?: string; duration?: number }
  ): Promise<void> {
    const color = options?.color ?? 'red';
    const duration = options?.duration ?? 2000;

    await locator.evaluate((element, opts) => {
      const originalStyle = element.getAttribute('style') || '';
      element.style.border = `3px solid ${opts.color}`;
      element.style.boxShadow = `0 0 10px ${opts.color}`;
      
      setTimeout(() => {
        element.setAttribute('style', originalStyle);
      }, opts.duration);
    }, { color, duration });
  }
}