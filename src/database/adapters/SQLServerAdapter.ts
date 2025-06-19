// src/database/adapters/SQLServerAdapter.ts

import { 
  DatabaseConnection, 
  DatabaseConfig, 
  QueryResult, 
  QueryOptions, 
  PreparedStatement,
  TransactionOptions,
  DatabaseMetadata,
  TableInfo
} from '../types/database.types';
import { DatabaseAdapter } from './DatabaseAdapter';
import { logger } from '../../core/utils/Logger';
import * as mssql from 'mssql';

/**
 * SQL Server database adapter implementation
 */
export class SQLServerAdapter extends DatabaseAdapter {
  private mssql!: typeof mssql;
  private connectionCounter: number = 0;

  constructor() {
    super();
  }

  /**
   * Load mssql module dynamically
   */
  private async loadDriver(): Promise<void> {
    if (!this.mssql) {
      try {
        this.mssql = await import('mssql');
      } catch (error) {
        throw new Error('SQL Server driver (mssql) not installed. Run: npm install mssql');
      }
    }
  }

  /**
   * Wrap connection
   */
  private wrapConnection(pool: any, config: DatabaseConfig): DatabaseConnection {
    return {
      id: `sqlserver-${++this.connectionCounter}`,
      type: 'sqlserver',
      instance: pool,
      config,
      connected: true,
      lastActivity: new Date(),
      inTransaction: false,
      transactionLevel: 0,
      savepoints: []
    };
  }

  /**
   * Parse fields from recordset
   */
  private parseFields(recordset: any): Array<{ name: string; dataType: string }> {
    if (!recordset || !recordset.columns) return [];
    return Object.entries(recordset.columns).map(([name, info]: [string, any]) => ({
      name,
      dataType: this.mapSqlServerType(info.type)
    }));
  }

  /**
   * Map SQL Server type to generic type
   */
  private mapSqlServerType(type: any): string {
    if (!type || !type.name) return 'unknown';
    const typeName = type.name.toLowerCase();
    
    switch (typeName) {
      case 'int':
      case 'bigint':
      case 'smallint':
      case 'tinyint':
        return 'integer';
      case 'decimal':
      case 'numeric':
      case 'money':
      case 'smallmoney':
      case 'float':
      case 'real':
        return 'number';
      case 'bit':
        return 'boolean';
      case 'date':
      case 'datetime':
      case 'datetime2':
      case 'smalldatetime':
      case 'time':
        return 'date';
      case 'char':
      case 'varchar':
      case 'text':
      case 'nchar':
      case 'nvarchar':
      case 'ntext':
        return 'string';
      case 'binary':
      case 'varbinary':
      case 'image':
        return 'binary';
      case 'xml':
        return 'xml';
      case 'uniqueidentifier':
        return 'uuid';
      default:
        return typeName;
    }
  }

  /**
   * Connect to SQL Server
   */
  async connect(config: DatabaseConfig): Promise<DatabaseConnection> {
    await this.loadDriver();
    this.config = config;

    try {
      const connectionConfig: any = {
        server: config.host,
        port: config.port || 1433,
        database: config.database,
        user: config.username,
        password: config.password,
        options: {
          encrypt: config.ssl !== false,
          trustServerCertificate: config.additionalOptions?.['trustServerCertificate'] !== false,
          connectTimeout: config.connectionTimeout || 30000,
          requestTimeout: config.queryTimeout || 30000,
          ...config.additionalOptions
        },
        pool: {
          max: config.connectionPoolSize || config.additionalOptions?.['poolSize'] || 10,
          min: config.additionalOptions?.['poolMin'] || 0,
          idleTimeoutMillis: config.additionalOptions?.['poolIdleTimeout'] || 30000
        }
      };

      // Handle connection string override
      if (config.additionalOptions?.['connectionString']) {
        const pool = new this.mssql.ConnectionPool(config.additionalOptions['connectionString']);
        await pool.connect();
        return this.wrapConnection(pool, config);
      }

      const pool = new this.mssql.ConnectionPool(connectionConfig);
      await pool.connect();
      
      return this.wrapConnection(pool, config);
    } catch (error) {
      throw this.parseConnectionError(error);
    }
  }

  /**
   * Disconnect from SQL Server
   */
  async disconnect(connection: DatabaseConnection): Promise<void> {
    try {
      const pool = connection as any;
      await pool.close();
    } catch (error) {
      logger.error('SQL Server disconnect error:', error as Error);
      throw error;
    }
  }

