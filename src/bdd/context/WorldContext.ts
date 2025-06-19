// src/bdd/context/WorldContext.ts

import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';
import { StringUtils } from '../../core/utils/StringUtils';
import { DateUtils } from '../../core/utils/DateUtils';
import { CryptoUtils } from '../../core/utils/CryptoUtils';
import { ValidationUtils } from '../../core/utils/ValidationUtils';

/**
 * Global test world providing shared utilities and helpers
 * Available across all features and scenarios
 */
export class WorldContext {
  private static instance: WorldContext;
  private readonly data: Map<string, any>;
  private readonly logger: Logger;
  private readonly utilities: Map<string, any>;
  private readonly testRunId: string;
  private readonly startTime: Date;

  private constructor() {
    this.data = new Map();
    this.logger = Logger.getInstance('WorldContext');
    this.utilities = new Map();
    this.testRunId = this.generateTestRunId();
    this.startTime = new Date();
    this.initializeUtilities();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WorldContext {
    if (!WorldContext.instance) {
      WorldContext.instance = new WorldContext();
    }
    return WorldContext.instance;
  }

  /**
   * Initialize utilities
   */
  private initializeUtilities(): void {
    // Register utility instances
    this.utilities.set('file', FileUtils);
    this.utilities.set('string', StringUtils);
    this.utilities.set('date', DateUtils);
    this.utilities.set('crypto', CryptoUtils);
    this.utilities.set('validation', ValidationUtils);

    // Register helper functions
    this.utilities.set('random', {
      string: (length: number = 10) => this.generateRandomString(length),
      number: (min: number, max: number) => this.generateRandomNumber(min, max),
      email: (domain?: string) => this.generateRandomEmail(domain),
      phone: (format?: string) => this.generateRandomPhone(format),
      uuid: () => this.generateUUID(),
      boolean: () => Math.random() < 0.5,
      element: <T>(array: T[]) => array[Math.floor(Math.random() * array.length)]
    });

    // Register formatters
    this.utilities.set('format', {
      currency: (amount: number, currency: string = 'USD') => this.formatCurrency(amount, currency),
      date: (date: Date, format: string) => DateUtils.format(date, format),
      number: (num: number, decimals: number = 2) => num.toFixed(decimals),
      percentage: (value: number, decimals: number = 2) => `${(value * 100).toFixed(decimals)}%`,
      bytes: (bytes: number) => this.formatBytes(bytes)
    });

    // Register validators
    this.utilities.set('validate', {
      email: (email: string) => ValidationUtils.isValidEmail(email),
      url: (url: string) => ValidationUtils.isValidUrl(url),
      phone: (phone: string) => ValidationUtils.isValidPhone(phone),
      creditCard: (card: string) => this.validateCreditCard(card),
      json: (json: string) => this.isValidJSON(json)
    });
  }

  /**
   * Get test run ID
   */
  public getTestRunId(): string {
    return this.testRunId;
  }

  /**
   * Get start time
   */
  public getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Get elapsed time
   */
  public getElapsedTime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Set value
   */
  public set(key: string, value: any): void {
    this.data.set(key, value);
    ActionLogger.logContextStorage(`world.${key}`, typeof value);
    this.logger.debug(`Set world data: ${key} = ${JSON.stringify(value)}`);
  }

  /**
   * Get value
   */
  public get<T = any>(key: string, defaultValue?: T): T {
    if (this.data.has(key)) {
      return this.data.get(key);
    }
    return defaultValue as T;
  }

  /**
   * Check if key exists
   */
  public has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Delete value
   */
  public delete(key: string): boolean {
    const result = this.data.delete(key);
    if (result) {
      this.logger.debug(`Deleted world data: ${key}`);
    }
    return result;
  }

  /**
   * Clear all data
   */
  public clear(): void {
    const size = this.data.size;
    this.data.clear();
    this.logger.debug(`Cleared world context (${size} items)`);
  }

  /**
   * Get utility
   */
  public getUtility(name: string): any {
    return this.utilities.get(name);
  }

  /**
   * Generate test run ID
   */
  private generateTestRunId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `run_${timestamp}_${random}`;
  }

  /**
   * Generate random string
   */
  public generateRandomString(length: number = 10): string {
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
  public generateRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random email
   */
  public generateRandomEmail(domain: string = 'test.com'): string {
    const username = this.generateRandomString(8).toLowerCase();
    const timestamp = Date.now();
    return `${username}_${timestamp}@${domain}`;
  }

  /**
   * Generate random phone
   */
  public generateRandomPhone(format: string = '(XXX) XXX-XXXX'): string {
    return format.replace(/X/g, () => Math.floor(Math.random() * 10).toString());
  }

  /**
   * Generate UUID
   */
  public generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Format currency
   */
  public formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Format bytes
   */
  public formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Validate credit card (Luhn algorithm)
   */
  public validateCreditCard(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    
    if (digits.length < 13 || digits.length > 19) {
      return false;
    }

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Check if valid JSON
   */
  public isValidJSON(json: string): boolean {
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create test data builder
   */
  public createTestDataBuilder(): TestDataBuilder {
    return new TestDataBuilder(this);
  }

  /**
   * Export context for debugging
   */
  public export(): any {
    return {
      testRunId: this.testRunId,
      startTime: this.startTime.toISOString(),
      elapsedTime: this.getElapsedTime(),
      dataSize: this.data.size,
      data: Object.fromEntries(this.data),
      utilities: Array.from(this.utilities.keys())
    };
  }
}

/**
 * Test data builder helper
 */
class TestDataBuilder {
  private data: any = {};
  private world: WorldContext;

  constructor(world: WorldContext) {
    this.world = world;
  }

  with(key: string, value: any): TestDataBuilder {
    this.data[key] = value;
    return this;
  }

  withRandom(key: string, type: 'string' | 'number' | 'email' | 'phone' | 'uuid', ...args: any[]): TestDataBuilder {
    const random = this.world.getUtility('random');
    this.data[key] = random[type](...args);
    return this;
  }

  withDate(key: string, daysOffset: number = 0): TestDataBuilder {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    this.data[key] = date;
    return this;
  }

  withTimestamp(key: string): TestDataBuilder {
    this.data[key] = Date.now();
    return this;
  }

  build(): any {
    return { ...this.data };
  }
}

// Export singleton instance
export const worldContext = WorldContext.getInstance();