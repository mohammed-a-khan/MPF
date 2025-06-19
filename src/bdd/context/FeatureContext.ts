// src/bdd/context/FeatureContext.ts

import { Feature } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Feature-specific context
 * Stores data that should be shared across all scenarios in a feature
 */
export class FeatureContext {
  private readonly feature: Feature;
  private readonly data: Map<string, any>;
  private readonly startTime: Date;
  private endTime?: Date;
  private scenarioCount: number = 0;
  private passedScenarios: number = 0;
  private failedScenarios: number = 0;
  private skippedScenarios: number = 0;
  private readonly logger: Logger;

  constructor(feature: Feature) {
    this.feature = feature;
    this.data = new Map();
    this.startTime = new Date();
    this.logger = Logger.getInstance('FeatureContext');
  }

  /**
   * Get feature
   */
  public getFeature(): Feature {
    return this.feature;
  }

  /**
   * Get feature name
   */
  public getFeatureName(): string {
    return this.feature.name;
  }

  /**
   * Get feature description
   */
  public getDescription(): string | undefined {
    return this.feature.description;
  }

  /**
   * Get feature tags
   */
  public getTags(): string[] {
    return this.feature.tags || [];
  }

  /**
   * Check if feature has tag
   */
  public hasTag(tag: string): boolean {
    return this.getTags().includes(tag);
  }

  /**
   * Set value
   */
  public set(key: string, value: any): void {
    this.data.set(key, value);
    ActionLogger.logContextStorage(`feature.${key}`, typeof value);
    this.logger.debug(`Set feature data: ${key} = ${JSON.stringify(value)}`);
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
      this.logger.debug(`Deleted feature data: ${key}`);
    }
    return result;
  }

  /**
   * Clear all data
   */
  public clear(): void {
    const size = this.data.size;
    this.data.clear();
    this.logger.debug(`Cleared feature context (${size} items)`);
  }

  /**
   * Increment scenario count
   */
  public incrementScenarioCount(): void {
    this.scenarioCount++;
  }

  /**
   * Record scenario result
   */
  public recordScenarioResult(status: 'passed' | 'failed' | 'skipped'): void {
    switch (status) {
      case 'passed':
        this.passedScenarios++;
        break;
      case 'failed':
        this.failedScenarios++;
        break;
      case 'skipped':
        this.skippedScenarios++;
        break;
    }
  }

  /**
   * Get scenario statistics
   */
  public getScenarioStats(): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  } {
    const total = this.scenarioCount;
    const passRate = total > 0 ? (this.passedScenarios / total) * 100 : 0;

    return {
      total,
      passed: this.passedScenarios,
      failed: this.failedScenarios,
      skipped: this.skippedScenarios,
      passRate: Math.round(passRate * 100) / 100
    };
  }

  /**
   * Get start time
   */
  public getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Get end time
   */
  public getEndTime(): Date | undefined {
    return this.endTime;
  }

  /**
   * Set end time
   */
  public setEndTime(time: Date): void {
    this.endTime = time;
  }

  /**
   * Get duration
   */
  public getDuration(): number {
    const end = this.endTime || new Date();
    return end.getTime() - this.startTime.getTime();
  }

  /**
   * Get background scenario if exists
   */
  public getBackground(): any {
    return this.feature.background;
  }

  /**
   * Get feature file path
   */
  public getFilePath(): string {
    return this.feature.uri || '';
  }

  /**
   * Get all keys
   */
  public keys(): string[] {
    return Array.from(this.data.keys());
  }

  /**
   * Get all values
   */
  public values(): any[] {
    return Array.from(this.data.values());
  }

  /**
   * Get all entries
   */
  public entries(): Array<[string, any]> {
    return Array.from(this.data.entries());
  }

  /**
   * Get data size
   */
  public size(): number {
    return this.data.size;
  }

  /**
   * Export as plain object
   */
  public toObject(): Record<string, any> {
    return Object.fromEntries(this.data);
  }

  /**
   * Import from plain object
   */
  public fromObject(obj: Record<string, any>): void {
    this.clear();
    for (const [key, value] of Object.entries(obj)) {
      this.set(key, value);
    }
  }

  /**
   * Export context for debugging
   */
  public export(): any {
    return {
      featureName: this.feature.name,
      description: this.feature.description,
      tags: this.getTags(),
      filePath: this.getFilePath(),
      dataSize: this.data.size,
      data: this.toObject(),
      stats: this.getScenarioStats(),
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      duration: this.getDuration()
    };
  }

  /**
   * Initialize the feature context
   */
  public async initialize(): Promise<void> {
    const logger = ActionLogger.getInstance();
    logger.info(`Initializing feature context for: ${this.feature.name}`);
    
    // Set up any feature-level resources
    this.data.set('featureStartTime', this.startTime);
    this.data.set('featureName', this.feature.name);
    this.data.set('featureTags', this.feature.tags);
  }

  /**
   * Cleanup the feature context
   */
  public async cleanup(): Promise<void> {
    const logger = ActionLogger.getInstance();
    logger.info(`Cleaning up feature context for: ${this.feature.name}`);
    
    this.endTime = new Date();
    
    // Clear any resources
    this.data.clear();
  }

  /**
   * Copy shared data from another feature context
   */
  public copySharedData(sourceContext: FeatureContext): void {
    const sharedData = sourceContext.toObject();
    
    // Copy only specific shared data, not everything
    const keysToShare = ['browserContext', 'apiTokens', 'testData', 'configuration'];
    
    for (const key of keysToShare) {
      if (sharedData[key] !== undefined) {
        this.data.set(key, sharedData[key]);
      }
    }
  }

  /**
   * Set up an isolated browser for parallel execution
   */
  public async setupIsolatedBrowser(): Promise<void> {
    const { BrowserManager } = await import('../../core/browser/BrowserManager');
    const browserManager = BrowserManager.getInstance();
    
    // Create a new browser context for isolation
    const context = await browserManager.getContext();
    this.data.set('isolatedBrowserContext', context);
    
    const logger = ActionLogger.getInstance();
    logger.info(`Isolated browser context created for feature: ${this.feature.name}`);
  }

  /**
   * Set up feature-level browser
   */
  public async setupFeatureBrowser(): Promise<void> {
    const { BrowserManager } = await import('../../core/browser/BrowserManager');
    const browserManager = BrowserManager.getInstance();
    
    // Get or create a browser context for this feature
    const context = await browserManager.getContext();
    this.data.set('featureBrowserContext', context);
    
    const logger = ActionLogger.getInstance();
    logger.info(`Feature browser context created for: ${this.feature.name}`);
  }
}