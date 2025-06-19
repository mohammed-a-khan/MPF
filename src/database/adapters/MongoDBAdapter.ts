// src/database/adapters/MongoDBAdapter.ts

import { DatabaseAdapter } from './DatabaseAdapter';
import { 
    DatabaseConfig, 
    QueryResult, 
    PreparedStatement, 
    BulkInsertOptions,
    TransactionOptions,
    DatabaseCapabilities,
    ConnectionHealth,
    QueryOptions,
    DatabaseMetadata,
    TableInfo,
    ColumnInfo
} from '../types/database.types';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as mongodb from 'mongodb';
import { ReadConcernLevel } from 'mongodb';
import { DatabaseConnection } from '../types/database.types';

export class MongoDBAdapter extends DatabaseAdapter {
    declare readonly type: 'mongodb';
    readonly capabilities: DatabaseCapabilities = {
        transactions: true,
        preparedStatements: false,
        storedProcedures: false,
        bulkInsert: true,
        streaming: true,
        savepoints: false,
        schemas: true,
        json: true,
        arrays: true
    };

    private client: mongodb.MongoClient | null = null;
    private db: mongodb.Db | null = null;
    private connectionUrl: string = '';
    private dbName: string = '';
    private session: mongodb.ClientSession | null = null;
    private collections: Map<string, mongodb.Collection> = new Map();
    private connectionOptions: mongodb.MongoClientOptions = {};
    private healthCheckInterval: NodeJS.Timer | null = null;
    private lastHealthCheck: Date = new Date();
    private isHealthy: boolean = true;
    private aggregationPipelines: Map<string, any[]> = new Map();