  /**
   * Execute query
   */
  async query(
    connection: DatabaseConnection, 
    sql: string, 
    params?: any[], 
    options?: QueryOptions
  ): Promise<QueryResult> {
    const pool = connection as any;
    const request = pool.request();

    // Set timeout
    if (options?.timeout) {
      request.timeout = options.timeout;
    }

    // Add parameters
    if (params && params.length > 0) {
      params.forEach((param, index) => {
        const paramName = `p${index}`;
        if (param === null || param === undefined) {
          request.input(paramName, this.mssql.NVarChar, null);
        } else if (typeof param === 'number') {
          if (Number.isInteger(param)) {
            request.input(paramName, this.mssql.Int, param);
          } else {
            request.input(paramName, this.mssql.Float, param);
          }
        } else if (typeof param === 'boolean') {
          request.input(paramName, this.mssql.Bit, param);
        } else if (param instanceof Date) {
          request.input(paramName, this.mssql.DateTime2, param);
        } else if (Buffer.isBuffer(param)) {
          request.input(paramName, this.mssql.VarBinary, param);
        } else {
          request.input(paramName, this.mssql.NVarChar, String(param));
        }
      });

      // Replace ? with @p0, @p1, etc.
      sql = sql.replace(/\?/g, (_match, offset, string) => {
        const index = string.substring(0, offset).split('?').length - 1;
        return `@p${index}`;
      });
    }

    try {
      const startTime = Date.now();
      const result = await request.query(sql);
      const executionTime = Date.now() - startTime;

      return {
        rows: result.recordset || [],
        rowCount: result.rowsAffected ? result.rowsAffected[0] : result.recordset?.length || 0,
        affectedRows: result.rowsAffected ? result.rowsAffected[0] : 0,
        fields: this.parseFields(result.recordset),
        duration: executionTime,
        command: sql ? (sql.split(' ')[0] || 'QUERY').toUpperCase() : 'QUERY'
      };
    } catch (error: any) {
      throw this.parseQueryError(error, sql);
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
    const pool = connection as any;
    const request = pool.request();

    // Set timeout
    if (options?.timeout) {
      request.timeout = options.timeout;
    }

    // Add parameters
    if (params && params.length > 0) {
      params.forEach((param, index) => {
        if (param && typeof param === 'object' && param.name) {
          // Named parameter
          this.addParameter(request, param.name, param.value, param.output);
        } else {
          // Positional parameter
          this.addParameter(request, `param${index}`, param);
        }
      });
    }

    try {
      const startTime = Date.now();
      const result = await request.execute(procedureName);
      const executionTime = Date.now() - startTime;

      return {
        rows: result.recordset || [],
        rowCount: result.rowsAffected ? result.rowsAffected[0] : 0,
        affectedRows: result.rowsAffected ? result.rowsAffected[0] : 0,
        output: result.output || {},
        returnValue: result.returnValue,
        duration: executionTime,
        fields: this.parseFields(result.recordset),
        command: 'EXEC'
      };
    } catch (error: any) {
      throw this.parseQueryError(error, `EXEC ${procedureName}`);
    }
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
    const paramPlaceholders = params ? params.map((_, i) => `@p${i}`).join(', ') : '';
    const sql = `SELECT dbo.${functionName}(${paramPlaceholders}) AS result`;
    
    const result = await this.query(connection, sql, params, options);
    return result.rows[0]?.result;
  }

  /**
   * Begin transaction
   */
  async beginTransaction(
    connection: DatabaseConnection,
    options?: TransactionOptions
  ): Promise<void> {
    const pool = connection as any;
    const transaction = pool.transaction();

    if (options?.isolationLevel) {
      transaction.isolationLevel = this.getIsolationLevel(options.isolationLevel);
    }

    await transaction.begin();
    (connection as any)._transaction = transaction;
  }

  /**
   * Commit transaction
   */
  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const transaction = (connection as any)._transaction;
    if (!transaction) {
      throw new Error('No active transaction');
    }

    await transaction.commit();
    delete (connection as any)._transaction;
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const transaction = (connection as any)._transaction;
    if (!transaction) {
      throw new Error('No active transaction');
    }

    await transaction.rollback();
    delete (connection as any)._transaction;
  }

  /**
   * Create savepoint
   */
  async createSavepoint(connection: DatabaseConnection, name: string): Promise<void> {
    await this.query(connection, `SAVE TRANSACTION ${this.escapeIdentifier(name)}`);
  }

  /**
   * Release savepoint
   */
  override async releaseSavepoint(_connection: DatabaseConnection, _name: string): Promise<void> {
    // SQL Server doesn't support explicit savepoint release
    // Savepoints are automatically released on commit
  }

