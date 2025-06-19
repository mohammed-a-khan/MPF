// src/database/client/QueryExecutor.ts

import { DatabaseConnection, QueryOptions, PreparedStatement, QueryResult } from '../types/database.types';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { Logger } from '../../core/utils/Logger';
// import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Executes database queries with retry and timeout handling
 */
export class QueryExecutor {
  private adapter: DatabaseAdapter;
  private defaultTimeout: number = 30000;
  private defaultRetryCount: number = 0;
  private defaultRetryDelay: number = 1000;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /**
   * Execute query with parameters
   */
  async execute(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    const queryOptions = this.mergeOptions(options);
    const startTime = Date.now();
    
    try {
      // Execute with retry logic
      return await this.executeWithRetry(
        () => this.executeQuery(connection, sql, params, queryOptions),
        queryOptions
      );
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        const logger = Logger.getInstance();
        logger.warn(`Slow query detected (${duration}ms): ${sql.substring(0, 100)}...`);
      }
    }
  }

  /**
   * Execute stored procedure
   */
  async executeStoredProcedure(
    connection: DatabaseConnection,
    procedureName: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    const queryOptions = this.mergeOptions(options);
    
    return this.executeWithRetry(
      () => this.adapter.executeStoredProcedure(connection, procedureName, params, queryOptions),
      queryOptions
    );
  }

  /**
   * Execute function
   */
  async executeFunction(
    connection: DatabaseConnection,
    functionName: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<any> {
    const queryOptions = this.mergeOptions(options);
    
    return this.executeWithRetry(
      () => this.adapter.executeFunction(connection, functionName, params, queryOptions),
      queryOptions
    );
  }

  /**
   * Execute prepared statement
   */
  async executePrepared(
    statement: PreparedStatement,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    const queryOptions = this.mergeOptions(options);
    
    return this.executeWithRetry(
      () => this.adapter.executePrepared(statement, params),
      queryOptions
    );
  }

  /**
   * Execute batch of queries
   */
  async executeBatch(
    connection: DatabaseConnection,
    queries: Array<{ sql: string; params?: any[] }>,
    options?: QueryOptions
  ): Promise<QueryResult[]> {
    const queryOptions = this.mergeOptions(options);
    const results: QueryResult[] = [];
    
    for (const query of queries) {
      const result = await this.execute(connection, query.sql, query.params, queryOptions);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Stream query results
   */
  async *stream(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): AsyncGenerator<any, void, unknown> {
    const queryOptions = this.mergeOptions(options);
    
    // Use adapter's streaming if available
    if (this.adapter.stream) {
      yield* this.adapter.stream(connection, sql, params, queryOptions);
    } else {
      // Fallback to regular query
      const result = await this.execute(connection, sql, params, queryOptions);
      for (const row of result.rows) {
        yield row;
      }
    }
  }

  /**
   * Execute query and return scalar value
   */
  async scalar<T = any>(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<T | null> {
    const result = await this.execute(connection, sql, params, options);
    
    if (result.rows.length > 0) {
      const firstRow = result.rows[0];
      const keys = Object.keys(firstRow);
      if (keys.length > 0 && keys[0] !== undefined) {
        return firstRow[keys[0]] as T;
      }
    }
    
    return null;
  }

  /**
   * Execute query and return single row
   */
  async single<T = any>(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<T | null> {
    const result = await this.execute(connection, sql, params, options);
    return result.rows.length > 0 ? result.rows[0] as T : null;
  }

  /**
   * Execute query and return first column of all rows
   */
  async column<T = any>(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    columnIndex: number = 0,
    options?: QueryOptions
  ): Promise<T[]> {
    const result = await this.execute(connection, sql, params, options);
    
    return result.rows.map(row => {
      const keys = Object.keys(row);
      const key = keys[columnIndex];
      return key !== undefined ? row[key] as T : undefined as unknown as T;
    });
  }

  /**
   * Execute query with timeout
   */
  private async executeQuery(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    const timeout = options?.timeout || this.defaultTimeout;
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${timeout}ms`));
      }, timeout);
    });
    
    // Race query against timeout
    try {
      return await Promise.race([
        this.adapter.query(connection, sql, params, options),
        timeoutPromise
      ]);
    } catch (error) {
      if ((error as Error).message.includes('timeout')) {
        // Try to cancel query if possible
        if (this.adapter.cancelQuery) {
          try {
            await this.adapter.cancelQuery(connection);
          } catch (cancelError) {
            const logger = Logger.getInstance();
            logger.warn('Failed to cancel timed out query: ' + (cancelError as Error).message);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: QueryOptions
  ): Promise<T> {
    const maxRetries = options.retry?.count || this.defaultRetryCount;
    const retryDelay = options.retry?.delay || this.defaultRetryDelay;
    const retryableErrors = options.retry?.retryableErrors || [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EPIPE'
    ];
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        const isRetryable = retryableErrors.some((code: string) => 
          lastError.message.includes(code) || 
          (lastError as any).code === code
        );
        
        if (!isRetryable || attempt === maxRetries) {
          throw lastError;
        }
        
        const logger = Logger.getInstance();
        logger.warn(`Query failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
      }
    }
    
    throw lastError!;
  }

  /**
   * Merge query options with defaults
   */
  private mergeOptions(options?: QueryOptions): QueryOptions {
    const mergedOptions: QueryOptions = {
      timeout: options?.timeout || this.defaultTimeout,
      ...options
    };
    
    if (options?.retry) {
      mergedOptions.retry = {
        count: options.retry.count ?? this.defaultRetryCount,
        delay: options.retry.delay ?? this.defaultRetryDelay
      };
      if (options.retry.retryableErrors !== undefined) {
        mergedOptions.retry.retryableErrors = options.retry.retryableErrors;
      }
    } else {
      mergedOptions.retry = {
        count: this.defaultRetryCount,
        delay: this.defaultRetryDelay
      };
    }
    
    return mergedOptions;
  }

  /**
   * Set default timeout
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  /**
   * Set default retry options
   */
  setDefaultRetry(count: number, delay: number): void {
    this.defaultRetryCount = count;
    this.defaultRetryDelay = delay;
  }
}