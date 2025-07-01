// src/bdd/base/CSBDDBaseStepDefinition.ts

import 'reflect-metadata';
import { Page } from 'playwright';
import { BDDContext } from '../context/BDDContext';
import { ScenarioContext } from '../context/ScenarioContext';
import { StepContext } from './StepContext';
import { CSWebElement } from '../../core/elements/CSWebElement';
import { PageFactory } from '../../core/pages/PageFactory';
import { CSBasePage } from '../../core/pages/CSBasePage';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

export abstract class CSBDDBaseStepDefinition {
  protected logger: Logger;
  private pageInstances: Map<string, CSBasePage> = new Map();
  
  constructor() {
    this.logger = Logger.getInstance(this.constructor.name);
  }

  private getBrowserManagementStrategy(): string {
    return ConfigurationManager.get('BROWSER_MANAGEMENT_STRATEGY', 'reuse-browser');
  }
  
  public async initializePageObjects(): Promise<void> {
    let pageProperties = Reflect.getMetadata('page:properties', this) || [];
    if (pageProperties.length === 0) {
      pageProperties = Reflect.getMetadata('page:properties', Object.getPrototypeOf(this)) || [];
    }
    
    const currentPage = BDDContext.getCurrentPage();
    
    if (!currentPage || currentPage.isClosed()) {
      throw new Error(`Cannot initialize page objects - no valid page available in BDDContext`);
    }
    
    const browserStrategy = this.getBrowserManagementStrategy();
    
    this.logger.debug(`initializePageObjects called for ${this.constructor.name} with strategy: ${browserStrategy}`);
    this.logger.debug(`Current page URL: ${currentPage?.url() || 'N/A'}, isClosed: ${currentPage?.isClosed() || false}`);
    this.logger.debug(`Page properties count: ${pageProperties.length}, properties: ${JSON.stringify(pageProperties)}`);
    
    for (const propertyKey of pageProperties) {
      const existingPageObject = (this as any)[propertyKey];
      if (existingPageObject && existingPageObject.currentPage) {
        try {
          if (existingPageObject.currentPage.isClosed() || existingPageObject.currentPage !== currentPage) {
            this.logger.debug(`Page object ${propertyKey} has a closed or different page, will reinitialize`);
            if (typeof existingPageObject.cleanup === 'function') {
              await existingPageObject.cleanup();
            }
            (this as any)[propertyKey] = undefined;
          }
        } catch (error) {
          this.logger.debug(`Error checking page object ${propertyKey}, will reinitialize`);
          (this as any)[propertyKey] = undefined;
        }
      }
    }
    
    if (browserStrategy === 'new-per-scenario') {
      this.logger.debug(`Clearing page instances for new-per-scenario strategy`);
      this.clearPageInstances();
      for (const propertyKey of pageProperties) {
        this.logger.debug(`Clearing property ${propertyKey}`);
        (this as any)[propertyKey] = undefined;
      }
    }
    
    for (const propertyKey of pageProperties) {
      let PageClass = Reflect.getMetadata('page:class', this, propertyKey);
      if (!PageClass) {
        PageClass = Reflect.getMetadata('page:class', Object.getPrototypeOf(this), propertyKey);
      }
      
      if (PageClass) {
        if (browserStrategy === 'new-per-scenario' || !(this as any)[propertyKey]) {
          this.logger.debug(`Creating new instance of ${PageClass.name} for property ${propertyKey}`);
          const pageInstance = new PageClass();
          await pageInstance.initialize(currentPage);
          (this as any)[propertyKey] = pageInstance;
          this.pageInstances.set(PageClass.name, pageInstance);
          this.logger.debug(`Initialized page object: ${propertyKey} (${PageClass.name})`);
        } else {
          const existingInstance = (this as any)[propertyKey];
          if (existingInstance && existingInstance.currentPage !== currentPage) {
            this.logger.debug(`Reinitializing ${PageClass.name} for property ${propertyKey} with new page`);
            await existingInstance.initialize(currentPage);
          } else {
            this.logger.debug(`Reusing existing instance of ${PageClass.name} for property ${propertyKey}`);
          }
        }
      } else {
        this.logger.warn(`No PageClass metadata found for property ${propertyKey}`);
      }
    }
  }

  protected get page(): Page {
    const currentPage = BDDContext.getCurrentPage();
    const pageProperties = Reflect.getMetadata('page:properties', this) || 
                           Reflect.getMetadata('page:properties', Object.getPrototypeOf(this)) || [];
    for (const propertyKey of pageProperties) {
      const pageObject = (this as any)[propertyKey];
      if (pageObject && pageObject.currentPage !== currentPage) {
        pageObject.page = currentPage;
      }
    }
    return currentPage;
  }

