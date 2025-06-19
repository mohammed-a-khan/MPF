// src/bdd/context/ScenarioContext.ts

import { Scenario } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Scenario-specific context
 * Stores data that should be isolated to a single scenario
 */
export class ScenarioContext {
  private readonly scenario: Scenario;
  private readonly scenarioId: string;
  private readonly featureName: string;
  private readonly data: Map<string, any>;
  private readonly startTime: Date;
  private endTime?: Date;
  private readonly logger: Logger;

  constructor(scenario: Scenario, featureName: string) {
    this.scenario = scenario;
    this.scenarioId = this.generateScenarioId(scenario, featureName);
    this.featureName = featureName;
    this.data = new Map();
    this.startTime = new Date();
    this.logger = Logger.getInstance('ScenarioContext');
  }

  /**
   * Get scenario
   */
  public getScenario(): Scenario {
    return this.scenario;
  }

  /**
   * Get scenario ID
   */
  public getScenarioId(): string {
    return this.scenarioId;
  }

  /**
   * Get scenario name
   */
  public getScenarioName(): string {
    return this.scenario.name;
  }

  /**
   * Get feature name
   */
  public getFeatureName(): string {
    return this.featureName;
  }

  /**
   * Get scenario tags
   */
  public getTags(): string[] {
    return this.scenario.tags || [];
  }

  /**
   * Check if scenario has tag
   */
  public hasTag(tag: string): boolean {
    return this.getTags().includes(tag);
  }

  /**
   * Set value
   */
  public set(key: string, value: any): void {
    this.data.set(key, value);
    ActionLogger.logContextStorage(`scenario.${key}`, typeof value);
    this.logger.debug(`Set scenario data: ${key} = ${JSON.stringify(value)}`);
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
      this.logger.debug(`Deleted scenario data: ${key}`);
    }
    return result;
  }

  /**
   * Clear all data
   */
  public clear(): void {
    const size = this.data.size;
    this.data.clear();
    this.logger.debug(`Cleared scenario context (${size} items)`);
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
   * Merge data
   */
  public merge(data: Record<string, any>): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
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
    this.merge(obj);
  }

  /**
   * Clone context
   */
  public clone(): ScenarioContext {
    const cloned = new ScenarioContext(this.scenario, this.featureName);
    cloned.fromObject(this.toObject());
    return cloned;
  }

  /**
   * Generate unique scenario ID
   */
  private generateScenarioId(scenario: Scenario, featureName: string): string {
    const timestamp = Date.now();
    const cleanName = scenario.name.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanFeature = featureName.replace(/[^a-zA-Z0-9]/g, '_');
    return `${cleanFeature}_${cleanName}_${timestamp}`;
  }

  /**
   * Export context for debugging
   */
  public export(): any {
    return {
      scenarioId: this.scenarioId,
      scenarioName: this.scenario.name,
      featureName: this.featureName,
      tags: this.getTags(),
      dataSize: this.data.size,
      data: this.toObject(),
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      duration: this.getDuration()
    };
  }
}