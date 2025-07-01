// src/steps/database/DatabaseGenericSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { CSDatabase } from '../../database/client/CSDatabase';
import { DatabaseContext } from '../../database/context/DatabaseContext';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { DatabaseConfig, ResultSet } from '../../database/types/database.types';

export class DatabaseGenericSteps extends CSBDDBaseStepDefinition {
    private databaseContext: DatabaseContext;
    private currentDatabase: CSDatabase | null = null;
    private databases: Map<string, CSDatabase> = new Map();

    constructor() {
        super();
        this.databaseContext = new DatabaseContext();
    }

    async connectToDatabase(databaseAlias: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('connectToDatabase', { databaseAlias });

        try {
            const config = this.getDatabaseConfig(databaseAlias);
            
            this.currentDatabase = await CSDatabase.getInstance(databaseAlias);
            await this.currentDatabase.connect();

            this.databases.set(databaseAlias, this.currentDatabase);
            const connection = await this.currentDatabase.getConnection();
            const adapter = this.currentDatabase.getAdapter();
            this.databaseContext.setActiveConnection(databaseAlias, adapter, connection);

            await actionLogger.logDatabase('connected', databaseAlias, 0, undefined, { 
                host: config.host,
                database: config.database,
                type: config.type
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'connection_failed' });
            throw new Error(`Failed to connect to database '${databaseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user connects to {string} database with timeout {int} seconds')
    async connectToDatabaseWithTimeout(databaseAlias: string, timeout: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('connectWithTimeout', { databaseAlias, timeout });

        try {
            const config = this.getDatabaseConfig(databaseAlias);
            config.connectionTimeout = timeout * 1000;

            this.currentDatabase = await CSDatabase.getInstance(databaseAlias);
            await this.currentDatabase.connect();

            this.databases.set(databaseAlias, this.currentDatabase);
            const connection = await this.currentDatabase.getConnection();
            const adapter = this.currentDatabase.getAdapter();
            this.databaseContext.setActiveConnection(databaseAlias, adapter, connection);

            await actionLogger.logDatabase('connected_with_timeout', databaseAlias, 0, undefined, { timeout });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'connection_timeout' });
            throw new Error(`Connection to '${databaseAlias}' timed out after ${timeout} seconds: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async setDatabaseTimeout(timeout: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setDatabaseTimeout', { timeout });

        this.databaseContext.setQueryTimeout(timeout * 1000);

        await actionLogger.logDatabase('timeout_set', 'timeout', 0, undefined, { timeout });
    }

    @CSBDDStepDef('user sets database connection pool size to {int}')
    async setConnectionPoolSize(poolSize: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setConnectionPoolSize', { poolSize });

        if (poolSize < 1 || poolSize > 100) {
            throw new Error(`Invalid pool size: ${poolSize}. Must be between 1 and 100`);
        }

        this.store('defaultPoolSize', poolSize);

        await actionLogger.logDatabase('pool_size_set', 'pool', 0, undefined, { poolSize });
    }

    @CSBDDStepDef('user executes query {string}')
    @CSBDDStepDef('user runs query {string}')
    async executeQuery(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('executeQuery', { query: this.sanitizeQueryForLog(query) });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedQuery = this.interpolateVariables(query);
            
            const startTime = Date.now();
            const result = await db.query(interpolatedQuery);
            const executionTime = Date.now() - startTime;

            this.store('lastDatabaseResult', result);
            const queryResult = {
                rows: result.rows || [],
                rowCount: result.rowCount,
                fields: result.fields || [],
                command: 'QUERY',
                duration: executionTime
            };
            this.databaseContext.storeResult('last', queryResult);

            await actionLogger.logDatabase('query_executed', interpolatedQuery, executionTime, result.rowCount, {
                affectedRows: result.affectedRows
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'query_execution_failed' });
            throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}\nQuery: ${this.sanitizeQueryForLog(query)}`);
        }
    }

    @CSBDDStepDef('user executes query {string} and stores result as {string}')
    async executeQueryAndStore(query: string, alias: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('executeQueryAndStore', { 
            query: this.sanitizeQueryForLog(query), 
            alias 
        });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedQuery = this.interpolateVariables(query);
            
            const result = await db.query(interpolatedQuery);
            
            const queryResult = {
                rows: result.rows || [],
                rowCount: result.rowCount,
                fields: result.fields || [],
                command: 'QUERY',
                duration: 0
            };
            this.databaseContext.storeResult(alias, queryResult);
            this.store('lastDatabaseResult', result);

            await actionLogger.logDatabase('query_result_stored', interpolatedQuery, 0, result.rowCount, {
                alias
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'query_store_failed' });
            throw new Error(`Failed to execute and store query result: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the query result should have {int} rows')
    @CSBDDStepDef('the query result should have {int} row')
    async validateRowCount(expectedCount: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateRowCount', { expectedCount });

        const result = this.getLastResult();
        
        if (result.rowCount !== expectedCount) {
            throw new Error(
                `Expected ${expectedCount} row(s), but got ${result.rowCount}`
            );
        }

        await actionLogger.logDatabase('row_count_validated', 'validation', 0, result.rowCount, { 
            expected: expectedCount 
        });
    }

    @CSBDDStepDef('the query result should have at least {int} rows')
    async validateMinRowCount(minCount: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateMinRowCount', { minCount });

        const result = this.getLastResult();
        
        if (result.rowCount < minCount) {
            throw new Error(
                `Expected at least ${minCount} row(s), but got ${result.rowCount}`
            );
        }

        await actionLogger.logDatabase('min_row_count_validated', 'validation', 0, result.rowCount, { 
            minimum: minCount 
        });
    }

    @CSBDDStepDef('the query result should have at most {int} rows')
    async validateMaxRowCount(maxCount: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateMaxRowCount', { maxCount });

        const result = this.getLastResult();
        
        if (result.rowCount > maxCount) {
            throw new Error(
                `Expected at most ${maxCount} row(s), but got ${result.rowCount}`
            );
        }

        await actionLogger.logDatabase('max_row_count_validated', 'validation', 0, result.rowCount, { 
            maximum: maxCount 
        });
    }

    @CSBDDStepDef('the query result should be empty')
    @CSBDDStepDef('the query should return no rows')
    async validateEmptyResult(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateEmptyResult', {});

        const result = this.getLastResult();
        
        if (result.rowCount > 0) {
            throw new Error(
                `Expected empty result, but got ${result.rowCount} row(s)`
            );
        }

        await actionLogger.logDatabase('empty_result_validated', 'validation', 0, 0, {});
    }

    @CSBDDStepDef('user logs database query result')
    @CSBDDStepDef('user prints database query result')
    async logQueryResult(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        const result = this.getLastResult();
        
        await actionLogger.logDatabase('log_result', 'log', 0, result.rowCount, {
            columnCount: result.columns ? result.columns.length : 0,
            columns: result.columns ? result.columns.map(col => col.name) : []
        });

        const rowsToLog = result.rows ? Math.min(10, result.rows.length) : 0;
        if (rowsToLog > 0 && result.rows) {
            console.log('\n=== Query Result ===');
            console.log(`Columns: ${result.columns ? result.columns.map(col => col.name).join(', ') : 'N/A'}`);
            console.log(`Total Rows: ${result.rowCount}`);
            console.log(`\nFirst ${rowsToLog} rows:`);
            
            result.rows.slice(0, rowsToLog).forEach((row, index) => {
                console.log(`Row ${index + 1}:`, row);
            });

            if (result.rowCount > rowsToLog) {
                console.log(`... and ${result.rowCount - rowsToLog} more rows`);
            }
            console.log('==================\n');
        }
    }

    @CSBDDStepDef('user clears database cache')
    async clearDatabaseCache(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearDatabaseCache', {});

        this.store('lastDatabaseResult', null);
        this.store('databaseQueryLogging', null);
        
        await actionLogger.logDatabase('cache_cleared', 'cache', 0, undefined, {});
    }

    @CSBDDStepDef('user enables database query logging')
    async enableQueryLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('enableQueryLogging', {});

        this.store('databaseQueryLogging', true);
        
        await actionLogger.logDatabase('query_logging_enabled', 'config', 0, undefined, {});
    }

    @CSBDDStepDef('user disables database query logging')
    async disableQueryLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('disableQueryLogging', {});

        this.store('databaseQueryLogging', false);
        
        await actionLogger.logDatabase('query_logging_disabled', 'config', 0, undefined, {});
    }

    @CSBDDStepDef('user validates database connection')
    @CSBDDStepDef('database connection should be active')
    async validateConnection(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateConnection', {});

        const db = this.getCurrentDatabase();
        const isConnected = db.isConnected();
        
        if (!isConnected) {
            throw new Error('Database connection is not active');
        }

        await actionLogger.logDatabase('connection_validated', 'validation', 0, undefined, { status: 'active' });
    }

    private getDatabaseConfig(alias: string): DatabaseConfig {
        const envPrefix = `DB_${alias.toUpperCase()}_`;
        
        const type = ConfigurationManager.get(`${envPrefix}TYPE`) || 
                    ConfigurationManager.get('DB_TYPE', 'sqlserver');
        
        const config: DatabaseConfig = {
            type: type as any,
            host: ConfigurationManager.getRequired(`${envPrefix}HOST`),
            port: ConfigurationManager.getInt(`${envPrefix}PORT`, this.getDefaultPort(type)),
            database: ConfigurationManager.getRequired(`${envPrefix}DATABASE`),
            username: ConfigurationManager.getRequired(`${envPrefix}USERNAME`),
            password: ConfigurationManager.getRequired(`${envPrefix}PASSWORD`),
            options: {
                encrypt: ConfigurationManager.getBoolean(`${envPrefix}ENCRYPT`, true),
                trustServerCertificate: ConfigurationManager.getBoolean(`${envPrefix}TRUST_CERT`, false),
                connectionTimeout: ConfigurationManager.getInt(`${envPrefix}CONNECTION_TIMEOUT`, 30000),
                requestTimeout: ConfigurationManager.getInt(`${envPrefix}REQUEST_TIMEOUT`, 60000),
                pool: {
                    min: ConfigurationManager.getInt(`${envPrefix}POOL_MIN`, 2),
                    max: ConfigurationManager.getInt(`${envPrefix}POOL_MAX`, 10),
                    idleTimeoutMillis: ConfigurationManager.getInt(`${envPrefix}POOL_IDLE_TIMEOUT`, 30000)
                }
            }
        };

        return config;
    }

    private getDefaultPort(type: string): number {
        const ports: Record<string, number> = {
            'sqlserver': 1433,
            'mysql': 3306,
            'postgresql': 5432,
            'oracle': 1521,
            'mongodb': 27017,
            'redis': 6379
        };
        return ports[type.toLowerCase()] || 1433;
    }

    private getCurrentDatabase(): CSDatabase {
        if (!this.currentDatabase) {
            throw new Error('No database connection established. Use "Given user connects to ... database" first');
        }
        return this.currentDatabase;
    }

    private getLastResult(): ResultSet {
        const result = this.retrieve('lastDatabaseResult') as ResultSet;
        if (!result) {
            throw new Error('No query result available. Execute a query first');
        }
        return result;
    }

    private sanitizeQueryForLog(query: string): string {
        const maxLength = 200;
        if (query.length > maxLength) {
            return query.substring(0, maxLength) + '...';
        }
        return query;
    }

    private interpolateVariables(text: string): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_, variable) => {
            const value = this.retrieve(variable);
            if (value === undefined) {
                throw new Error(`Variable '${variable}' is not defined in context`);
            }
            return String(value);
        });
    }
}
