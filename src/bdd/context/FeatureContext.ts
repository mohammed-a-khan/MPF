// src/bdd/context/FeatureContext.ts

import { Feature } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

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

  public getFeature(): Feature {
    return this.feature;
  }

  public getFeatureName(): string {
    return this.feature.name;
  }

  public getDescription(): string | undefined {
    return this.feature.description;
  }

  public getTags(): string[] {
    return this.feature.tags || [];
  }

  public hasTag(tag: string): boolean {
    return this.getTags().includes(tag);
  }

  public set(key: string, value: any): void {
    this.data.set(key, value);
    ActionLogger.logContextStorage(`feature.${key}`, typeof value);
    this.logger.debug(`Set feature data: ${key} = ${JSON.stringify(value)}`);
  }

  public get<T = any>(key: string, defaultValue?: T): T {
    if (this.data.has(key)) {
      return this.data.get(key);
    }
    return defaultValue as T;
  }

  public has(key: string): boolean {
    return this.data.has(key);
  }

  public delete(key: string): boolean {
    const result = this.data.delete(key);
    if (result) {
      this.logger.debug(`Deleted feature data: ${key}`);
    }
    return result;
  }

  public clear(): void {
    const size = this.data.size;
    this.data.clear();
    this.logger.debug(`Cleared feature context (${size} items)`);
  }

  public incrementScenarioCount(): void {
    this.scenarioCount++;
  }

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

  public getStartTime(): Date {
    return this.startTime;
  }

  public getEndTime(): Date | undefined {
    return this.endTime;
  }

  public setEndTime(time: Date): void {
    this.endTime = time;
  }

  public getDuration(): number {
    const end = this.endTime || new Date();
    return end.getTime() - this.startTime.getTime();
  }

  public getBackground(): any {
    return this.feature.background;
  }

  public getFilePath(): string {
    return this.feature.uri || '';
  }

  public keys(): string[] {
    return Array.from(this.data.keys());
  }

  public values(): any[] {
    return Array.from(this.data.values());
  }

  public entries(): Array<[string, any]> {
    return Array.from(this.data.entries());
  }

  public size(): number {
    return this.data.size;
  }

  public toObject(): Record<string, any> {
    return Object.fromEntries(this.data);
  }

  public fromObject(obj: Record<string, any>): void {
    this.clear();
    for (const [key, value] of Object.entries(obj)) {
      this.set(key, value);
    }
  }

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

  public async initialize(): Promise<void> {
    const logger = ActionLogger.getInstance();
    logger.info(`Initializing feature context for: ${this.feature.name}`);
    
    this.data.set('featureStartTime', this.startTime);
    this.data.set('featureName', this.feature.name);
    this.data.set('featureTags', this.feature.tags);
  }

  public async cleanup(): Promise<void> {
    const logger = ActionLogger.getInstance();
    logger.info(`Cleaning up feature context for: ${this.feature.name}`);
    
    this.endTime = new Date();
    
    this.data.clear();
  }

  public copySharedData(sourceContext: FeatureContext): void {
    const sharedData = sourceContext.toObject();
    
    const keysToShare = ['browserContext', 'apiTokens', 'testData', 'configuration'];
    
    for (const key of keysToShare) {
      if (sharedData[key] !== undefined) {
        this.data.set(key, sharedData[key]);
      }
    }
  }

  public async setupIsolatedBrowser(): Promise<void> {
    const { BrowserManager } = await import('../../core/browser/BrowserManager');
    const browserManager = BrowserManager.getInstance();
    
    const context = await browserManager.getContext();
    this.data.set('isolatedBrowserContext', context);
    
    const logger = ActionLogger.getInstance();
    logger.info(`Isolated browser context created for feature: ${this.feature.name}`);
  }

  public async setupFeatureBrowser(): Promise<void> {
    const { BrowserManager } = await import('../../core/browser/BrowserManager');
    const browserManager = BrowserManager.getInstance();
    
    const context = await browserManager.getContext();
    this.data.set('featureBrowserContext', context);
    
    const logger = ActionLogger.getInstance();
    logger.info(`Feature browser context created for: ${this.feature.name}`);
  }
}