  /**
   * Rollback to savepoint
   */
  async rollbackToSavepoint(connection: DatabaseConnection, name: string): Promise<void> {
    await this.query(connection, `ROLLBACK TRANSACTION ${this.escapeIdentifier(name)}`);
  }

  /**
   * Prepare statement
   */
  async prepare(connection: DatabaseConnection, sql: string): Promise<PreparedStatement> {
    const pool = connection as any;
    const ps = new this.mssql.PreparedStatement(pool);
    
    // Parse parameters from SQL
    const paramMatches = sql.match(/@\w+/g);
    if (paramMatches) {
      paramMatches.forEach(param => {
        ps.input(param.substring(1), this.mssql.NVarChar);
      });
    }

    await ps.prepare(sql);
    
    const preparedStatement: PreparedStatement = {
      id: `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      query: sql,
      paramCount: paramMatches ? paramMatches.length : 0,
      execute: async (params?: any[]) => {
        const paramObject: any = {};
        if (params && paramMatches) {
          paramMatches.forEach((param, index) => {
            if (index < params.length) {
              paramObject[param.substring(1)] = params[index];
            }
          });
        }
        const result = await ps.execute(paramObject);
        return {
          rows: result.recordset || [],
          rowCount: result.rowsAffected?.[0] ?? result.recordset?.length ?? 0,
          affectedRows: result.rowsAffected?.[0] ?? 0,
          fields: this.parseFields(result.recordset),
          duration: 0,
          command: 'EXECUTE'
        };
      },
      close: async () => {
        await ps.unprepare();
      }
    };
    
    return preparedStatement;
  }

  /**
   * Execute prepared statement
   */
  async executePrepared(
    statement: PreparedStatement,
    params?: any[]
  ): Promise<QueryResult> {
    return statement.execute(params);
  }

  /**
   * Ping connection
   */
  async ping(connection: DatabaseConnection): Promise<void> {
    await this.query(connection, 'SELECT 1');
  }

  /**
   * Get database metadata
   */
  async getMetadata(connection: DatabaseConnection): Promise<DatabaseMetadata> {
    const versionResult = await this.query(connection, 'SELECT @@VERSION AS version');
    const dbNameResult = await this.query(connection, 'SELECT DB_NAME() AS dbname');
    
    // Query for table count if needed in the future
    // const tablesResult = await this.query(connection, `
    //   SELECT COUNT(*) as count 
    //   FROM INFORMATION_SCHEMA.TABLES 
    //   WHERE TABLE_TYPE = 'BASE TABLE'
    // `);

    return {
      databaseName: dbNameResult.rows[0].dbname,
      version: versionResult.rows[0].version,
      serverType: 'sqlserver',
      capabilities: {
        transactions: true,
        preparedStatements: true,
        storedProcedures: true,
        bulkInsert: true,
        streaming: false,
        savepoints: true,
        schemas: true,
        json: true,
        arrays: false
      },
      characterSet: 'UTF-8',
      collation: 'SQL_Latin1_General_CP1_CI_AS',
      timezone: 'UTC',
      currentUser: this.config?.username || 'unknown',
      currentSchema: 'dbo'
    };
  }

  /**
   * Get table information
   */
  async getTableInfo(connection: DatabaseConnection, tableName: string): Promise<TableInfo> {
    const columnsResult = await this.query(connection, `
      SELECT 
        COLUMN_NAME as name,
        DATA_TYPE as type,
        CHARACTER_MAXIMUM_LENGTH as length,
        NUMERIC_PRECISION as precision,
        NUMERIC_SCALE as scale,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @p0
      ORDER BY ORDINAL_POSITION
    `, [tableName]);

    const constraintsResult = await this.query(connection, `
      SELECT 
        CONSTRAINT_NAME as name,
        CONSTRAINT_TYPE as type
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_NAME = @p0
    `, [tableName]);

    const indexResult = await this.query(connection, `
      SELECT 
        i.name as indexName,
        i.type_desc as type,
        i.is_unique as isUnique,
        i.is_primary_key as isPrimary
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      WHERE t.name = @p0 AND i.type > 0
    `, [tableName]);

    return {
      name: tableName,
      type: 'table' as const,
      columns: columnsResult.rows.map((col: any, index: number) => ({
        name: col.name,
        ordinalPosition: index + 1,
        dataType: col.type,
        nullable: col.nullable === 'YES',
        defaultValue: col.defaultValue,
        maxLength: col.length,
        precision: col.precision,
        scale: col.scale,
        isPrimaryKey: false,
        isUnique: false,
        isAutoIncrement: false
      })),
      constraints: constraintsResult.rows.map((con: any) => ({
        name: con.name,
        table: tableName,
        type: con.type.toLowerCase().replace(' ', '_') as any,
        columns: [],
        definition: con.type
      })),
      indexes: indexResult.rows.map((idx: any) => ({
        name: idx.indexName,
        table: tableName,
        unique: idx.isUnique,
        columns: [],
        type: idx.type as any
      })),
      rowCount: await this.getTableRowCount(connection, tableName),
      schema: 'dbo'
    };
  }

  /**
   * Bulk insert
   */
  async bulkInsert(
    connection: DatabaseConnection,
    table: string,
    data: any[]
  ): Promise<number> {
    if (data.length === 0) return 0;

    const pool = connection as any;
    const tableObj = new this.mssql.Table(table);
    
    // Get columns from first row
    const columns = Object.keys(data[0]);
    
    // Add columns to table
    columns.forEach(col => {
      const sampleValue = data[0][col];
      
      if (sampleValue === null || sampleValue === undefined) {
        tableObj.columns.add(col, this.mssql.NVarChar, { nullable: true });
      } else if (typeof sampleValue === 'number') {
        if (Number.isInteger(sampleValue)) {
          tableObj.columns.add(col, this.mssql.Int);
        } else {
          tableObj.columns.add(col, this.mssql.Float);
        }
      } else if (typeof sampleValue === 'boolean') {
        tableObj.columns.add(col, this.mssql.Bit);
      } else if (sampleValue instanceof Date) {
        tableObj.columns.add(col, this.mssql.DateTime2);
      } else {
        tableObj.columns.add(col, this.mssql.NVarChar);
      }
    });

    // Add rows
    data.forEach(row => {
      const values = columns.map(col => row[col]);
      tableObj.rows.add(...values);
    });

    const request = pool.request();
    const result = await request.bulk(tableObj);
    
    return result.rowsAffected;
  }

  /**
   * Get isolation level constant
   */
  private getIsolationLevel(level: string): any {
    switch (level.toUpperCase()) {
      case 'READ_UNCOMMITTED':
        return this.mssql.ISOLATION_LEVEL.READ_UNCOMMITTED;
      case 'READ_COMMITTED':
        return this.mssql.ISOLATION_LEVEL.READ_COMMITTED;
      case 'REPEATABLE_READ':
        return this.mssql.ISOLATION_LEVEL.REPEATABLE_READ;
      case 'SERIALIZABLE':
        return this.mssql.ISOLATION_LEVEL.SERIALIZABLE;
      case 'SNAPSHOT':
        return this.mssql.ISOLATION_LEVEL.SNAPSHOT;
      default:
        return this.mssql.ISOLATION_LEVEL.READ_COMMITTED;
    }
  }

  /**
   * Add parameter to request
   */
  private addParameter(request: any, name: string, value: any, output: boolean = false): void {
    const method = output ? 'output' : 'input';
    
    if (value === null || value === undefined) {
      request[method](name, this.mssql.NVarChar, null);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        request[method](name, this.mssql.Int, value);
      } else {
        request[method](name, this.mssql.Float, value);
      }
    } else if (typeof value === 'boolean') {
      request[method](name, this.mssql.Bit, value);
    } else if (value instanceof Date) {
      request[method](name, this.mssql.DateTime2, value);
    } else if (Buffer.isBuffer(value)) {
      request[method](name, this.mssql.VarBinary, value);
    } else {
      request[method](name, this.mssql.NVarChar, String(value));
    }
  }

  /**
   * Get table row count
   */
  private async getTableRowCount(connection: DatabaseConnection, tableName: string): Promise<number> {
    const result = await this.query(
      connection, 
      `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(tableName)}`
    );
    return result.rows[0].count;
  }

  /**
   * Parse query error
   */
  private parseQueryError(error: any, sql: string): Error {
    const message = `SQL Server Error: ${error.message}\nSQL: ${sql.substring(0, 200)}${sql.length > 200 ? '...' : ''}`;
    const enhancedError = new Error(message);
    
    Object.assign(enhancedError, {
      code: error.code,
      number: error.number,
      state: error.state,
      class: error.class,
      lineNumber: error.lineNumber,
      procedure: error.procName,
      originalError: error,
      sql
    });

    return enhancedError;
  }

  /**
   * Escape identifier
   */
  override escapeIdentifier(identifier: string): string {
    return `[${identifier.replace(/]/g, ']]')}]`;
  }
}