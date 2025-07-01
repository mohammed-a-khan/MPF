// src/bdd/context/ScenarioContext.ts

import { Scenario } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

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

  public getScenario(): Scenario {
    return this.scenario;
  }

  public getScenarioId(): string {
    return this.scenarioId;
  }

  public getScenarioName(): string {
    return this.scenario.name;
  }

  public getFeatureName(): string {
    return this.featureName;
  }

  public getTags(): string[] {
    return this.scenario.tags || [];
  }

  public hasTag(tag: string): boolean {
    return this.getTags().includes(tag);
  }

  public set(key: string, value: any): void {
    this.data.set(key, value);
    ActionLogger.logContextStorage(`scenario.${key}`, typeof value);
    this.logger.debug(`Set scenario data: ${key} = ${JSON.stringify(value)}`);
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
      this.logger.debug(`Deleted scenario data: ${key}`);
    }
    return result;
  }

  public clear(): void {
    const size = this.data.size;
    this.data.clear();
    this.logger.debug(`Cleared scenario context (${size} items)`);
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

  public merge(data: Record<string, any>): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
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

  public toObject(): Record<string, any> {
    return Object.fromEntries(this.data);
  }

  public fromObject(obj: Record<string, any>): void {
    this.clear();
    this.merge(obj);
  }

  public clone(): ScenarioContext {
    const cloned = new ScenarioContext(this.scenario, this.featureName);
    cloned.fromObject(this.toObject());
    return cloned;
  }

  private generateScenarioId(scenario: Scenario, featureName: string): string {
    const timestamp = Date.now();
    const cleanName = scenario.name.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanFeature = featureName.replace(/[^a-zA-Z0-9]/g, '_');
    return `${cleanFeature}_${cleanName}_${timestamp}`;
  }

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
