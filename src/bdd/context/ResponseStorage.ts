// src/bdd/context/ResponseStorage.ts

import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { JSONPathValidator } from '../../api/validators/JSONPathValidator';

export class ResponseStorage {
  private static instance: ResponseStorage;
  private readonly storage: Map<string, Map<string, any>>;
  private readonly logger: Logger;
  private readonly jsonPathValidator: JSONPathValidator;
  private readonly maxStorageSize: number = 1000;

  private constructor() {
    this.storage = new Map();
    this.logger = Logger.getInstance('ResponseStorage');
    this.jsonPathValidator = JSONPathValidator.getInstance();
  }

  public static getInstance(): ResponseStorage {
    if (!ResponseStorage.instance) {
      ResponseStorage.instance = new ResponseStorage();
    }
    return ResponseStorage.instance;
  }

  public store(alias: string, response: any, scenarioId: string = 'global'): void {
    if (!this.storage.has(scenarioId)) {
      this.storage.set(scenarioId, new Map());
    }

    const scenarioStorage = this.storage.get(scenarioId)!;

    scenarioStorage.set(alias, {
      response: this.cloneResponse(response),
      timestamp: new Date(),
      size: this.calculateSize(response)
    });

    if (scenarioStorage.size > this.maxStorageSize) {
      this.evictOldest(scenarioStorage);
    }

    ActionLogger.logResponseStorage(alias, scenarioId);
    this.logger.debug(`Stored response "${alias}" for scenario "${scenarioId}"`);
  }

  public retrieve<T = any>(alias: string, scenarioId: string = 'global'): T {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (!scenarioStorage || !scenarioStorage.has(alias)) {
      if (scenarioId !== 'global') {
        return this.retrieve<T>(alias, 'global');
      }
      
      throw new Error(`Response with alias "${alias}" not found in storage`);
    }

    const stored = scenarioStorage.get(alias);
    ActionLogger.logResponseRetrieval(alias, true, { scenarioId });
    
    return stored.response as T;
  }

  public extractValue(
    alias: string,
    jsonPath: string,
    scenarioId: string = 'global'
  ): any {
    const response = this.retrieve(alias, scenarioId);
    
    try {
      const value = this.jsonPathValidator.extractValue(response, jsonPath);
      
      this.logger.debug(
        `Extracted value from "${alias}" using path "${jsonPath}": ${JSON.stringify(value)}`
      );
      
      return value;
    } catch (error) {
      throw new Error(
        `Failed to extract value from response "${alias}" using JSONPath "${jsonPath}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public has(alias: string, scenarioId: string = 'global'): boolean {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (scenarioStorage && scenarioStorage.has(alias)) {
      return true;
    }
    
    if (scenarioId !== 'global') {
      const globalStorage = this.storage.get('global');
      return globalStorage ? globalStorage.has(alias) : false;
    }
    
    return false;
  }

  public delete(alias: string, scenarioId: string = 'global'): boolean {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (!scenarioStorage) {
      return false;
    }

    const result = scenarioStorage.delete(alias);
    
    if (result) {
      this.logger.debug(`Deleted response "${alias}" from scenario "${scenarioId}"`);
    }
    
    return result;
  }

  public clearScenario(scenarioId: string): void {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (scenarioStorage) {
      const count = scenarioStorage.size;
      scenarioStorage.clear();
      
      this.logger.debug(`Cleared ${count} responses for scenario "${scenarioId}"`);
    }
  }

  public clear(): void {
    const totalCount = this.getTotalCount();
    this.storage.clear();
    
    this.logger.info(`Cleared all ${totalCount} responses from storage`);
  }

  public getAliases(scenarioId: string = 'global'): string[] {
    const scenarioStorage = this.storage.get(scenarioId);
    return scenarioStorage ? Array.from(scenarioStorage.keys()) : [];
  }

  public getStats(): {
    scenarios: number;
    totalResponses: number;
    totalSize: number;
    responsesByScenario: Record<string, number>;
  } {
    let totalResponses = 0;
    let totalSize = 0;
    const responsesByScenario: Record<string, number> = {};

    for (const [scenarioId, scenarioStorage] of this.storage) {
      responsesByScenario[scenarioId] = scenarioStorage.size;
      totalResponses += scenarioStorage.size;
      
      for (const stored of scenarioStorage.values()) {
        totalSize += stored.size || 0;
      }
    }

    return {
      scenarios: this.storage.size,
      totalResponses,
      totalSize,
      responsesByScenario
    };
  }

  public chainValue(
    fromAlias: string,
    fromPath: string,
    toAlias: string,
    toPath: string,
    scenarioId: string = 'global'
  ): void {
    const value = this.extractValue(fromAlias, fromPath, scenarioId);
    
    const chainKey = `${toAlias}.${toPath}`;
    this.store(chainKey, value, scenarioId);
    
    this.logger.debug(
      `Chained value from "${fromAlias}${fromPath}" to "${chainKey}": ${JSON.stringify(value)}`
    );
  }

  public getChainedValue(alias: string, path: string, scenarioId: string = 'global'): any {
    const chainKey = `${alias}.${path}`;
    
    if (this.has(chainKey, scenarioId)) {
      return this.retrieve(chainKey, scenarioId);
    }
    
    return undefined;
  }

  private cloneResponse(response: any): any {
    if (response === null || response === undefined) {
      return response;
    }

    if (typeof response !== 'object') {
      return response;
    }

    try {
      return JSON.parse(JSON.stringify(response));
    } catch (error) {
      this.logger.warn('Response contains non-JSON serializable data, storing reference');
      return response;
    }
  }

  private calculateSize(response: any): number {
    try {
      return JSON.stringify(response).length;
    } catch {
      return 0;
    }
  }

  private evictOldest(scenarioStorage: Map<string, any>): void {
    const entries = Array.from(scenarioStorage.entries());
    
    entries.sort((a, b) => {
      const timeA = a[1].timestamp?.getTime() || 0;
      const timeB = b[1].timestamp?.getTime() || 0;
      return timeA - timeB;
    });

    const toRemove = Math.ceil(entries.length * 0.1);
    
    for (let i = 0; i < toRemove; i++) {
      const entry = entries[i];
      if (entry) {
        scenarioStorage.delete(entry[0]);
      }
    }

    this.logger.debug(`Evicted ${toRemove} old responses due to storage limit`);
  }

  private getTotalCount(): number {
    let count = 0;
    for (const scenarioStorage of this.storage.values()) {
      count += scenarioStorage.size;
    }
    return count;
  }

  public export(): any {
    const stats = this.getStats();
    const scenarios: Record<string, string[]> = {};

    for (const [scenarioId, scenarioStorage] of this.storage) {
      scenarios[scenarioId] = Array.from(scenarioStorage.keys());
    }

    return {
      ...stats,
      scenarios,
      maxStorageSize: this.maxStorageSize
    };
  }
}

export const responseStorage = ResponseStorage.getInstance();
