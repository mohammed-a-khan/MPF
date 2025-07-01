// src/database/client/CSDatabase.ts

import {
  DatabaseConfig,
  DatabaseConnection,
  ResultSet,
  QueryOptions,
  DatabaseType,
  PreparedStatement,
  BulkOperation,
  DatabaseMetadata,
  TransactionOptions,
} from '../types/database.types';
import { ConnectionManager } from './ConnectionManager';
import { QueryExecutor } from './QueryExecutor';
import { TransactionManager } from './TransactionManager';
import { ResultSetParser } from './ResultSetParser';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { SQLServerAdapter } from '../adapters/SQLServerAdapter';
import { MySQLAdapter } from '../adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '../adapters/PostgreSQLAdapter';
import { OracleAdapter } from '../adapters/OracleAdapter';
import { MongoDBAdapter } from '../adapters/MongoDBAdapter';
import { RedisAdapter } from '../adapters/RedisAdapter';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

export class CSDatabase {
  private static instances: Map<string, CSDatabase> = new Map();
  private adapter: DatabaseAdapter;
  private connectionManager: ConnectionManager;
  private queryExecutor: QueryExecutor;
  private transactionManager: TransactionManager;
  private resultSetParser: ResultSetParser;
  private config: DatabaseConfig;
  private connectionAlias: string;
  private connected: boolean = false;

  private constructor(config: DatabaseConfig, alias: string) {
    this.config = this.processConfig(config);
    this.connectionAlias = alias;
    this.adapter = this.createAdapter(config.type);
    this.connectionManager = new ConnectionManager(this.adapter);
    this.queryExecutor = new QueryExecutor(this.adapter);
    this.transactionManager = new TransactionManager(this.adapter);
    this.resultSetParser = new ResultSetParser(this.adapter);
  }

  static async getInstance(alias: string = 'default'): Promise<CSDatabase> {
    if (!this.instances.has(alias)) {
      const config = await this.loadDatabaseConfig(alias);
      this.instances.set(alias, new CSDatabase(config, alias));
    }
    return this.instances.get(alias)!;
  }

  static async connectWithConnectionString(connectionString: string, alias: string = 'default'): Promise<CSDatabase> {
    const config = this.parseConnectionString(connectionString);
    const instance = new CSDatabase(config, alias);
    this.instances.set(alias, instance);
    await instance.connect();
    return instance;
  }

