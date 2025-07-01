// src/bdd/context/ResponseStorage.ts

import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { JSONPathValidator } from '../../api/validators/JSONPathValidator';

/**
 * Storage for API responses to enable chaining between requests
 * Supports JSONPath extraction and response reuse
 */
export class ResponseStorage {
  private static instance: ResponseStorage;
  private readonly storage: Map<string, Map<string, any>>;
  private readonly logger: Logger;
  private readonly jsonPathValidator: JSONPathValidator;
  private readonly maxStorageSize: number = 1000; // Maximum responses to store

  private constructor() {
    this.storage = new Map();
    this.logger = Logger.getInstance('ResponseStorage');
    this.jsonPathValidator = JSONPathValidator.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ResponseStorage {
    if (!ResponseStorage.instance) {
      ResponseStorage.instance = new ResponseStorage();
    }
    return ResponseStorage.instance;
  }

  /**
   * Store response with alias
   */
  public store(alias: string, response: any, scenarioId: string = 'global'): void {
    // Get or create scenario storage
    if (!this.storage.has(scenarioId)) {
      this.storage.set(scenarioId, new Map());
    }

    const scenarioStorage = this.storage.get(scenarioId)!;

    // Store response
    scenarioStorage.set(alias, {
      response: this.cloneResponse(response),
      timestamp: new Date(),
      size: this.calculateSize(response)
    });

    // Check storage limit
    if (scenarioStorage.size > this.maxStorageSize) {
      this.evictOldest(scenarioStorage);
    }

    ActionLogger.logResponseStorage(alias, scenarioId);
    this.logger.debug(`Stored response "${alias}" for scenario "${scenarioId}"`);
  }

  /**
   * Retrieve response by alias
   */
  public retrieve<T = any>(alias: string, scenarioId: string = 'global'): T {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (!scenarioStorage || !scenarioStorage.has(alias)) {
      // Try global storage as fallback
      if (scenarioId !== 'global') {
        return this.retrieve<T>(alias, 'global');
      }
      
      throw new Error(`Response with alias "${alias}" not found in storage`);
    }

    const stored = scenarioStorage.get(alias);
    ActionLogger.logResponseRetrieval(alias, true, { scenarioId });
    
    return stored.response as T;
  }

  /**
   * Extract value from stored response using JSONPath
   */
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

  /**
   * Check if alias exists
   */
  public has(alias: string, scenarioId: string = 'global'): boolean {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (scenarioStorage && scenarioStorage.has(alias)) {
      return true;
    }
    
    // Check global storage if not found in scenario
    if (scenarioId !== 'global') {
      const globalStorage = this.storage.get('global');
      return globalStorage ? globalStorage.has(alias) : false;
    }
    
    return false;
  }

  /**
   * Delete response
   */
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

  /**
   * Clear scenario responses
   */
  public clearScenario(scenarioId: string): void {
    const scenarioStorage = this.storage.get(scenarioId);
    
    if (scenarioStorage) {
      const count = scenarioStorage.size;
      scenarioStorage.clear();
      
      this.logger.debug(`Cleared ${count} responses for scenario "${scenarioId}"`);
    }
  }

  /**
   * Clear all responses
   */
  public clear(): void {
    const totalCount = this.getTotalCount();
    this.storage.clear();
    
    this.logger.info(`Cleared all ${totalCount} responses from storage`);
  }

  /**
   * Get all aliases for scenario
   */
  public getAliases(scenarioId: string = 'global'): string[] {
    const scenarioStorage = this.storage.get(scenarioId);
    return scenarioStorage ? Array.from(scenarioStorage.keys()) : [];
  }

  /**
   * Get storage statistics
   */
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

  /**
   * Chain responses - use value from one response in another
   */
  public chainValue(
    fromAlias: string,
    fromPath: string,
    toAlias: string,
    toPath: string,
    scenarioId: string = 'global'
  ): void {
    const value = this.extractValue(fromAlias, fromPath, scenarioId);
    
    // Store for use in next request
    const chainKey = `${toAlias}.${toPath}`;
    this.store(chainKey, value, scenarioId);
    
    this.logger.debug(
      `Chained value from "${fromAlias}${fromPath}" to "${chainKey}": ${JSON.stringify(value)}`
    );
  }

  /**
   * Get chained value
   */
  public getChainedValue(alias: string, path: string, scenarioId: string = 'global'): any {
    const chainKey = `${alias}.${path}`;
    
    if (this.has(chainKey, scenarioId)) {
      return this.retrieve(chainKey, scenarioId);
    }
    
    return undefined;
  }

  /**
   * Clone response to prevent modifications
   */
  private cloneResponse(response: any): any {
    if (response === null || response === undefined) {
      return response;
    }

    if (typeof response !== 'object') {
      return response;
    }

    try {
      // Deep clone using JSON
      return JSON.parse(JSON.stringify(response));
    } catch (error) {
      // Fallback for non-JSON serializable objects
      this.logger.warn('Response contains non-JSON serializable data, storing reference');
      return response;
    }
  }

  /**
   * Calculate response size
   */
  private calculateSize(response: any): number {
    try {
      return JSON.stringify(response).length;
    } catch {
      return 0;
    }
  }

  /**
   * Evict oldest responses when limit reached
   */
  private evictOldest(scenarioStorage: Map<string, any>): void {
    const entries = Array.from(scenarioStorage.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => {
      const timeA = a[1].timestamp?.getTime() || 0;
      const timeB = b[1].timestamp?.getTime() || 0;
      return timeA - timeB;
    });

    // Remove oldest 10%
    const toRemove = Math.ceil(entries.length * 0.1);
    
    for (let i = 0; i < toRemove; i++) {
      const entry = entries[i];
      if (entry) {
        scenarioStorage.delete(entry[0]);
      }
    }

    this.logger.debug(`Evicted ${toRemove} old responses due to storage limit`);
  }

  /**
   * Get total response count
   */
  private getTotalCount(): number {
    let count = 0;
    for (const scenarioStorage of this.storage.values()) {
      count += scenarioStorage.size;
    }
    return count;
  }

  /**
   * Export storage for debugging
   */
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

// Export singleton instance
export const responseStorage = ResponseStorage.getInstance();