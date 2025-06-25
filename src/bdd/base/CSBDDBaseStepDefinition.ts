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

/**
 * Base class for all step definition classes
 * Provides common utilities and context access
 */
export abstract class CSBDDBaseStepDefinition {
  protected logger: Logger;
  private pageInstances: Map<string, CSBasePage> = new Map();
  
  constructor() {
    this.logger = Logger.getInstance(this.constructor.name);
  }
  
  /**
   * Initialize all @PageObject decorated properties
   * Called automatically by the framework
   */
  public async initializePageObjects(): Promise<void> {
    const pageProperties = Reflect.getMetadata('page:properties', this) || [];
    
    for (const propertyKey of pageProperties) {
      const PageClass = Reflect.getMetadata('page:class', this, propertyKey);
      if (PageClass) {
        const pageInstance = await this.getPage(PageClass);
        (this as any)[propertyKey] = pageInstance;
        this.logger.debug(`Initialized page object: ${propertyKey} (${PageClass.name})`);
      }
    }
  }

  /**
   * Get current page
   */
  protected get page(): Page {
    return BDDContext.getCurrentPage();
  }

  /**
   * Get BDD context
   */
  protected get context(): BDDContext {
    return BDDContext.getInstance();
  }

  /**
   * Get scenario context
   */
  protected get scenarioContext(): ScenarioContext {
    return this.context.getScenarioContext();
  }

  /**
   * Get step context
   */
  protected get stepContext(): StepContext {
    return this.context.getStepContext();
  }

  /**
   * Get test data
   */
  protected get testData(): any {
    return this.context.getTestData();
  }

  /**
   * Create page object
   */
  protected async createPage<T extends CSBasePage>(
    PageClass: new() => T
  ): Promise<T> {
    return await PageFactory.createPage(PageClass, this.page);
  }


  /**
   * Store value in scenario context
   */
  protected store(key: string, value: any): void {
    this.scenarioContext.set(key, value);
    ActionLogger.logContextStorage(key, typeof value);
  }

  /**
   * Retrieve value from scenario context
   */
  protected retrieve<T = any>(key: string, defaultValue?: T): T {
    return this.scenarioContext.get<T>(key, defaultValue);
  }

  /**
   * Check if key exists in context
   */
  protected has(key: string): boolean {
    return this.scenarioContext.has(key);
  }

  /**
   * Clear scenario context
   */
  protected clearContext(): void {
    this.scenarioContext.clear();
  }