    async connect(config: DatabaseConfig): Promise<DatabaseConnection> {
        try {
            ActionLogger.logInfo('Database connection initiated', { 
                operation: 'connect',
                database: 'mongodb',
                host: config.host,
                dbName: config.database
            });

            // Build connection URL
            this.connectionUrl = this.buildConnectionUrl(config);
            this.dbName = config.database;

            // Configure connection options
            this.connectionOptions = {
                maxPoolSize: config.connectionPoolSize || 10,
                minPoolSize: 2,
                maxIdleTimeMS: 30000,
                waitQueueTimeoutMS: config.connectionTimeout || 30000,
                connectTimeoutMS: config.connectionTimeout || 30000,
                socketTimeoutMS: config.queryTimeout || 60000,
                serverSelectionTimeoutMS: 30000,
                directConnection: false,
                appName: 'CS Test Automation Framework',
                retryWrites: true,
                retryReads: true,
                readPreference: 'primaryPreferred',
                w: 'majority',
                journal: true,
                ...this.buildAuthOptions(config),
                ...this.buildSSLOptions(config)
            };

            // Connect to MongoDB
            this.client = new mongodb.MongoClient(this.connectionUrl, this.connectionOptions);
            await this.client.connect();

            // Select database
            this.db = this.client.db(this.dbName);

            // Test connection
            await this.db.admin().ping();

            // Start health monitoring
            this.startHealthMonitoring();

            // Cache commonly used collections
            await this.cacheCollections();

            logger.info(`Successfully connected to MongoDB: ${config.host}/${config.database}`);
            ActionLogger.logInfo('Database connected successfully', { database: 'mongodb' });
            
            // Create and return DatabaseConnection
            const connection: DatabaseConnection = {
                id: `mongodb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'mongodb',
                instance: this.client,
                config,
                connected: true,
                lastActivity: new Date(),
                inTransaction: false,
                transactionLevel: 0,
                savepoints: []
            };
            
            return connection;

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'connect', config);
            ActionLogger.logError('Database connection failed', enhancedError);
            throw enhancedError;
        }
    }

    async disconnect(_connection: DatabaseConnection): Promise<void> {
        try {
            ActionLogger.logInfo('Database disconnection initiated', { database: 'mongodb' });

            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval as unknown as number);
                this.healthCheckInterval = null;
            }

            // Close active session
            if (this.session && !this.session.hasEnded) {
                await this.session.endSession();
            }

            // Clear collections cache
            this.collections.clear();
            this.aggregationPipelines.clear();

            // Close connection
            if (this.client) {
                await this.client.close();
                this.client = null;
                this.db = null;
            }

            logger.info('Disconnected from MongoDB');
            ActionLogger.logInfo('Database disconnected successfully', { database: 'mongodb' });

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'disconnect');
            ActionLogger.logError('Database disconnection failed', enhancedError);
            throw enhancedError;
        }
    }

    async query(_connection: DatabaseConnection, query: string, params?: any[], options?: QueryOptions): Promise<QueryResult> {
        const startTime = Date.now();
        
        try {
            this.validateConnectionInternal();
            ActionLogger.logInfo('Executing database query', { database: 'mongodb', query, params });

            // MongoDB uses a different query structure - parse the command
            const command = this.parseMongoCommand(query);
            let result: any;
            
            switch (command.operation) {
                case 'find':
                    result = await this.executeFind(command, params || undefined, options || undefined);
                    break;
                case 'insert':
                    result = await this.executeInsert(command, params || undefined, options || undefined);
                    break;
                case 'update':
                    result = await this.executeUpdate(command, params || undefined, options || undefined);
                    break;
                case 'delete':
                    result = await this.executeDelete(command, params || undefined, options || undefined);
                    break;
                case 'aggregate':
                    result = await this.executeAggregate(command, params || undefined, options || undefined);
                    break;
                case 'createIndex':
                    result = await this.executeCreateIndex(command, params);
                    break;
                case 'dropCollection':
                    result = await this.executeDropCollection(command);
                    break;
                case 'runCommand':
                    result = await this.executeRunCommand(command, params);
                    break;
                default:
                    throw new Error(`Unsupported MongoDB operation: ${command.operation}`);
            }

            const duration = Date.now() - startTime;
            ActionLogger.logInfo('Database query completed', { database: 'mongodb', duration, rowCount: result.rowCount });

            return result;

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'execute', { query, params });
            ActionLogger.logError('Database query failed', enhancedError);
            throw enhancedError;
        }
    }

    async beginTransaction(_connection: DatabaseConnection, options?: TransactionOptions): Promise<void> {
        try {
            this.validateConnectionInternal();
            ActionLogger.logInfo('Beginning database transaction', { database: 'mongodb' });

            if (this.session && !this.session.hasEnded) {
                throw new Error('Transaction already in progress');
            }

            // Start a client session
            this.session = this.client!.startSession();

            // Configure transaction options
            const transactionOptions: mongodb.TransactionOptions = {
                readConcern: { level: 'snapshot' as ReadConcernLevel },
                writeConcern: { w: 'majority', j: true },
                readPreference: 'primary',
                maxCommitTimeMS: options?.timeout || 60000
            };

            // Start transaction
            this.session.startTransaction(transactionOptions);

            logger.debug('MongoDB transaction started');
            ActionLogger.logInfo('Database transaction started', { database: 'mongodb' });

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'beginTransaction');
            ActionLogger.logError('Failed to begin transaction', enhancedError);
            throw enhancedError;
        }
    }

    async commitTransaction(_connection: DatabaseConnection): Promise<void> {
        try {
            ActionLogger.logInfo('Committing database transaction', { database: 'mongodb' });

            if (!this.session || this.session.hasEnded) {
                throw new Error('No active transaction to commit');
            }

            await this.session.commitTransaction();
            await this.session.endSession();
            this.session = null;

            logger.debug('MongoDB transaction committed');
            ActionLogger.logInfo('Database transaction committed', { database: 'mongodb' });

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'commit');
            ActionLogger.logError('Failed to commit transaction', enhancedError);
            throw enhancedError;
        }
    }

    async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
        try {
            ActionLogger.logInfo('Rolling back database transaction', { database: 'mongodb' });

            if (!this.session || this.session.hasEnded) {
                logger.warn('No active transaction to rollback');
                return;
            }

            await this.session.abortTransaction();
            await this.session.endSession();
            this.session = null;

            logger.debug('MongoDB transaction rolled back');
            ActionLogger.logInfo('Database transaction rolled back', { database: 'mongodb' });

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'rollback');
            ActionLogger.logError('Failed to rollback transaction', enhancedError);
            throw enhancedError;
        }
    }

    async prepare(connection: DatabaseConnection, query: string): Promise<PreparedStatement> {
        // MongoDB doesn't support traditional prepared statements
        // We'll simulate it by pre-parsing and validating the query
        try {
            this.parseMongoCommand(query); // Validate the query
            const id = `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const preparedStatement: PreparedStatement = {
                id,
                query,
                paramCount: this.countParameters(query),
                execute: async (params?: any[]) => {
                    return await this.query(connection, query, params);
                },
                close: async () => {
                    // No-op for MongoDB
                    logger.debug(`Closed prepared statement: ${id}`);
                }
            };

            logger.debug(`Created simulated prepared statement for MongoDB: ${id}`);
            return preparedStatement;

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'prepareStatement', { query });
            throw enhancedError;
        }
    }