  protected async waitForURL(urlPattern: string | RegExp, options?: { timeout?: number }): Promise<void> {
    const patternStr = urlPattern instanceof RegExp ? urlPattern.toString() : urlPattern;
    const timeout = options?.timeout || 30000;
    
    ActionLogger.logInfo(`Waiting for URL pattern: ${patternStr} (timeout: ${timeout}ms)`);
    const startTime = Date.now();
    
    try {
      await this.page.waitForURL(urlPattern, options);
      const duration = Date.now() - startTime;
      const currentUrl = this.page.url();
      
      ActionLogger.logInfo(
        `Successfully navigated to URL matching pattern: ${patternStr}`,
        {
          pattern: patternStr,
          currentUrl,
          duration,
          timeout
        }
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      ActionLogger.logError(
        `Failed to navigate to URL matching pattern: ${patternStr} after ${duration}ms`,
        error
      );
      throw error;
    }
  }

  protected async waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle', options?: { timeout?: number }): Promise<void> {
    const loadState = state || 'load';
    const timeout = options?.timeout || 30000;
    
    ActionLogger.logInfo(`Waiting for page load state: ${loadState} (timeout: ${timeout}ms)`);
    const startTime = Date.now();
    
    try {
      await this.page.waitForLoadState(state, options);
      const duration = Date.now() - startTime;
      const currentUrl = this.page.url();
      
      ActionLogger.logInfo(
        `Page reached '${loadState}' state`,
        {
          state: loadState,
          currentUrl,
          duration,
          timeout
        }
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      ActionLogger.logError(
        `Failed to reach load state '${loadState}' after ${duration}ms`,
        error
      );
      throw error;
    }
  }

  protected get context(): BDDContext {
    return BDDContext.getInstance();
  }

  protected get scenarioContext(): ScenarioContext {
    return this.context.getScenarioContext();
  }

  protected get stepContext(): StepContext {
    return this.context.getStepContext();
  }

  protected get testData(): any {
    return this.context.getTestData();
  }

  protected async createPage<T extends CSBasePage>(
    PageClass: new() => T
  ): Promise<T> {
    return await PageFactory.createPage(PageClass, this.page);
  }


  protected store(key: string, value: any): void {
    this.scenarioContext.set(key, value);
    ActionLogger.logContextStorage(key, typeof value);
  }

  protected retrieve<T = any>(key: string, defaultValue?: T): T {
    return this.scenarioContext.get<T>(key, defaultValue);
  }

  protected has(key: string): boolean {
    return this.scenarioContext.has(key);
  }

  protected clearContext(): void {
    this.scenarioContext.clear();
  }

  protected async waitFor(
    condition: () => Promise<boolean>,
    options?: {
      timeout?: number;
      interval?: number;
      message?: string;
    }
  ): Promise<void> {
    const timeout = options?.timeout || 30000;
    const interval = options?.interval || 100;
    const message = options?.message || 'Condition not met';
    const startTime = Date.now();

    ActionLogger.logInfo(`Waiting for condition: ${message} (timeout: ${timeout}ms)`);

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        const duration = Date.now() - startTime;
        ActionLogger.logInfo(
          `Condition met: ${message}`,
          {
            message,
            duration,
            timeout,
            interval
          }
        );
        return;
      }
      await this.page.waitForTimeout(interval);
    }

