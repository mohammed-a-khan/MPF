// src/database/adapters/DatabaseAdapter.ts

import { 
  DatabaseConnection, 
  DatabaseConfig, 
  QueryResult, 
  QueryOptions, 
  PreparedStatement,
  TransactionOptions,
  DatabaseMetadata,
  TableInfo,
  DatabaseError,
  DatabaseErrorCode
} from '../types/database.types';

/**
 * Abstract base class for database adapters
 * Each database type must implement this interface
 */
export abstract class DatabaseAdapter {
  protected config?: DatabaseConfig;
  protected eventHandlers: Map<string, Set<Function>> = new Map();

  /**
   * Connect to database
   */
  abstract connect(config: DatabaseConfig): Promise<DatabaseConnection>;

  /**
   * Disconnect from database
   */
  abstract disconnect(connection: DatabaseConnection): Promise<void>;

  /**
   * Execute query
   */
  abstract query(
    connection: DatabaseConnection, 
    sql: string, 
    params?: any[], 
    options?: QueryOptions
  ): Promise<QueryResult>;

  /**
   * Execute stored procedure
   */
  abstract executeStoredProcedure(
    connection: DatabaseConnection,
    procedureName: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult>;

  /**
   * Execute function
   */
  abstract executeFunction(
    connection: DatabaseConnection,
    functionName: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<any>;

  /**
   * Begin transaction
   */
  abstract beginTransaction(
    connection: DatabaseConnection,
    options?: TransactionOptions
  ): Promise<void>;

  /**
   * Commit transaction
   */
  abstract commitTransaction(connection: DatabaseConnection): Promise<void>;

  /**
   * Rollback transaction
   */
  abstract rollbackTransaction(connection: DatabaseConnection): Promise<void>;

  /**
   * Create savepoint
   */
  abstract createSavepoint(connection: DatabaseConnection, name: string): Promise<void>;

  /**
   * Release savepoint
   */
  abstract releaseSavepoint(connection: DatabaseConnection, name: string): Promise<void>;

  /**
   * Rollback to savepoint
   */
  abstract rollbackToSavepoint(connection: DatabaseConnection, name: string): Promise<void>;

  /**
   * Prepare statement
   */
  abstract prepare(connection: DatabaseConnection, sql: string): Promise<PreparedStatement>;

  /**
   * Execute prepared statement
   */
  abstract executePrepared(
    statement: PreparedStatement,
    params?: any[]
  ): Promise<QueryResult>;

  /**
   * Ping connection
   */
  abstract ping(connection: DatabaseConnection): Promise<void>;

  /**
   * Get database metadata
   */
  abstract getMetadata(connection: DatabaseConnection): Promise<DatabaseMetadata>;

  /**
   * Get table information
   */
  abstract getTableInfo(connection: DatabaseConnection, tableName: string): Promise<TableInfo>;

  /**
   * Bulk insert
   */
  abstract bulkInsert(
    connection: DatabaseConnection,
    table: string,
    data: any[]
  ): Promise<number>;

  /**
   * Build stored procedure call
   */
  buildStoredProcedureCall(procedureName: string, params?: any[]): string {
    // Default implementation - can be overridden
    if (!params || params.length === 0) {
      return `CALL ${procedureName}()`;
    }
    
    const placeholders = params.map(() => '?').join(', ');
    return `CALL ${procedureName}(${placeholders})`;
  }

  /**
   * Set session parameter
   */
  async setSessionParameter(
    connection: DatabaseConnection,
    parameter: string,
    value: any
  ): Promise<void> {
    // Store session parameter in connection object
    if (!connection.sessionOptions) {
      connection.sessionOptions = {};
    }
    
    // Map common session parameters
    switch (parameter.toLowerCase()) {
      case 'autocommit':
        connection.sessionOptions.autoCommit = Boolean(value);
        break;
      case 'readonly':
        connection.sessionOptions.readOnly = Boolean(value);
        break;
      case 'locktimeout':
        connection.sessionOptions.lockTimeout = Number(value);
        break;
      case 'statementtimeout':
        connection.sessionOptions.statementTimeout = Number(value);
        break;
      case 'timezone':
        connection.sessionOptions.timezone = String(value);
        break;
      default:
        // For database-specific parameters, override this method
        throw new Error(`Session parameter '${parameter}' not supported by this database type`);
    }
  }

  /**
   * Cancel running query
   */
  async cancelQuery?(connection: DatabaseConnection): Promise<void>;

  /**
   * Stream query results
   * Implementation for async generator without overload issues
   */
  stream?(
    connection: DatabaseConnection,
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): AsyncGenerator<any, void, unknown>;

  /**
   * Escape identifier (table/column name)
   */
  escapeIdentifier(identifier: string): string {
    // Default implementation - override as needed
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Escape value
   */
  escapeValue(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    
    // String values
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Format date for database
   */
  formatDate(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  /**
   * Get isolation level SQL
   */
  getIsolationLevelSQL(level?: string): string {
    switch (level?.toUpperCase()) {
      case 'READ_UNCOMMITTED':
        return 'READ UNCOMMITTED';
      case 'READ_COMMITTED':
        return 'READ COMMITTED';
      case 'REPEATABLE_READ':
        return 'REPEATABLE READ';
      case 'SERIALIZABLE':
        return 'SERIALIZABLE';
      default:
        return 'READ COMMITTED';
    }
  }

  /**
   * Parse connection error
   */
  parseConnectionError(error: any): DatabaseError {
    const message = error.message || 'Unknown database error';
    const enhancedError = new Error(message) as DatabaseError;
    
    // Determine error code based on error properties
    let errorCode = DatabaseErrorCode.UNKNOWN_ERROR;
    
    if (error.code) {
      const code = String(error.code).toUpperCase();
      
      // Common error code mappings
      if (code.includes('CONN') || code.includes('NETWORK') || code === 'ECONNREFUSED') {
        errorCode = DatabaseErrorCode.CONNECTION_ERROR;
      } else if (code.includes('AUTH') || code === 'EAUTH' || code === '28P01') {
        errorCode = DatabaseErrorCode.AUTHENTICATION_ERROR;
      } else if (code.includes('TIMEOUT') || code === 'ETIMEDOUT') {
        errorCode = DatabaseErrorCode.TIMEOUT_ERROR;
      } else if (code === '23505' || code.includes('DUPLICATE')) {
        errorCode = DatabaseErrorCode.DUPLICATE_KEY;
      } else if (code === '23503' || code.includes('FOREIGN')) {
        errorCode = DatabaseErrorCode.FOREIGN_KEY_VIOLATION;
      } else if (code === '23502' || code.includes('NULL')) {
        errorCode = DatabaseErrorCode.NOT_NULL_VIOLATION;
      } else if (code === '42601' || code.includes('SYNTAX')) {
        errorCode = DatabaseErrorCode.QUERY_ERROR;
      } else if (code === '42501' || code.includes('PERMISSION')) {
        errorCode = DatabaseErrorCode.PERMISSION_DENIED;
      }
    }
    
    // Preserve original error properties
    Object.assign(enhancedError, {
      code: errorCode,
      originalError: error,
      context: {
        sqlState: error.sqlState,
        nativeCode: error.code,
        severity: error.severity,
        detail: error.detail,
        hint: error.hint,
        position: error.position,
        file: error.file,
        line: error.line,
        routine: error.routine
      }
    });

    // Add solution suggestions based on error type
    switch (errorCode) {
      case DatabaseErrorCode.CONNECTION_ERROR:
        enhancedError.solution = 'Check database host, port, and network connectivity';
        break;
      case DatabaseErrorCode.AUTHENTICATION_ERROR:
        enhancedError.solution = 'Verify username, password, and authentication method';
        break;
      case DatabaseErrorCode.TIMEOUT_ERROR:
        enhancedError.solution = 'Increase timeout settings or optimize query performance';
        break;
      case DatabaseErrorCode.DUPLICATE_KEY:
        enhancedError.solution = 'Ensure unique constraint values are not duplicated';
        break;
      case DatabaseErrorCode.FOREIGN_KEY_VIOLATION:
        enhancedError.solution = 'Verify referenced records exist before insertion/deletion';
        break;
      case DatabaseErrorCode.NOT_NULL_VIOLATION:
        enhancedError.solution = 'Provide values for all required fields';
        break;
      case DatabaseErrorCode.PERMISSION_DENIED:
        enhancedError.solution = 'Grant necessary permissions to the database user';
        break;
    }

    return enhancedError;
  }

  /**
   * Get server info
   */
  async getServerInfo(connection: DatabaseConnection): Promise<any> {
    // Default implementation
    const metadata = await this.getMetadata(connection);
    
    return {
      type: this.constructor.name.replace('Adapter', ''),
      connected: connection.connected,
      version: metadata.version,
      databaseName: metadata.databaseName,
      serverType: metadata.serverType,
      characterSet: metadata.characterSet,
      collation: metadata.collation,
      currentUser: metadata.currentUser,
      currentSchema: metadata.currentSchema,
      connectionId: connection.id,
      lastActivity: connection.lastActivity,
      inTransaction: connection.inTransaction
    };
  }

  /**
   * Emit event
   */
  protected emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event, data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Add event listener
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event listener
   */
  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Validate connection
   */
  protected validateConnection(connection: DatabaseConnection): void {
    if (!connection || !connection.connected) {
      throw this.parseConnectionError(new Error('Connection is not established'));
    }
  }

  /**
   * Measure query duration
   */
  protected async measureDuration<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    return { result, duration };
  }

  /**
   * Handle transaction state
   */
  protected updateTransactionState(
    connection: DatabaseConnection,
    inTransaction: boolean,
    level: number = 0
  ): void {
    connection.inTransaction = inTransaction;
    connection.transactionLevel = level;
    if (!inTransaction) {
      connection.savepoints = [];
    }
  }

  /**
   * Format query for logging
   */
  protected formatQueryForLog(sql: string, params?: any[]): string {
    let formattedQuery = sql.trim();
    
    if (params && params.length > 0) {
      formattedQuery += '\n-- Parameters: ' + JSON.stringify(params);
    }
    
    return formattedQuery;
  }

  /**
   * Validate table name
   */
  protected validateTableName(tableName: string): void {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name');
    }
    
    // Basic SQL injection prevention
    if (/[';\\]/.test(tableName)) {
      throw new Error('Invalid characters in table name');
    }
  }

  /**
   * Build column list
   */
  protected buildColumnList(columns: string[]): string {
    return columns.map(col => this.escapeIdentifier(col)).join(', ');
  }

  /**
   * Build value placeholders
   */
  protected buildValuePlaceholders(count: number, startIndex: number = 1): string {
    const placeholders: string[] = [];
    for (let i = 0; i < count; i++) {
      placeholders.push(`$${startIndex + i}`);
    }
    return placeholders.join(', ');
  }
}