    async executeBulkInsert(
        _connection: DatabaseConnection,
        table: string,
        columns: string[],
        values: any[][],
        options?: BulkInsertOptions
    ): Promise<QueryResult> {
        const startTime = Date.now();
        
        try {
            this.validateConnectionInternal();
            ActionLogger.logInfo('Executing bulk insert', { 
                database: 'mongodb',
                collection: table, 
                documentCount: values.length 
            });

            const collection = this.db!.collection(table);
            const documents = values.map(row => {
                const doc: any = {};
                columns.forEach((col, index) => {
                    doc[col] = row[index];
                });
                return doc;
            });

            // Configure bulk write options
            const bulkOptions: any = {
                ordered: options?.ordered !== false
            };
            
            if (this.session) {
                bulkOptions.session = this.session;
            }
            
            if (options?.skipValidation) {
                bulkOptions.bypassDocumentValidation = options.skipValidation;
            }

            // Use insertMany for bulk insert
            const result = await collection.insertMany(documents, bulkOptions);

            const duration = Date.now() - startTime;
            const queryResult: QueryResult = {
                rows: [],
                rowCount: result.insertedCount,
                fields: [],
                command: 'INSERT',
                duration,
                insertedIds: Object.values(result.insertedIds)
            };

            ActionLogger.logInfo('Bulk insert completed', { database: 'mongodb', duration, insertedCount: result.insertedCount });
            return queryResult;

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'bulkInsert', { 
                collection: table, 
                documentCount: values.length 
            });
            ActionLogger.logError('Bulk insert failed', enhancedError);
            throw enhancedError;
        }
    }

    async getConnectionHealth(): Promise<ConnectionHealth> {
        try {
            if (!this.client || !this.db) {
                return {
                    isHealthy: false,
                    lastCheck: new Date(),
                    latency: -1,
                    error: 'Not connected',
                    details: { status: 'disconnected' }
                };
            }

            const startTime = Date.now();
            const adminDb = this.db.admin();
            await adminDb.ping();
            const latency = Date.now() - startTime;

            // Get server status
            const serverStatus = await adminDb.serverStatus();
            
            // Get replica set status if applicable
            let replicaSetStatus = null;
            try {
                replicaSetStatus = await adminDb.replSetGetStatus();
            } catch {
                // Not a replica set
            }

            const health: ConnectionHealth = {
                isHealthy: true,
                lastCheck: new Date(),
                latency,
                activeConnections: serverStatus['connections']?.['current'] || 0,
                totalConnections: serverStatus['connections']?.['totalCreated'] || 0,
                details: {
                    version: serverStatus['version'],
                    uptime: serverStatus['uptime'],
                    replicaSet: replicaSetStatus?.['set'],
                    primaryHost: replicaSetStatus?.['members']?.find((m: any) => m.stateStr === 'PRIMARY')?.['name'],
                    operations: {
                        insert: serverStatus['opcounters']?.['insert'] || 0,
                        query: serverStatus['opcounters']?.['query'] || 0,
                        update: serverStatus['opcounters']?.['update'] || 0,
                        delete: serverStatus['opcounters']?.['delete'] || 0
                    }
                }
            };

            this.lastHealthCheck = new Date();
            this.isHealthy = true;
            return health;

        } catch (error) {
            this.isHealthy = false;
            return {
                isHealthy: false,
                lastCheck: new Date(),
                latency: -1,
                error: (error as Error).message,
                details: { error: error }
            };
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            if (!this.client || !this.db) {
                return false;
            }

            await this.db.admin().ping();
            return true;

        } catch {
            return false;
        }
    }

    async executeStoredProcedure(_connection: DatabaseConnection, name: string, params?: any[], _options?: QueryOptions): Promise<QueryResult> {
        // MongoDB doesn't have traditional stored procedures
        // We can execute server-side JavaScript functions
        const startTime = Date.now();
        
        try {
            this.validateConnectionInternal();
            ActionLogger.logInfo('Executing stored procedure', { database: 'mongodb', name, params });

            // Check if it's a system function
            const systemFunctions: Record<string, any> = {
                'compact': async () => await this.db!.command({ compact: params?.[0] }),
                'reIndex': async () => await this.db!.collection(params?.[0]).indexes(),
                'validate': async () => await this.db!.command({ validate: params?.[0] }),
                'getIndexes': async () => await this.db!.collection(params?.[0]).indexes(),
                'currentOp': async () => await this.db!.admin().command({ currentOp: 1 }),
                'killOp': async () => await this.db!.admin().command({ killOp: 1, op: params?.[0] })
            };

            let result: any;
            if (systemFunctions[name]) {
                result = await systemFunctions[name]();
            } else {
                // Execute as a database command
                const command: any = { [name]: 1 };
                if (params && params.length > 0) {
                    Object.assign(command, params[0]);
                }
                result = await this.db!.command(command);
            }

            const duration = Date.now() - startTime;
            const queryResult: QueryResult = {
                rows: [result],
                rowCount: 1,
                fields: Object.keys(result).map(key => ({
                    name: key,
                    dataType: typeof result[key]
                })),
                command: 'CALL',
                duration
            };

            ActionLogger.logInfo('Stored procedure completed', { database: 'mongodb', duration });
            return queryResult;

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'executeStoredProcedure', { name, params });
            ActionLogger.logError('Stored procedure failed', enhancedError);
            throw enhancedError;
        }
    }

    async executeFunction(_connection: DatabaseConnection, name: string, params?: any[], _options?: QueryOptions): Promise<any> {
        // MongoDB doesn't have traditional functions
        // We'll use aggregation pipeline functions
        const startTime = Date.now();
        
        try {
            this.validateConnectionInternal();
            ActionLogger.logInfo('Executing function', { database: 'mongodb', name, params });

            // Map common function names to MongoDB operations
            const functionMap: Record<string, any> = {
                'count': async () => {
                    const collection = params?.[0] || 'test';
                    const filter = params?.[1] || {};
                    return await this.db!.collection(collection).countDocuments(filter);
                },
                'distinct': async () => {
                    const collection = params?.[0];
                    const field = params?.[1];
                    const filter = params?.[2] || {};
                    return await this.db!.collection(collection).distinct(field, filter);
                },
                'stats': async () => {
                    const collection = params?.[0];
                    const collectionRef = this.db!.collection(collection);
                    const stats = await collectionRef.estimatedDocumentCount();
                    const size = await collectionRef.aggregate([{$collStats: {storageStats: {}}}]).toArray();
                    return { count: stats, ...size[0] };
                },
                'explain': async () => {
                    const collection = params?.[0];
                    const query = params?.[1] || {};
                    return await this.db!.collection(collection).find(query).explain();
                }
            };

            let result: any;
            if (functionMap[name]) {
                result = await functionMap[name]();
            } else {
                // Try to execute as a database function
                const evalCommand = {
                    eval: name,
                    args: params || []
                };
                result = await this.db!.command(evalCommand);
            }

            const duration = Date.now() - startTime;
            ActionLogger.logInfo('Function execution completed', { database: 'mongodb', duration });
            return result;

        } catch (error) {
            const enhancedError = this.enhanceError(error as Error, 'executeFunction', { name, params });
            ActionLogger.logError('Function execution failed', enhancedError);
            throw enhancedError;
        }
    }

    getConnectionInfo(_connection: DatabaseConnection): any {
        if (!this.client) {
            return null;
        }

        return {
            type: this.type,
            database: this.dbName,
            options: this.connectionOptions,
            topology: (this.client as any)['topology']?.['description'],
            isConnected: (this.client as any)['topology']?.['isConnected']?.() || false,
            lastHealthCheck: this.lastHealthCheck,
            isHealthy: this.isHealthy
        };
    }

    // Private helper methods

    private buildConnectionUrl(config: DatabaseConfig): string {
        const protocol = config.ssl ? 'mongodb+srv' : 'mongodb';
        const auth = config.username ? `${config.username}:${encodeURIComponent(config.password || '')}@` : '';
        const port = config.port || 27017;
        
        // Handle replica set or single host
        let hosts = config.host;
        if (config.additionalOptions?.['replicaSet']) {
            // Parse comma-separated hosts for replica set
            const hostList = config.host.split(',').map(h => h.trim());
            hosts = hostList.join(',');
        }

        let url = `${protocol}://${auth}${hosts}`;
        
        // Add port only if not using SRV
        if (protocol === 'mongodb' && !hosts.includes(':')) {
            url += `:${port}`;
        }

        // Add database name
        url += `/${config.database}`;

        // Add connection options
        const options: string[] = [];
        if (config.additionalOptions?.['replicaSet']) {
            options.push(`replicaSet=${config.additionalOptions['replicaSet']}`);
        }
        if (config.additionalOptions?.['authSource']) {
            options.push(`authSource=${config.additionalOptions['authSource']}`);
        }
        if (config.ssl) {
            options.push('tls=true');
        }

        if (options.length > 0) {
            url += `?${options.join('&')}`;
        }

        return url;
    }

    private buildAuthOptions(config: DatabaseConfig): any {
        const options: any = {};

        if (config.additionalOptions?.['authMechanism']) {
            options.authMechanism = config.additionalOptions['authMechanism'];
            
            if (config.additionalOptions?.['authMechanismProperties']) {
                options.authMechanismProperties = config.additionalOptions['authMechanismProperties'];
            }
        }

        return options;
    }

    private buildSSLOptions(config: DatabaseConfig): any {
        if (!config.ssl) {
            return {};
        }

        const options: any = {
            tls: true,
            tlsAllowInvalidCertificates: config.sslOptions?.rejectUnauthorized === false,
            tlsAllowInvalidHostnames: config.sslOptions?.checkServerIdentity === false
        };

        if (config.sslOptions?.ca) {
            options.tlsCAFile = config.sslOptions.ca;
        }
        if (config.sslOptions?.cert) {
            options.tlsCertificateFile = config.sslOptions.cert;
        }
        if (config.sslOptions?.key) {
            options.tlsCertificateKeyFile = config.sslOptions.key;
        }

        return options;
    }

    private async cacheCollections(): Promise<void> {
        try {
            const collections = await this.db!.listCollections().toArray();
            
            for (const collInfo of collections) {
                const collection = this.db!.collection(collInfo.name);
                this.collections.set(collInfo.name, collection);
            }

            logger.debug(`Cached ${collections.length} MongoDB collections`);
        } catch (error) {
            logger.warn('Failed to cache collections:', error as Error | Record<string, any>);
        }
    }

    private startHealthMonitoring(): void {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.getConnectionHealth();
            } catch (error) {
                logger.error('Health check failed:', error as Error | Record<string, any>);
                this.isHealthy = false;
            }
        }, 30000); // Check every 30 seconds
    }

    private validateConnectionInternal(): void {
        if (!this.client || !this.db) {
            throw new Error('Not connected to MongoDB');
        }

        if (!this.isHealthy) {
            throw new Error('MongoDB connection is unhealthy');
        }
    }
    
    protected override validateConnection(connection: DatabaseConnection): void {
        super.validateConnection(connection);
        this.validateConnectionInternal();
    }

    private parseMongoCommand(query: string): any {
        // Parse MongoDB-style commands
        // Examples:
        // db.collection.find({name: "test"})
        // db.collection.insertOne({name: "test"})
        // db.collection.updateMany({}, {$set: {status: "active"}})
        
        const trimmedQuery = query.trim();
        
        // Check for direct JSON commands
        if (trimmedQuery.startsWith('{')) {
            try {
                return JSON.parse(trimmedQuery);
            } catch {
                // Fall through to other parsing
            }
        }

        // Parse db.collection.method() syntax
        const dbPattern = /^db\.(\w+)\.(\w+)\(([\s\S]*)\)$/;
        const match = trimmedQuery.match(dbPattern);
        
        if (match) {
            const [, collection, method, args] = match;
            try {
                // Parse arguments - handle both JSON and JavaScript object notation
                const parsedArgs = this.parseArguments(args || '');
                return {
                    operation: this.mapMethodToOperation(method || ''),
                    collection,
                    method,
                    args: parsedArgs
                };
            } catch (error) {
                logger.warn(`Failed to parse MongoDB command: ${query}`, error as Record<string, any>);
            }
        }

        // Try to infer operation from keywords
        const upperQuery = trimmedQuery.toUpperCase();
        if (upperQuery.includes('FIND') || upperQuery.includes('SELECT')) {
            return { operation: 'find', query: trimmedQuery };
        } else if (upperQuery.includes('INSERT')) {
            return { operation: 'insert', query: trimmedQuery };
        } else if (upperQuery.includes('UPDATE')) {
            return { operation: 'update', query: trimmedQuery };
        } else if (upperQuery.includes('DELETE') || upperQuery.includes('REMOVE')) {
            return { operation: 'delete', query: trimmedQuery };
        } else if (upperQuery.includes('AGGREGATE')) {
            return { operation: 'aggregate', query: trimmedQuery };
        } else if (upperQuery.includes('CREATE INDEX')) {
            return { operation: 'createIndex', query: trimmedQuery };
        } else if (upperQuery.includes('DROP')) {
            return { operation: 'dropCollection', query: trimmedQuery };
        }

        return { operation: 'runCommand', query: trimmedQuery };
    }

    private mapMethodToOperation(method: string): string {
        const methodMap: Record<string, string> = {
            'find': 'find',
            'findOne': 'find',
            'findOneAndUpdate': 'update',
            'findOneAndDelete': 'delete',
            'findOneAndReplace': 'update',
            'insertOne': 'insert',
            'insertMany': 'insert',
            'updateOne': 'update',
            'updateMany': 'update',
            'replaceOne': 'update',
            'deleteOne': 'delete',
            'deleteMany': 'delete',
            'aggregate': 'aggregate',
            'count': 'find',
            'countDocuments': 'find',
            'distinct': 'find',
            'createIndex': 'createIndex',
            'dropIndex': 'dropIndex',
            'drop': 'dropCollection'
        };

        return methodMap[method] || 'runCommand';
    }

    private parseArguments(argsString: string): any[] {
        if (!argsString.trim()) {
            return [];
        }

        try {
            // Use Function constructor to safely evaluate JavaScript-style object notation
            const func = new Function('return [' + argsString + ']');
            return func();
        } catch {
            // Try JSON parsing
            try {
                return JSON.parse('[' + argsString + ']');
            } catch {
                // Return as string if parsing fails
                return [argsString];
            }
        }
    }

    private async executeFind(command: any, params?: any[], options?: QueryOptions): Promise<QueryResult> {
        const collection = this.getCollection(command.collection);
        const args = command.args || [];
        const filter = args[0] || {};
        const projection = args[1];
        
        // Apply parameters if provided
        const processedFilter = this.applyParameters(filter, params);

        const findOptions: mongodb.FindOptions = {};
        if (this.session) {
            findOptions.session = this.session;
        }
        if (projection) {
            findOptions.projection = projection;
        }
        
        let cursor = collection.find(processedFilter, findOptions);

        // Apply options
        if (options?.limit) {
            cursor = cursor.limit(options.limit);
        }
        if (options?.offset) {
            cursor = cursor.skip(options.offset);
        }
        if (options?.sort) {
            cursor = cursor.sort(options.sort);
        }

        const documents = await cursor.toArray();
        const fields = documents.length > 0 && documents[0] ? 
            Object.keys(documents[0]).map(key => ({ name: key, dataType: 'any' })) : [];

        return {
            rows: documents,
            rowCount: documents.length,
            fields,
            command: 'SELECT',
            duration: 0
        };
    }

    private async executeInsert(command: any, params?: any[], _options?: QueryOptions): Promise<QueryResult> {
        const collection = this.getCollection(command.collection);
        const args = command.args || [];
        let documents = args[0];

        // Apply parameters if provided
        documents = this.applyParameters(documents, params);

        // Ensure documents is an array
        if (!Array.isArray(documents)) {
            documents = [documents];
        }

        const insertOptions: any = {};
        if (this.session) {
            insertOptions.session = this.session;
        }
        
        let insertResult: QueryResult;
        
        if (command.method === 'insertOne') {
            const result = await collection.insertOne(documents[0], insertOptions);
            insertResult = {
                rows: [],
                rowCount: 1,
                fields: [],
                command: 'INSERT',
                duration: 0,
                insertedIds: [result.insertedId]
            };
        } else {
            const result = await collection.insertMany(documents, insertOptions);
            insertResult = {
                rows: [],
                rowCount: result.insertedCount,
                fields: [],
                command: 'INSERT',
                duration: 0,
                insertedIds: Object.values(result.insertedIds)
            };
        }
        
        return insertResult;
    }

    private async executeUpdate(command: any, params?: any[], _options?: QueryOptions): Promise<QueryResult> {
        const collection = this.getCollection(command.collection);
        const args = command.args || [];
        const filter = this.applyParameters(args[0] || {}, params);
        const update = this.applyParameters(args[1] || {}, params);
        const updateOptions = args[2] || {};

        const mergedOptions: any = { ...updateOptions };
        if (this.session) {
            mergedOptions.session = this.session;
        }
        
        const result = command.method === 'updateOne' ?
            await collection.updateOne(filter, update, mergedOptions) :
            await collection.updateMany(filter, update, mergedOptions);

        return {
            rows: [],
            rowCount: result.modifiedCount,
            fields: [],
            command: 'UPDATE',
            duration: 0,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId
        };
    }

    private async executeDelete(command: any, params?: any[], _options?: QueryOptions): Promise<QueryResult> {
        const collection = this.getCollection(command.collection);
        const args = command.args || [];
        const filter = this.applyParameters(args[0] || {}, params);

        const deleteOptions: any = {};
        if (this.session) {
            deleteOptions.session = this.session;
        }
        
        const result = command.method === 'deleteOne' ?
            await collection.deleteOne(filter, deleteOptions) :
            await collection.deleteMany(filter, deleteOptions);

        return {
            rows: [],
            rowCount: result.deletedCount,
            fields: [],
            command: 'DELETE',
            duration: 0
        };
    }

    private async executeAggregate(command: any, params?: any[], _options?: QueryOptions): Promise<QueryResult> {
        const collection = this.getCollection(command.collection);
        const pipeline = this.applyParameters(command.args[0] || [], params);

        const aggregateOptions: any = { allowDiskUse: true };
        if (this.session) {
            aggregateOptions.session = this.session;
        }
        
        const cursor = collection.aggregate(pipeline, aggregateOptions);

        const documents = await cursor.toArray();
        const fields = documents.length > 0 && documents[0] ? 
            Object.keys(documents[0]).map(key => ({ name: key, dataType: 'any' })) : [];

        return {
            rows: documents,
            rowCount: documents.length,
            fields,
            command: 'SELECT',
            duration: 0
        };
    }

    private async executeCreateIndex(command: any, params?: any[]): Promise<QueryResult> {
        const collection = this.getCollection(command.collection);
        const args = command.args || [];
        const keys = this.applyParameters(args[0] || {}, params);
        const options = args[1] || {};

        const indexName = await collection.createIndex(keys, options);

        return {
            rows: [{ indexName }],
            rowCount: 1,
            fields: [{ name: 'indexName', dataType: 'string' }],
            command: 'CREATE',
            duration: 0
        };
    }

    private async executeDropCollection(command: any): Promise<QueryResult> {
        const result = await this.db!.dropCollection(command.collection);

        return {
            rows: [{ dropped: result }],
            rowCount: 1,
            fields: [{ name: 'dropped', dataType: 'boolean' }],
            command: 'DROP',
            duration: 0
        };
    }

    private async executeRunCommand(command: any, params?: any[]): Promise<QueryResult> {
        let dbCommand: any;
        
        if (typeof command.query === 'string') {
            try {
                dbCommand = JSON.parse(command.query);
            } catch {
                dbCommand = { eval: command.query };
            }
        } else {
            dbCommand = command.query;
        }

        dbCommand = this.applyParameters(dbCommand, params);
        const result = await this.db!.command(dbCommand);

        return {
            rows: [result],
            rowCount: 1,
            fields: Object.keys(result).map(key => ({ name: key, dataType: 'any' })),
            command: 'COMMAND',
            duration: 0
        };
    }

    private getCollection(name: string): mongodb.Collection {
        if (this.collections.has(name)) {
            return this.collections.get(name)!;
        }

        const collection = this.db!.collection(name);
        this.collections.set(name, collection);
        return collection;
    }

    private applyParameters(obj: any, params?: any[]): any {
        if (!params || params.length === 0) {
            return obj;
        }

        // Convert string representation to actual object with parameter substitution
        let str = JSON.stringify(obj);
        
        // Replace $1, $2, etc. with actual parameter values
        params.forEach((param, index) => {
            const placeholder = `$${index + 1}`;
            const value = JSON.stringify(param);
            str = str.replace(new RegExp(`"\\${placeholder}"`, 'g'), value);
        });

        return JSON.parse(str);
    }

    private countParameters(query: string): number {
        const matches = query.match(/\$\d+/g);
        return matches ? new Set(matches).size : 0;
    }

    private enhanceError(error: Error, operation: string, context?: any): Error {
        const enhancedError = new Error(`MongoDB ${operation} failed: ${error.message}`);
        enhancedError.name = 'MongoDBError';
        
        // Add context
        (enhancedError as any).context = {
            operation,
            database: this.dbName,
            ...context
        };

        // Add specific error codes and solutions
        if (error.message.includes('connection')) {
            (enhancedError as any).code = 'CONNECTION_ERROR';
            (enhancedError as any).solution = 'Check MongoDB connection settings and ensure the server is running';
        } else if (error.message.includes('authentication')) {
            (enhancedError as any).code = 'AUTH_ERROR';
            (enhancedError as any).solution = 'Verify username, password, and authentication mechanism';
        } else if (error.message.includes('timeout')) {
            (enhancedError as any).code = 'TIMEOUT_ERROR';
            (enhancedError as any).solution = 'Increase timeout settings or optimize the query';
        } else if (error.message.includes('duplicate key')) {
            (enhancedError as any).code = 'DUPLICATE_KEY';
            (enhancedError as any).solution = 'Ensure unique values for indexed fields';
        }

        return enhancedError;
    }

    /**
     * Create savepoint (not supported in MongoDB)
     */
    async createSavepoint(connection: DatabaseConnection, name: string): Promise<void> {
        logger.warn('Savepoints are not supported in MongoDB');
        // MongoDB doesn't support savepoints, but we can track them for compatibility
        if (!connection.savepoints.includes(name)) {
            connection.savepoints.push(name);
        }
    }

    /**
     * Release savepoint (not supported in MongoDB)
     */
    async releaseSavepoint(connection: DatabaseConnection, name: string): Promise<void> {
        logger.warn('Savepoints are not supported in MongoDB');
        // Remove from tracking
        const index = connection.savepoints.indexOf(name);
        if (index > -1) {
            connection.savepoints.splice(index, 1);
        }
    }

    /**
     * Rollback to savepoint (not supported in MongoDB)
     */
    async rollbackToSavepoint(_connection: DatabaseConnection, _name: string): Promise<void> {
        throw new Error('Savepoints are not supported in MongoDB. Use transactions instead.');
    }

    /**
     * Execute prepared statement
     */
    async executePrepared(statement: PreparedStatement, params?: any[]): Promise<QueryResult> {
        return statement.execute(params);
    }

    /**
     * Ping connection
     */
    async ping(connection: DatabaseConnection): Promise<void> {
        if (!this.client || !this.db) {
            throw new Error('Not connected to MongoDB');
        }

        await this.db.admin().ping();
        connection.lastActivity = new Date();
    }

    /**
     * Get database metadata
     */
    async getMetadata(connection: DatabaseConnection): Promise<DatabaseMetadata> {
        if (!this.client || !this.db) {
            throw new Error('Not connected to MongoDB');
        }

        const adminDb = this.db.admin();
        const buildInfo = await adminDb.command({ buildInfo: 1 });
        const serverStatus = await adminDb.serverStatus();
        const listDatabases = await adminDb.listDatabases();

        return {
            version: buildInfo['version'],
            databaseName: this.dbName,
            serverType: 'MongoDB',
            capabilities: this.capabilities,
            characterSet: 'UTF-8',
            collation: 'utf8_general_ci',
            timezone: serverStatus['localTime'] ? new Date(serverStatus['localTime']).toTimeString() : 'UTC',
            currentUser: connection.config.username || 'anonymous',
            currentSchema: this.dbName,
            schemas: listDatabases.databases.map((db: any) => db.name)
        };
    }

    /**
     * Get table (collection) information
     */
    async getTableInfo(_connection: DatabaseConnection, tableName: string): Promise<TableInfo> {
        if (!this.db) {
            throw new Error('Not connected to MongoDB');
        }

        const collection = this.db.collection(tableName);
        // Get collection statistics using aggregation
        const statsResult = await collection.aggregate([
            { $collStats: { storageStats: {} } }
        ]).toArray();
        const stats = statsResult[0] || { storageStats: { count: 0, size: 0 } };
        const indexes = await collection.indexes();
        
        // Get sample document to infer schema
        const sampleDoc = await collection.findOne();
        const columns: ColumnInfo[] = [];

        if (sampleDoc) {
            let position = 1;
            for (const [key, value] of Object.entries(sampleDoc)) {
                columns.push({
                    name: key,
                    ordinalPosition: position++,
                    dataType: this.getMongoDataType(value),
                    nativeDataType: typeof value,
                    nullable: true,
                    isPrimaryKey: key === '_id',
                    isUnique: indexes.some(idx => idx.key[key] && idx.unique),
                    isAutoIncrement: false,
                    comment: `MongoDB field: ${key}`
                });
            }
        }

        return {
            name: tableName,
            type: 'table',
            columns,
            primaryKey: {
                name: '_id',
                columns: ['_id']
            },
            indexes: indexes.map(idx => ({
                name: idx.name || `${tableName}_idx_${Object.keys(idx.key).join('_')}`,
                table: tableName,
                columns: Object.keys(idx.key),
                unique: idx.unique || false,
                type: 'btree' as const
            })),
            rowCount: stats['storageStats']?.count || 0,
            size: stats['storageStats']?.size || 0,
            created: new Date(),
            modified: new Date(),
            comment: `MongoDB collection: ${tableName}`,
            engine: 'WiredTiger'
        };
    }

    /**
     * Bulk insert (simplified version)
     */
    async bulkInsert(
        _connection: DatabaseConnection,
        table: string,
        data: any[]
    ): Promise<number> {
        if (!this.db) {
            throw new Error('Not connected to MongoDB');
        }

        const collection = this.db.collection(table);
        const insertOptions: any = {};
        if (this.session) {
            insertOptions.session = this.session;
        }
        
        const result = await collection.insertMany(data, insertOptions);

        return result.insertedCount;
    }

    /**
     * Get MongoDB data type name
     */
    private getMongoDataType(value: any): string {
        if (value === null) return 'null';
        if (value instanceof Date) return 'Date';
        if (value instanceof mongodb.ObjectId) return 'ObjectId';
        if (value instanceof mongodb.Binary) return 'Binary';
        if (Array.isArray(value)) return 'Array';
        if (typeof value === 'object') return 'Object';
        return typeof value;
    }
}