  async connect(): Promise<DatabaseConnection> {
    try {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('connect', this.connectionAlias, 0);

      const connection = await this.connectionManager.connect(this.config);
      this.connected = true;

      if (this.config.sessionParameters) {
        await this.setSessionParameters(connection, this.config.sessionParameters);
      }

      await actionLogger.logDatabase('connected', this.connectionAlias, 0, undefined, {
        type: this.config.type,
        database: this.config.database,
        host: this.config.host,
      });

      return connection;
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('connectError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'CONNECTION_FAILED');
    }
  }

  async execute(sql: string, params?: any[]): Promise<ResultSet> {
    return this.query(sql, params);
  }

  async executeWithPlan(sql: string, params?: any[]): Promise<ResultSet> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('queryWithPlan', sql, 0, undefined, { alias: this.connectionAlias, params });
      const startTime = Date.now();

      const connection = await this.connectionManager.getConnection();

      let executionPlan: string = '';
      const dbType = this.config.type.toLowerCase();

      try {
        switch (dbType) {
          case 'mysql':
            const mysqlPlan = await this.queryExecutor.execute(connection, `EXPLAIN ${sql}`, params);
            executionPlan = this.formatExecutionPlan(mysqlPlan);
            break;
          case 'postgresql':
            const pgPlan = await this.queryExecutor.execute(connection, `EXPLAIN ANALYZE ${sql}`, params);
            executionPlan = this.formatExecutionPlan(pgPlan);
            break;
          case 'sqlite':
            const sqlitePlan = await this.queryExecutor.execute(connection, `EXPLAIN QUERY PLAN ${sql}`, params);
            executionPlan = this.formatExecutionPlan(sqlitePlan);
            break;
          case 'mssql':
          case 'sqlserver':
            await this.queryExecutor.execute(connection, 'SET SHOWPLAN_TEXT ON');
            const mssqlPlan = await this.queryExecutor.execute(connection, sql, params);
            executionPlan = this.formatExecutionPlan(mssqlPlan);
            await this.queryExecutor.execute(connection, 'SET SHOWPLAN_TEXT OFF');
            break;
          case 'oracle':
            await this.queryExecutor.execute(connection, `EXPLAIN PLAN FOR ${sql}`, params);
            const oraclePlan = await this.queryExecutor.execute(
              connection,
              'SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY())',
            );
            executionPlan = this.formatExecutionPlan(oraclePlan);
            break;
          default:
            const defaultPlan = await this.queryExecutor.execute(connection, `EXPLAIN ${sql}`, params);
            executionPlan = this.formatExecutionPlan(defaultPlan);
        }
      } catch (planError) {
        const logger = Logger.getInstance();
        logger.warn(`Failed to get execution plan: ${(planError as Error).message}`);
      }

      const result = await this.queryExecutor.execute(connection, sql, params);

      const duration = Date.now() - startTime;
      await actionLogger.logDatabase('queryWithPlanResult', sql, duration, result.rowCount, {
        alias: this.connectionAlias,
        executionPlan,
      });

      if (result['metadata']) {
        result['metadata'].executionPlan = executionPlan;
      } else {
        result['metadata'] = { executionPlan };
      }

      this.storeResultForChaining(result);

      return result;
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('queryWithPlanError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        sql,
        params,
      });
      throw this.enhanceError(error as Error, 'QUERY_WITH_PLAN_FAILED', { sql, params });
    }
  }

  private formatExecutionPlan(result: ResultSet): string {
    if (!result || !result.rows || result.rows.length === 0) {
      return 'No execution plan available';
    }

    let plan = '';

    if (Array.isArray(result.rows)) {
      result.rows.forEach((row: any, index: number) => {
        if (typeof row === 'object') {
          const planText =
            row['QUERY PLAN'] ||
            row['QueryPlan'] ||
            row['Plan'] ||
            row['EXPLAIN'] ||
            row['Extra'] ||
            row['StmtText'] ||
            row['PLAN_TABLE_OUTPUT'] ||
            JSON.stringify(row, null, 2);
          plan += `${index > 0 ? '\n' : ''}${planText}`;
        } else {
          plan += `${index > 0 ? '\n' : ''}${row}`;
        }
      });
    }

    return plan || 'Execution plan format not recognized';
  }

  async query<T = any>(sql: string, params?: any[], options?: QueryOptions): Promise<ResultSet> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('query', sql, 0, undefined, { alias: this.connectionAlias, params });
      const startTime = Date.now();

      const connection = await this.connectionManager.getConnection();
      const rawResult = await this.queryExecutor.execute(connection, sql, params, options);
      const result = this.resultSetParser.parse<T>(rawResult, options);

      const duration = Date.now() - startTime;
      await actionLogger.logDatabase('queryResult', sql, duration, result.rowCount, { alias: this.connectionAlias });

      this.storeResultForChaining(result);

      return result;
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('queryError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        sql,
        params,
      });
      throw this.enhanceError(error as Error, 'QUERY_FAILED', { sql, params });
    }
  }

  async queryByName(queryName: string, params?: any[], options?: QueryOptions): Promise<ResultSet> {
    const sql = ConfigurationManager.get(`DATABASE_QUERY_${queryName.toUpperCase()}`);
    if (!sql) {
      throw new Error(`Predefined query '${queryName}' not found in configuration`);
    }

    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logDatabase('queryByName', this.connectionAlias, 0, undefined, { queryName });
    return this.query(sql, params, options);
  }

  async queryFromFile(filePath: string, params?: any[], options?: QueryOptions): Promise<ResultSet> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const resolvedPath = path.resolve(process.cwd(), filePath);
      const sql = await fs.readFile(resolvedPath, 'utf-8');

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('queryFromFile', this.connectionAlias, 0, undefined, { filePath });
      return this.query(sql, params, options);
    } catch (error) {
      throw this.enhanceError(error as Error, 'FILE_READ_FAILED', { filePath });
    }
  }

  async executeStoredProcedure(procedureName: string, params?: any[], options?: QueryOptions): Promise<ResultSet> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('storedProcedure', this.connectionAlias, 0, undefined, { procedureName, params });

      const connection = await this.connectionManager.getConnection();
      const rawResult = await this.queryExecutor.executeStoredProcedure(connection, procedureName, params, options);
      const result = this.resultSetParser.parse(rawResult, options);

      this.storeResultForChaining(result);

      return result;
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('storedProcedureError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        procedureName,
      });
      throw this.enhanceError(error as Error, 'STORED_PROCEDURE_FAILED', { procedureName });
    }
  }

  async executeFunction(functionName: string, params?: any[], options?: QueryOptions): Promise<any> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('function', this.connectionAlias, 0, undefined, { functionName, params });

      const connection = await this.connectionManager.getConnection();
      const result = await this.queryExecutor.executeFunction(connection, functionName, params, options);

      return result;
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('functionError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        functionName,
      });
      throw this.enhanceError(error as Error, 'FUNCTION_FAILED', { functionName });
    }
  }

  async beginTransaction(options?: TransactionOptions): Promise<void> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('beginTransaction', this.connectionAlias, 0, undefined, options as any);

      const connection = await this.connectionManager.getConnection();
      await this.transactionManager.begin(connection, options);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('beginTransactionError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'TRANSACTION_BEGIN_FAILED');
    }
  }

  async commitTransaction(): Promise<void> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('commitTransaction', this.connectionAlias, 0);

      const connection = await this.connectionManager.getConnection();
      await this.transactionManager.commit(connection);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('commitTransactionError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'TRANSACTION_COMMIT_FAILED');
    }
  }

  async rollbackTransaction(savepoint?: string): Promise<void> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('rollbackTransaction', this.connectionAlias, 0, undefined, { savepoint });

      const connection = await this.connectionManager.getConnection();
      await this.transactionManager.rollback(connection, savepoint);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('rollbackTransactionError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'TRANSACTION_ROLLBACK_FAILED');
    }
  }

  async createSavepoint(name: string): Promise<void> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('createSavepoint', this.connectionAlias, 0, undefined, { name });

      const connection = await this.connectionManager.getConnection();
      await this.transactionManager.savepoint(connection, name);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('createSavepointError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'SAVEPOINT_CREATE_FAILED');
    }
  }

  async executeBatch(operations: BulkOperation[]): Promise<ResultSet[]> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('executeBatch', this.connectionAlias, 0, undefined, { count: operations.length });
      const startTime = Date.now();

      const connection = await this.connectionManager.getConnection();
      const results: ResultSet[] = [];

      await this.beginTransaction();

      try {
        for (const operation of operations) {
          const rawResult = await this.queryExecutor.execute(
            connection,
            operation.sql,
            operation.params,
            operation.options,
          );
          results.push(this.resultSetParser.parse(rawResult, operation.options));
        }

        await this.commitTransaction();

        const duration = Date.now() - startTime;
        const actionLogger2 = ActionLogger.getInstance();
        await actionLogger2.logDatabase('batchCompleted', this.connectionAlias, duration, operations.length, {
          count: operations.length,
          duration,
        });

        return results;
      } catch (error) {
        await this.rollbackTransaction();
        throw error;
      }
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('executeBatchError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'BATCH_EXECUTION_FAILED');
    }
  }

  async bulkInsert(table: string, data: any[], options?: { batchSize?: number }): Promise<number> {
    try {
      this.validateConnection();

      const batchSize = options?.batchSize || 1000;
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('bulkInsert', this.connectionAlias, 0, undefined, {
        table,
        rows: data.length,
        batchSize,
      });

      const connection = await this.connectionManager.getConnection();
      let totalInserted = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const inserted = await this.adapter.bulkInsert(connection, table, batch);
        totalInserted += inserted;

        const actionLogger2 = ActionLogger.getInstance();
        await actionLogger2.logDatabase('bulkInsertBatch', this.connectionAlias, 0, inserted, {
          batchNumber: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          inserted,
        });
      }

      return totalInserted;
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('bulkInsertError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        table,
      });
      throw this.enhanceError(error as Error, 'BULK_INSERT_FAILED', { table });
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('prepare', this.connectionAlias, 0, undefined, { sql });

      const connection = await this.connectionManager.getConnection();
      return this.adapter.prepare(connection, sql);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('prepareError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'PREPARE_FAILED');
    }
  }

  async getMetadata(): Promise<DatabaseMetadata> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('getMetadata', this.connectionAlias, 0);

      const connection = await this.connectionManager.getConnection();
      return this.adapter.getMetadata(connection);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('getMetadataError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'METADATA_FAILED');
    }
  }

  async getTableInfo(tableName: string): Promise<any> {
    try {
      this.validateConnection();

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('getTableInfo', this.connectionAlias, 0, undefined, { tableName });

      const connection = await this.connectionManager.getConnection();
      return this.adapter.getTableInfo(connection, tableName);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('getTableInfoError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        tableName,
      });
      throw this.enhanceError(error as Error, 'TABLE_INFO_FAILED', { tableName });
    }
  }

  async exportResult(
    result: ResultSet,
    format: 'csv' | 'json' | 'xml' | 'excel' | 'text',
    filePath: string,
  ): Promise<void> {
    try {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('exportResult', this.connectionAlias, 0, undefined, { format, filePath });

      await this.resultSetParser.export(result, format, filePath);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('exportResultError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        format,
        filePath,
      });
      throw this.enhanceError(error as Error, 'EXPORT_FAILED', { format, filePath });
    }
  }

  async importData(
    table: string,
    filePath: string,
    format: 'csv' | 'json' | 'xml' | 'excel',
    options?: any,
  ): Promise<number> {
    try {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('importData', this.connectionAlias, 0, undefined, { table, format, filePath });

      const data = await this.resultSetParser.import(filePath, format, options);
      return this.bulkInsert(table, data, options);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('importDataError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
        table,
        format,
        filePath,
      });
      throw this.enhanceError(error as Error, 'IMPORT_FAILED', { table, format, filePath });
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (!this.connected) return;

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('disconnect', this.connectionAlias, 0);

      await this.connectionManager.disconnect();
      this.connected = false;

      CSDatabase.instances.delete(this.connectionAlias);
    } catch (error) {
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('disconnectError', this.connectionAlias, 0, undefined, {
        error: (error as Error).message,
      });
      throw this.enhanceError(error as Error, 'DISCONNECT_FAILED');
    }
  }

  isConnected(): boolean {
    return this.connected && this.connectionManager.isHealthy();
  }

  getType(): DatabaseType {
    return this.config.type;
  }

  getAlias(): string {
    return this.connectionAlias;
  }

  getPoolStats(): any {
    return this.connectionManager.getPoolStats();
  }

  getAdapter(): DatabaseAdapter {
    return this.adapter;
  }

  async getConnection(): Promise<DatabaseConnection> {
    this.validateConnection();
    return this.connectionManager.getConnection();
  }

  private static async loadDatabaseConfig(alias: string): Promise<DatabaseConfig> {
    const config: DatabaseConfig = {
      type: ConfigurationManager.get(`DB_${alias.toUpperCase()}_TYPE`, 'sqlserver') as DatabaseType,
      host: ConfigurationManager.getRequired(`DB_${alias.toUpperCase()}_HOST`),
      port: ConfigurationManager.getInt(`DB_${alias.toUpperCase()}_PORT`, 1433),
      database: ConfigurationManager.getRequired(`DB_${alias.toUpperCase()}_DATABASE`),
      username: ConfigurationManager.get(`DB_${alias.toUpperCase()}_USERNAME`) || '',
      password: ConfigurationManager.get(`DB_${alias.toUpperCase()}_PASSWORD`) || '',
      connectionString: ConfigurationManager.get(`DB_${alias.toUpperCase()}_CONNECTION_STRING`),
      ssl: ConfigurationManager.getBoolean(`DB_${alias.toUpperCase()}_SSL`, false),
      connectionTimeout: ConfigurationManager.getInt(`DB_${alias.toUpperCase()}_CONNECTION_TIMEOUT`, 30000),
      queryTimeout: ConfigurationManager.getInt(`DB_${alias.toUpperCase()}_REQUEST_TIMEOUT`, 30000),
      poolSize: ConfigurationManager.getInt(`DB_${alias.toUpperCase()}_POOL_SIZE`, 10),
      options: {},
    };

    const optionsPrefix = `DB_${alias.toUpperCase()}_OPTION_`;
    const allKeys = ConfigurationManager.getAllKeys();

    allKeys
      .filter(key => key.startsWith(optionsPrefix))
      .forEach(key => {
        const optionName = key.substring(optionsPrefix.length).toLowerCase();
        config.options![optionName] = ConfigurationManager.get(key);
      });

    return config;
  }

  private static parseConnectionString(connectionString: string): DatabaseConfig {
    const config: DatabaseConfig = {
      type: 'sqlserver' as DatabaseType,
      connectionString,
      host: '',
      port: 1433,
      database: '',
      options: {},
    };

    if (connectionString.toLowerCase().includes('mysql://')) {
      config.type = 'mysql';
      config.port = 3306;
    } else if (
      connectionString.toLowerCase().includes('postgresql://') ||
      connectionString.toLowerCase().includes('postgres://')
    ) {
      config.type = 'postgresql';
      config.port = 5432;
    } else if (connectionString.toLowerCase().includes('mongodb://')) {
      config.type = 'mongodb';
      config.port = 27017;
    } else if (connectionString.toLowerCase().includes('redis://')) {
      config.type = 'redis';
      config.port = 6379;
    } else if (connectionString.toLowerCase().includes('oracle:')) {
      config.type = 'oracle';
      config.port = 1521;
    }

    const serverMatch = connectionString.match(/(?:server|host)=([^;]+)/i);
    if (serverMatch && serverMatch[1]) config.host = serverMatch[1];

    const databaseMatch = connectionString.match(/(?:database|initial catalog)=([^;]+)/i);
    if (databaseMatch && databaseMatch[1]) config.database = databaseMatch[1];

    const userMatch = connectionString.match(/(?:user id|uid|username)=([^;]+)/i);
    if (userMatch && userMatch[1]) config.username = userMatch[1];

    const passwordMatch = connectionString.match(/(?:password|pwd)=([^;]+)/i);
    if (passwordMatch && passwordMatch[1]) config.password = passwordMatch[1];

    const portMatch = connectionString.match(/(?:port)=(\d+)/i);
    if (portMatch && portMatch[1]) config.port = parseInt(portMatch[1]);

    if (!config.username) config.username = '';
    if (!config.password) config.password = '';

    return config;
  }

  private processConfig(config: DatabaseConfig): DatabaseConfig {
    const processed = { ...config };

    if (processed.password && processed.password.startsWith('enc:')) {
      processed.password = processed.password.substring(4);
    }

    if (processed.connectionString && processed.connectionString.includes('password=enc:')) {
      const encMatch = processed.connectionString.match(/password=enc:([^;]+)/i);
      if (encMatch) {
        const decrypted = encMatch[1];
        processed.connectionString = processed.connectionString.replace(
          `password=enc:${encMatch[1]}`,
          `password=${decrypted}`,
        );
      }
    }

    return processed;
  }

  private createAdapter(type: DatabaseType): DatabaseAdapter {
    switch (type) {
      case 'sqlserver':
        return new SQLServerAdapter();
      case 'mysql':
        return new MySQLAdapter();
      case 'postgresql':
        return new PostgreSQLAdapter();
      case 'oracle':
        return new OracleAdapter();
      case 'mongodb':
        return new MongoDBAdapter();
      case 'redis':
        return new RedisAdapter();
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  private validateConnection(): void {
    if (!this.connected) {
      throw new Error('Database not connected. Call connect() first.');
    }

    if (!this.connectionManager.isHealthy()) {
      throw new Error('Database connection is not healthy. Reconnection may be required.');
    }
  }

  private async setSessionParameters(connection: DatabaseConnection, parameters: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(parameters)) {
      try {
        await this.adapter.setSessionParameter(connection, key, value);
      } catch (error) {
        const logger = Logger.getInstance();
        logger.warn(`Failed to set session parameter ${key}: ${(error as Error).message}`);
      }
    }
  }

  private storeResultForChaining(result: ResultSet): void {
    const BDDContext = require('../../bdd/context/BDDContext').BDDContext;
    BDDContext.setDatabaseResult(this.connectionAlias, result);
  }

  private enhanceError(error: Error, code: string, context?: any): Error {
    const enhanced = new Error(`[${code}] ${error.message}`);
    (enhanced as any).code = code;
    (enhanced as any).originalError = error;
    (enhanced as any).database = this.connectionAlias;
    (enhanced as any).context = context;

    if (code === 'CONNECTION_FAILED') {
      enhanced.message +=
        '\n\nTroubleshooting:\n' +
        '1. Check database server is running and accessible\n' +
        '2. Verify connection parameters (host, port, credentials)\n' +
        '3. Check firewall rules\n' +
        '4. Verify SSL/TLS settings if applicable';
    } else if (code === 'QUERY_FAILED' && context?.sql) {
      enhanced.message += '\n\nSQL: ' + context.sql;
      if (context.params) {
        enhanced.message += '\nParameters: ' + JSON.stringify(context.params);
      }
    }

    return enhanced;
  }

  static async disconnectAll(): Promise<void> {
    const promises = Array.from(this.instances.values()).map(db => db.disconnect());
    await Promise.all(promises);
    this.instances.clear();
  }
}