    const duration = Date.now() - startTime;
    const error = new Error(`Timeout waiting for condition: ${message}`);
    ActionLogger.logError(
      `Timeout waiting for condition after ${duration}ms: ${message}`,
      error
    );
    throw error;
  }

  protected async takeScreenshot(name: string): Promise<void> {
    const fileName = `${name}_${Date.now()}.png`;
    await this.page.screenshot({ path: `./screenshots/${fileName}` });
    ActionLogger.logScreenshot(fileName);
  }

  protected logInfo(message: string): void {
    this.logger.info(message);
    ActionLogger.logInfo(`[STEP] ${message}`);
  }

  protected logWarning(message: string): void {
    this.logger.warn(message);
    ActionLogger.logWarn(`[STEP] ${message}`);
  }

  protected logError(message: string, error?: Error): void {
    this.logger.error(message, error);
    ActionLogger.logError(`[STEP] ${message}`, error);
  }

  protected assert(
    condition: boolean,
    message: string
  ): void {
    ActionLogger.logVerification(
      `Assert: ${message}`,
      'true',
      condition.toString(),
      condition
    );
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  protected softAssert(
    condition: boolean,
    message: string
  ): void {
    ActionLogger.logVerification(
      `Soft Assert: ${message}`,
      'true',
      condition.toString(),
      condition
    );
    if (!condition) {
      this.context.addSoftAssertionFailure(message);
      this.logWarning(`Soft assertion failed: ${message}`);
    }
  }

  protected assertEquals<T>(
    actual: T,
    expected: T,
    message?: string
  ): void {
    const passed = actual === expected;
    ActionLogger.logVerification(
      message || 'Assert Equals',
      expected,
      actual,
      passed
    );
    if (!passed) {
      throw new Error(
        message || `Expected ${expected} but got ${actual}`
      );
    }
  }

  protected assertContains(
    text: string,
    substring: string,
    message?: string
  ): void {
    const passed = text.includes(substring);
    ActionLogger.logVerification(
      message || 'Assert Contains',
      `Text contains "${substring}"`,
      `Text: "${text}"`,
      passed
    );
    if (!passed) {
      throw new Error(
        message || `Expected "${text}" to contain "${substring}"`
      );
    }
  }

  protected assertMatches(
    text: string,
    pattern: RegExp,
    message?: string
  ): void {
    const passed = pattern.test(text);
    ActionLogger.logVerification(
      message || 'Assert Matches Pattern',
      `Text matches ${pattern}`,
      `Text: "${text}"`,
      passed
    );
    if (!passed) {
      throw new Error(
        message || `Expected "${text}" to match pattern ${pattern}`
      );
    }
  }

  protected assertTrue(
    condition: boolean,
    message?: string
  ): void {
    ActionLogger.logVerification(
      message || 'Assert True',
      'true',
      condition.toString(),
      condition
    );
    if (!condition) {
      throw new Error(message || 'Expected condition to be true');
    }
  }

  protected assertFalse(
    condition: boolean,
    message?: string
  ): void {
    const passed = !condition;
    ActionLogger.logVerification(
      message || 'Assert False',
      'false',
      condition.toString(),
      passed
    );
    if (condition) {
      throw new Error(message || 'Expected condition to be false');
    }
  }

  protected assertNotNull<T>(
    value: T | null | undefined,
    message?: string
  ): asserts value is T {
    const passed = value !== null && value !== undefined;
    ActionLogger.logVerification(
      message || 'Assert Not Null',
      'not null or undefined',
      value === null ? 'null' : value === undefined ? 'undefined' : 'defined',
      passed
    );
    if (!passed) {
      throw new Error(message || 'Expected value to not be null or undefined');
    }
  }

  protected assertArrayContains<T>(
    array: T[],
    item: T,
    message?: string
  ): void {
    const passed = array.includes(item);
    ActionLogger.logVerification(
      message || 'Assert Array Contains',
      `Array contains ${JSON.stringify(item)}`,
      `Array: ${JSON.stringify(array)}`,
      passed
    );
    if (!passed) {
      throw new Error(
        message || `Expected array to contain ${item}`
      );
    }
  }

  protected assertInRange(
    value: number,
    min: number,
    max: number,
    message?: string
  ): void {
    const passed = value >= min && value <= max;
    ActionLogger.logVerification(
      message || 'Assert In Range',
      `Value between ${min} and ${max}`,
      value.toString(),
      passed
    );
    if (!passed) {
      throw new Error(
        message || `Expected ${value} to be between ${min} and ${max}`
      );
    }
  }

  protected async getElement(description: string): Promise<CSWebElement> {
    const element = new CSWebElement();
    element.page = this.page;
    element.options = {
      locatorType: 'text',
      locatorValue: description,
      description: description,
      aiEnabled: true
    };
    return element;
  }

  protected async executeScript<T = any>(
    script: string | Function,
    ...args: any[]
  ): Promise<T> {
    return await this.page.evaluate(script as any, ...args);
  }

  protected async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  protected async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  protected formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  protected formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day);
  }

  protected generateRandomString(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  protected generateRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  protected generateRandomEmail(domain: string = 'test.com'): string {
    const username = this.generateRandomString(8).toLowerCase();
    const timestamp = Date.now();
    return `${username}_${timestamp}@${domain}`;
  }

  protected parseJSON<T = any>(json: string): T | null {
    try {
      return JSON.parse(json);
    } catch (error) {
      this.logWarning(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  protected async retry<T>(
    operation: () => Promise<T>,
    options?: {
      retries?: number;
      delay?: number;
      backoff?: boolean;
    }
  ): Promise<T> {
    const retries = options?.retries || 3;
    const delay = options?.delay || 1000;
    const backoff = options?.backoff || false;

    let lastError: Error;

    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (i < retries - 1) {
          const waitTime = backoff ? delay * Math.pow(2, i) : delay;
          await this.page.waitForTimeout(waitTime);
        }
      }
    }

    throw lastError!;
  }

  protected async measureTime<T>(
    operation: () => Promise<T>,
    label: string
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.logInfo(`${label} completed in ${duration}ms`);
      await ActionLogger.logPerformance(label, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logError(`${label} failed after ${duration}ms`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  protected async getPage<T extends CSBasePage>(PageClass: new () => T): Promise<T> {
    const className = PageClass.name;
    const currentPage = BDDContext.getCurrentPage();
    
    const browserStrategy = this.getBrowserManagementStrategy();
    if (browserStrategy === 'reuse-browser' && this.pageInstances.has(className)) {
      return this.pageInstances.get(className) as T;
    }
    
    const pageInstance = new PageClass();
    await pageInstance.initialize(currentPage);
    
    this.pageInstances.set(className, pageInstance);
    
    this.logger.debug(`Page object initialized: ${className}`);
    return pageInstance;
  }
  
  protected clearPageInstances(): void {
    const pageProperties = Reflect.getMetadata('page:properties', this) || [];
    for (const propertyKey of pageProperties) {
      const pageObject = (this as any)[propertyKey];
      if (pageObject && typeof pageObject.cleanup === 'function') {
        try {
          pageObject.cleanup();
        } catch (error) {
          this.logger.warn(`Error cleaning up page object ${propertyKey}: ${(error as Error).message}`);
        }
      }
      (this as any)[propertyKey] = undefined;
    }
    this.pageInstances.clear();
  }
}
