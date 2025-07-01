// src/steps/database/ConnectionSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { DatabaseContext } from '../../database/context/DatabaseContext';
import { CSDatabase } from '../../database/client/CSDatabase';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { DatabaseConfig, DatabaseType } from '../../database/types/database.types';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { EncryptionConfigurationManager } from '../../core/configuration/EncryptionConfigurationManager';

export class ConnectionSteps extends CSBDDBaseStepDefinition {
    private databaseContext: DatabaseContext;
    private databases: Map<string, CSDatabase> = new Map();
    private currentDatabaseAlias: string = 'default';

    constructor() {
        super();
        this.databaseContext = new DatabaseContext();
    }

    @CSBDDStepDef('user connects with connection string {string}')
    @CSBDDStepDef('user connects using connection string {string}')
    async connectWithConnectionString(connectionString: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_connect', { 
            type: 'connection_string',
            connectionString: this.sanitizeConnectionString(connectionString) 
        });

        try {
            const interpolatedString = this.interpolateVariables(connectionString);
            const config = this.parseConnectionString(interpolatedString);
            
            const database = await CSDatabase.getInstance(config.database || 'default');
            await database.connect();

            const alias = this.generateAliasFromConfig(config);
            this.databases.set(alias, database);
            this.currentDatabaseAlias = alias;

            const connection = await database.getConnection();
            const adapter = database.getAdapter();
            this.databaseContext.setActiveConnection(alias, adapter, connection);

            await actionLogger.logDatabase('connect', `Connected to ${config.type} database`, 0, undefined, { 
                database: config.database,
                host: config.host 
            });

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'connection_string' });
            throw new Error(`Failed to connect with connection string: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user connects to database with options:')
    async connectWithOptions(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_connect', { type: 'options' });

        try {
            const options = this.parseDataTable(dataTable);
            const config = await this.buildDatabaseConfig(options);
            
            const database = await CSDatabase.getInstance(config.database || 'default');
            await database.connect();

            const alias = options['alias'] || this.generateAliasFromConfig(config);
            this.databases.set(alias, database);
            this.currentDatabaseAlias = alias;

            const connection = await database.getConnection();
            const adapter = database.getAdapter();
            this.databaseContext.setActiveConnection(alias, adapter, connection);

            await actionLogger.logDatabase('connect', `Connected to ${config.type} database`, 0, undefined, { 
                database: config.database,
                host: config.host,
                alias: alias
            });

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'connect_with_options' });
            throw new Error(`Failed to connect with options: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user connects to {string} database')
    @CSBDDStepDef('user connects to database {string}')
    async connectToNamedDatabase(databaseAlias: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_connect', { 
            type: 'named',
            alias: databaseAlias 
        });

        try {
            const config = await this.loadDatabaseConfig(databaseAlias);
            
            const database = await CSDatabase.getInstance(databaseAlias);
            await database.connect();

            this.databases.set(databaseAlias, database);
            this.currentDatabaseAlias = databaseAlias;

            const connection = { type: database.getType(), alias: databaseAlias };
            this.databaseContext.setActiveConnection(databaseAlias, database as any, connection as any);

            await actionLogger.logDatabase('connect', `Connected to ${config.type} database`, 0, undefined, { 
                database: config.database,
                host: config.host,
                alias: databaseAlias
            });

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'connect_named', alias: databaseAlias });
            throw new Error(`Failed to connect to database '${databaseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user switches to database {string}')
    @CSBDDStepDef('user uses database {string}')
    async switchToDatabase(databaseAlias: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_switch', { alias: databaseAlias });

        try {
            const database = this.databases.get(databaseAlias);
            if (!database) {
                throw new Error(`Database connection '${databaseAlias}' not found. Available connections: ${Array.from(this.databases.keys()).join(', ')}`);
            }

            this.currentDatabaseAlias = databaseAlias;
            
            const connection = await database.getConnection();
            this.databaseContext.switchConnection(databaseAlias, connection);

            await actionLogger.logDatabase('switch', `Switched to database ${databaseAlias}`, 0);

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'switch_database', alias: databaseAlias });
            throw error;
        }
    }

    @CSBDDStepDef('user disconnects from database')
    @CSBDDStepDef('user closes database connection')
    async disconnectFromDatabase(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_disconnect', { alias: this.currentDatabaseAlias });

        try {
            const database = this.databases.get(this.currentDatabaseAlias);
            if (database) {
                await database.disconnect();
                this.databases.delete(this.currentDatabaseAlias);
            }

            await actionLogger.logDatabase('disconnect', `Disconnected from database`, 0);

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'disconnect' });
            throw new Error(`Failed to disconnect from database: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user disconnects from all databases')
    async disconnectFromAllDatabases(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_disconnect_all');

        const errors: string[] = [];
        
        for (const [alias, database] of this.databases) {
            try {
                await database.disconnect();
                await actionLogger.logDatabase('disconnect', `Disconnected from database ${alias}`, 0);
            } catch (error) {
                errors.push(`${alias}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.databases.clear();

        if (errors.length > 0) {
            throw new Error(`Failed to disconnect from some databases:\n${errors.join('\n')}`);
        }
    }

    @CSBDDStepDef('user verifies database connection')
    @CSBDDStepDef('user checks database connection status')
    async verifyConnection(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_verify_connection', { alias: this.currentDatabaseAlias });

        try {
            const database = this.databases.get(this.currentDatabaseAlias);
            if (!database) {
                throw new Error('No active database connection');
            }

            const isConnected = await database.isConnected();
            if (!isConnected) {
                throw new Error('Database is not connected');
            }

            const testQuery = this.getTestQuery(database.getType());
            const result = await database.query(testQuery);

            await actionLogger.logDatabase('verify', testQuery, 0, result.rowCount, {
                status: 'connected',
                database: this.currentDatabaseAlias
            });

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'verify_connection' });
            throw new Error(`Database connection verification failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user sets database timeout to {int} seconds')
    async setDatabaseTimeout(timeoutSeconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('database_set_timeout', { 
            timeout: timeoutSeconds,
            alias: this.currentDatabaseAlias 
        });

        try {
            const database = this.databases.get(this.currentDatabaseAlias);
            if (!database) {
                throw new Error('No active database connection');
            }

            this.databaseContext.setQueryTimeout(timeoutSeconds * 1000);

            await actionLogger.logDatabase('configure', `Set query timeout to ${timeoutSeconds} seconds`, 0);

        } catch (error) {
            await actionLogger.logError(error as Error, { operation: 'set_timeout' });
            throw new Error(`Failed to set database timeout: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private parseConnectionString(connectionString: string): DatabaseConfig {
        if (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://')) {
            return this.parseMongoConnectionString(connectionString);
        } else if (connectionString.includes('Server=') || connectionString.includes('Data Source=')) {
            return this.parseSqlServerConnectionString(connectionString);
        } else if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
            return this.parsePostgresConnectionString(connectionString);
        } else if (connectionString.startsWith('mysql://')) {
            return this.parseMySqlConnectionString(connectionString);
        } else if (connectionString.startsWith('oracle://')) {
            return this.parseOracleConnectionString(connectionString);
        } else if (connectionString.startsWith('redis://')) {
            return this.parseRedisConnectionString(connectionString);
        }

        throw new Error(`Unsupported connection string format: ${connectionString}`);
    }

    private parseSqlServerConnectionString(connectionString: string): DatabaseConfig {
        const params = new Map<string, string>();
        
        connectionString.split(';').forEach(pair => {
            const [key, value] = pair.split('=').map(s => s.trim());
            if (key && value) {
                params.set(key.toLowerCase(), value);
            }
        });

        return {
            type: 'sqlserver',
            host: params.get('server') || params.get('data source') || 'localhost',
            port: parseInt(params.get('port') || '1433'),
            database: params.get('database') || params.get('initial catalog') || 'master',
            username: params.get('user id') || params.get('uid') || '',
            password: params.get('password') || params.get('pwd') || '',
            ssl: params.get('encrypt') === 'true',
            connectionTimeout: parseInt(params.get('connection timeout') || '30000'),
            options: {
                trustServerCertificate: params.get('trustservercertificate') === 'true',
                integratedSecurity: params.get('integrated security') === 'true'
            }
        };
    }

    private parsePostgresConnectionString(connectionString: string): DatabaseConfig {
        const url = new URL(connectionString);
        const searchParams = new URLSearchParams(url.search);

        return {
            type: 'postgresql',
            host: url.hostname || 'localhost',
            port: parseInt(url.port || '5432'),
            database: url.pathname.substring(1) || 'postgres',
            username: url.username || '',
            password: url.password || '',
            ssl: searchParams.get('sslmode') !== 'disable',
            connectionTimeout: parseInt(searchParams.get('connect_timeout') || '30000'),
            options: Object.fromEntries(searchParams)
        };
    }

    private parseMySqlConnectionString(connectionString: string): DatabaseConfig {
        const url = new URL(connectionString);
        const searchParams = new URLSearchParams(url.search);

        return {
            type: 'mysql',
            host: url.hostname || 'localhost',
            port: parseInt(url.port || '3306'),
            database: url.pathname.substring(1) || 'mysql',
            username: url.username || '',
            password: url.password || '',
            ssl: searchParams.get('ssl') === 'true',
            connectionTimeout: parseInt(searchParams.get('connectTimeout') || '30000'),
            options: Object.fromEntries(searchParams)
        };
    }

    private parseMongoConnectionString(connectionString: string): DatabaseConfig {
        const url = new URL(connectionString);
        const searchParams = new URLSearchParams(url.search);

        return {
            type: 'mongodb',
            host: url.hostname || 'localhost',
            port: parseInt(url.port || '27017'),
            database: url.pathname.substring(1) || searchParams.get('authSource') || 'test',
            username: url.username || '',
            password: url.password || '',
            ssl: url.protocol === 'mongodb+srv:' || searchParams.get('ssl') === 'true',
            connectionString: connectionString,
            options: Object.fromEntries(searchParams)
        };
    }

    private parseOracleConnectionString(connectionString: string): DatabaseConfig {
        const url = new URL(connectionString);
        const searchParams = new URLSearchParams(url.search);

        return {
            type: 'oracle',
            host: url.hostname || 'localhost',
            port: parseInt(url.port || '1521'),
            database: url.pathname.substring(1) || 'ORCL',
            username: url.username || '',
            password: url.password || '',
            ssl: searchParams.get('ssl') === 'true',
            connectionTimeout: parseInt(searchParams.get('connectTimeout') || '30000'),
            options: Object.fromEntries(searchParams)
        };
    }

    private parseRedisConnectionString(connectionString: string): DatabaseConfig {
        const url = new URL(connectionString);
        const searchParams = new URLSearchParams(url.search);

        return {
            type: 'redis',
            host: url.hostname || 'localhost',
            port: parseInt(url.port || '6379'),
            database: url.pathname.substring(1) || '0',
            username: url.username || '',
            password: url.password || '',
            ssl: searchParams.get('ssl') === 'true',
            connectionTimeout: parseInt(searchParams.get('connectTimeout') || '30000'),
            options: Object.fromEntries(searchParams)
        };
    }

    private async buildDatabaseConfig(options: Record<string, any>): Promise<DatabaseConfig> {
        const type = this.validateDatabaseType(options['type'] || options['database_type']);
        const host = options['host'] || options['server'] || 'localhost';
        const database = options['database'] || options['database_name'] || 'test';

        const config: DatabaseConfig = {
            type,
            host,
            database,
            port: parseInt(options['port'] || this.getDefaultPort(type)),
            username: options['username'] || options['user'] || '',
            password: options['password'] || '',
            ssl: options['ssl'] === 'true' || options['use_ssl'] === 'true',
            connectionTimeout: parseInt(options['timeout'] || options['connection_timeout'] || '30000'),
            queryTimeout: parseInt(options['query_timeout'] || '60000'),
            poolSize: parseInt(options['pool_size'] || '10'),
            options: {}
        };

        if (config.password && config.password.startsWith('ENCRYPTED:')) {
            try {
                const testResult = await EncryptionConfigurationManager.testDecryption(config.password);
                if (testResult.success && testResult.decrypted) {
                    config.password = testResult.decrypted;
                }
            } catch (error) {
                this.logger.error('Failed to decrypt database password', error instanceof Error ? error : new Error(String(error)));
            }
        } else if (config.password && config.password.startsWith('encrypted:')) {
            config.password = config.password.substring(10);
        } else if (config.password && config.password.startsWith('enc:')) {
            config.password = config.password.substring(4);
        }

        Object.keys(options).forEach(key => {
            if (!['type', 'database_type', 'host', 'server', 'database', 'database_name', 
                 'port', 'username', 'user', 'password', 'ssl', 'use_ssl', 'timeout', 
                 'connection_timeout', 'query_timeout', 'pool_size', 'alias'].includes(key)) {
                config.options![key] = options[key];
            }
        });

        return config;
    }

    private validateDatabaseType(type: string): DatabaseType {
        const validTypes: DatabaseType[] = ['sqlserver', 'mysql', 'postgresql', 'oracle', 'mongodb', 'redis'];
        const normalizedType = type.toLowerCase().replace(/\s+/g, '') as DatabaseType;
        
        if (!validTypes.includes(normalizedType)) {
            throw new Error(`Invalid database type: ${type}. Valid types are: ${validTypes.join(', ')}`);
        }
        
        return normalizedType;
    }

    private getDefaultPort(type: DatabaseType): string {
        const defaultPorts: Record<DatabaseType, string> = {
            'sqlserver': '1433',
            'mysql': '3306',
            'postgresql': '5432',
            'oracle': '1521',
            'mongodb': '27017',
            'redis': '6379'
        };
        
        return defaultPorts[type] || '0';
    }

    private generateAliasFromConfig(config: DatabaseConfig): string {
        return `${config.type}_${config.host}_${config.database}`.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    private sanitizeConnectionString(connectionString: string): string {
        return connectionString
            .replace(/password=([^;]+)/gi, 'password=***')
            .replace(/pwd=([^;]+)/gi, 'pwd=***')
            .replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
    }

    private async loadDatabaseConfig(alias: string): Promise<DatabaseConfig> {
        const configKey = `database.${alias}`;
        
        if (ConfigurationManager.has(configKey)) {
            const config = ConfigurationManager.get(configKey) as unknown as Record<string, any>;
            return await this.buildDatabaseConfig(config);
        }

        const envConfigKey = `${ConfigurationManager.getEnvironmentName()}.database.${alias}`;
        if (ConfigurationManager.has(envConfigKey)) {
            const config = ConfigurationManager.get(envConfigKey) as unknown as Record<string, any>;
            return await this.buildDatabaseConfig(config);
        }

        throw new Error(`Database configuration not found for alias: ${alias}`);
    }

    private getTestQuery(type: DatabaseType): string {
        const testQueries: Record<DatabaseType, string> = {
            'sqlserver': 'SELECT 1 AS test',
            'mysql': 'SELECT 1 AS test',
            'postgresql': 'SELECT 1 AS test',
            'oracle': 'SELECT 1 AS test FROM DUAL',
            'mongodb': '{ "ping": 1 }',
            'redis': 'PING'
        };
        
        return testQueries[type] || 'SELECT 1';
    }

    private parseDataTable(dataTable: any): Record<string, any> {
        const result: Record<string, any> = {};
        
        if (dataTable && dataTable.raw) {
            dataTable.raw()?.forEach((row: string[]) => {
                if (row.length >= 2 && row[0] && row[1]) {
                    const key = row[0].trim();
                    const value = this.interpolateVariables(row[1].trim());
                    result[key] = value;
                }
            });
        } else if (dataTable && dataTable.rowsHash) {
            const hash = dataTable.rowsHash();
            Object.keys(hash).forEach(key => {
                result[key] = this.interpolateVariables(hash[key]);
            });
        }
        
        return result;
    }

    private interpolateVariables(value: string): string {
        value = value.replace(/\${([^}]+)}/g, (match, varName) => {
            return process.env[varName] || match;
        });

        value = value.replace(/{{([^}]+)}}/g, (match, varName) => {
            const retrieved = this.retrieve(varName);
            return retrieved !== undefined ? String(retrieved) : match;
        });

        value = value.replace(/%([^%]+)%/g, (match, varName) => {
            return ConfigurationManager.get(varName, match) as string;
        });

        return value;
    }
}