  /**
   * Wait for condition
   */
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

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.page.waitForTimeout(interval);
    }

    throw new Error(`Timeout waiting for condition: ${message}`);
  }

  /**
   * Take screenshot
   */
  protected async takeScreenshot(name: string): Promise<void> {
    const fileName = `${name}_${Date.now()}.png`;
    await this.page.screenshot({ path: `./screenshots/${fileName}` });
    ActionLogger.logScreenshot(fileName);
  }

  /**
   * Log step info
   */
  protected logInfo(message: string): void {
    this.logger.info(message);
    ActionLogger.logInfo(`[STEP] ${message}`);
  }

  /**
   * Log step warning
   */
  protected logWarning(message: string): void {
    this.logger.warn(message);
    ActionLogger.logWarn(`[STEP] ${message}`);
  }

  /**
   * Log step error
   */
  protected logError(message: string, error?: Error): void {
    this.logger.error(message, error);
    ActionLogger.logError(`[STEP] ${message}`, error);
  }

  /**
   * Assert condition
   */
  protected assert(
    condition: boolean,
    message: string
  ): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  /**
   * Soft assert (non-failing)
   */
  protected softAssert(
    condition: boolean,
    message: string
  ): void {
    if (!condition) {
      this.context.addSoftAssertionFailure(message);
      this.logWarning(`Soft assertion failed: ${message}`);
    }
  }

  /**
   * Assert equals
   */
  protected assertEquals<T>(
    actual: T,
    expected: T,
    message?: string
  ): void {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${expected} but got ${actual}`
      );
    }
  }

  /**
   * Assert contains
   */
  protected assertContains(
    text: string,
    substring: string,
    message?: string
  ): void {
    if (!text.includes(substring)) {
      throw new Error(
        message || `Expected "${text}" to contain "${substring}"`
      );
    }
  }

  /**
   * Assert matches pattern
   */
  protected assertMatches(
    text: string,
    pattern: RegExp,
    message?: string
  ): void {
    if (!pattern.test(text)) {
      throw new Error(
        message || `Expected "${text}" to match pattern ${pattern}`
      );
    }
  }

  /**
   * Assert true
   */
  protected assertTrue(
    condition: boolean,
    message?: string
  ): void {
    if (!condition) {
      throw new Error(message || 'Expected condition to be true');
    }
  }

  /**
   * Assert false
   */
  protected assertFalse(
    condition: boolean,
    message?: string
  ): void {
    if (condition) {
      throw new Error(message || 'Expected condition to be false');
    }
  }

  /**
   * Assert not null
   */
  protected assertNotNull<T>(
    value: T | null | undefined,
    message?: string
  ): asserts value is T {
    if (value === null || value === undefined) {
      throw new Error(message || 'Expected value to not be null or undefined');
    }
  }

  /**
   * Assert array contains
   */
  protected assertArrayContains<T>(
    array: T[],
    item: T,
    message?: string
  ): void {
    if (!array.includes(item)) {
      throw new Error(
        message || `Expected array to contain ${item}`
      );
    }
  }

  /**
   * Assert in range
   */
  protected assertInRange(
    value: number,
    min: number,
    max: number,
    message?: string
  ): void {
    if (value < min || value > max) {
      throw new Error(
        message || `Expected ${value} to be between ${min} and ${max}`
      );
    }
  }

  /**
   * Get element by description
   */
  protected async getElement(description: string): Promise<CSWebElement> {
    // This would integrate with AI element identification
    // For now, return a basic implementation
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

  /**
   * Execute JavaScript
   */
  protected async executeScript<T = any>(
    script: string | Function,
    ...args: any[]
  ): Promise<T> {
    return await this.page.evaluate(script as any, ...args);
  }

  /**
   * Get current URL
   */
  protected async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * Get page title
   */
  protected async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Format currency
   */
  protected formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Format date
   */
  protected formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
    // Simple date formatting - can be enhanced
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day);
  }

  /**
   * Generate random string
   */
  protected generateRandomString(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Generate random number
   */
  protected generateRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random email
   */
  protected generateRandomEmail(domain: string = 'test.com'): string {
    const username = this.generateRandomString(8).toLowerCase();
    const timestamp = Date.now();
    return `${username}_${timestamp}@${domain}`;
  }

  /**
   * Parse JSON safely
   */
  protected parseJSON<T = any>(json: string): T | null {
    try {
      return JSON.parse(json);
    } catch (error) {
      this.logWarning(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Retry operation
   */
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

  /**
   * Measure execution time
   */
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
  
  /**
   * Get or create a page object with automatic initialization
   */
  protected async getPage<T extends CSBasePage>(PageClass: new () => T): Promise<T> {
    const className = PageClass.name;
    
    // Check if already initialized
    if (this.pageInstances.has(className)) {
      return this.pageInstances.get(className) as T;
    }
    
    // Create and initialize new instance
    const pageInstance = new PageClass();
    await pageInstance.initialize(this.page);
    
    // Cache for future use
    this.pageInstances.set(className, pageInstance);
    
    this.logger.debug(`Page object initialized: ${className}`);
    return pageInstance;
  }
  
  /**
   * Clear all cached page instances
   * Called automatically when scenario ends
   */
  protected clearPageInstances(): void {
    this.pageInstances.clear();
  }
}