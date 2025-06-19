// src/database/types/database.types.ts

/**
 * Database connection interface
 */
export interface DatabaseConnection {
    id: string;
    type: 'sqlserver' | 'mysql' | 'postgresql' | 'oracle' | 'mongodb' | 'redis';
    instance: any; // The actual database connection object
    config: DatabaseConfig;
    connected: boolean;
    lastActivity: Date;
    inTransaction: boolean;
    transactionLevel: number;
    savepoints: string[];
    sessionOptions?: SessionOptions;
}

/**
 * Database types
 */
export type DatabaseType = 'sqlserver' | 'mysql' | 'postgresql' | 'oracle' | 'mongodb' | 'redis';

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
    type: DatabaseType;
    host: string;
    port?: number;
    database: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    sslOptions?: {
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
        checkServerIdentity?: boolean;
    };
    connectionTimeout?: number;
    queryTimeout?: number;
    connectionPoolSize?: number;
    poolSize?: number; // Alternative to connectionPoolSize
    poolMin?: number;
    poolMax?: number;
    poolAcquireTimeout?: number;
    poolIdleTimeout?: number;
    poolValidateOnBorrow?: boolean;
    poolTestOnBorrow?: boolean;
    connectionString?: string; // For connection string based connections
    sessionParameters?: Record<string, any>; // Session-specific parameters
    options?: Record<string, any>; // Additional options
    additionalOptions?: Record<string, any>;
}

/**
 * Query result interface
 */
export interface QueryResult {
    rows: any[];
    rowCount: number;
    fields: Array<{
        name: string;
        dataType: string;
        nullable?: boolean;
        length?: number;
        precision?: number;
        scale?: number;
    }>;
    command: string;
    duration: number;
    insertedIds?: any[];
    affectedRows?: number;
    changedRows?: number;
    lastInsertId?: any;
    [key: string]: any; // Allow additional database-specific properties
}

/**
 * Prepared statement interface
 */
export interface PreparedStatement {
    id: string;
    query: string;
    paramCount: number;
    execute: (params?: any[]) => Promise<QueryResult>;
    close: () => Promise<void>;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
    isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' | 'SNAPSHOT';
    timeout?: number;
    retryOnDeadlock?: boolean;
    maxRetries?: number;
}

/**
 * Transaction state
 */
export interface TransactionState {
    level: number;
    savepoint?: string;
    startTime: number;
    isolationLevel?: string;
    savepoints?: Array<{
        name: string;
        createdAt: number;
    }>;
}

/**
 * Bulk insert options
 */
export interface BulkInsertOptions {
    batchSize?: number;
    ordered?: boolean;
    skipValidation?: boolean;
    continueOnError?: boolean;
    timeout?: number;
    ttl?: number; // For Redis
}

/**
 * Result metadata interface
 */
export interface ResultMetadata {
    name: string;
    type: string;
    nullable?: boolean;
    length?: number;
    precision?: number;
    scale?: number;
}

/**
 * Result set interface for database query results
 */
export interface ResultSet {
    rows: any[];
    fields: Array<{
        name: string;
        dataType: string;
        nullable?: boolean;
        length?: number;
        precision?: number;
        scale?: number;
    }>;
    rowCount: number;
    metadata?: any;
    columns?: ResultMetadata[];
    executionTime?: number;
    affectedRows?: number;
}

/**
 * Bulk operation interface
 */
export interface BulkOperation {
    sql: string;
    params?: any[];
    options?: QueryOptions;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
    min: number;
    max: number;
    acquireTimeout: number;
    idleTimeout: number;
    connectionTimeout: number;
    validateOnBorrow: boolean;
    testOnBorrow: boolean;
}

/**
 * Connection pool statistics
 */
export interface ConnectionStats {
    total: number;
    active: number;
    idle: number;
    waiting: number;
    size?: number;
    available?: number;
    borrowed?: number;
    pending?: number;
    max: number;
    min: number;
}

/**
 * Database capabilities
 */
export interface DatabaseCapabilities {
    transactions: boolean;
    preparedStatements: boolean;
    storedProcedures: boolean;
    bulkInsert: boolean;
    streaming: boolean;
    savepoints: boolean;
    schemas: boolean;
    json: boolean;
    arrays: boolean;
}

/**
 * Connection health information
 */
export interface ConnectionHealth {
    isHealthy: boolean;
    lastCheck: Date;
    latency: number;
    activeConnections?: number;
    totalConnections?: number;
    error?: string;
    details?: Record<string, any>;
}

/**
 * Query options
 */
export interface QueryOptions {
    timeout?: number;
    fetchSize?: number;
    maxRows?: number;
    offset?: number;
    limit?: number;
    sort?: Record<string, 1 | -1>; // For MongoDB
    projection?: Record<string, 0 | 1>; // For MongoDB
    explain?: boolean;
    stream?: boolean;
    retry?: {
        count?: number;
        delay?: number;
        retryableErrors?: string[];
    };
    transform?: Record<string, (value: any) => any>;
    pagination?: {
        page: number;
        pageSize: number;
    };
}

/**
 * Database session options
 */
export interface SessionOptions {
    autoCommit?: boolean;
    readOnly?: boolean;
    lockTimeout?: number;
    statementTimeout?: number;
    searchPath?: string[]; // PostgreSQL
    currentSchema?: string; // Oracle
    timezone?: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
    passed: boolean;
    ruleName: string;
    message: string;
    details?: any;
    duration?: number;
}

/**
 * Validation rule interface
 */
export interface ValidationRule {
    type: 'unique' | 'notNull' | 'inList' | 'pattern' | 'range' | 'dataType' | 'length' | 'custom' | 'equals';
    value?: any; // For equals validation
    values?: any[]; // For inList
    pattern?: string; // For pattern (regex)
    min?: number; // For range
    max?: number; // For range
    dataType?: string; // For dataType
    minLength?: number; // For length
    maxLength?: number; // For length
    customValidator?: (value: any, row?: number, allValues?: any[]) => boolean;
    customMessage?: string;
}

/**
 * Schema validation options
 */
export interface SchemaValidationOptions {
    schema?: string;
    strict?: boolean;
    ignoreCase?: boolean;
    checkConstraints?: boolean;
    checkIndexes?: boolean;
}

/**
 * Export format options
 */
export interface ExportOptions {
    format: 'csv' | 'json' | 'xml' | 'excel' | 'text';
    delimiter?: string; // For CSV
    headers?: boolean; // For CSV
    pretty?: boolean; // For JSON/XML
    encoding?: string;
    lineEnding?: '\n' | '\r\n';
    nullValue?: string;
    dateFormat?: string;
    booleanFormat?: { true: string; false: string };
}

/**
 * Import options
 */
export interface ImportOptions {
    format: 'csv' | 'json' | 'xml' | 'excel' | 'text';
    delimiter?: string; // For CSV
    hasHeaders?: boolean; // For CSV
    encoding?: string;
    skipRows?: number;
    maxRows?: number;
    trimValues?: boolean;
    parseNumbers?: boolean;
    parseDates?: boolean;
    dateFormats?: string[];
    nullValues?: string[];
    columnMapping?: Record<string, string>;
}

/**
 * Database metadata interface
 */
export interface DatabaseMetadata {
    version: string;
    databaseName: string;
    serverType: string;
    capabilities: DatabaseCapabilities;
    characterSet?: string;
    collation?: string;
    timezone?: string;
    currentUser?: string;
    currentSchema?: string;
    schemas?: string[];
}

/**
 * Table information interface
 */
export interface TableInfo {
    name: string;
    schema?: string;
    type: 'table' | 'view' | 'materialized_view' | 'temporary';
    columns: ColumnInfo[];
    primaryKey?: {
        name: string;
        columns: string[];
    };
    indexes?: IndexMetadata[];
    constraints?: ConstraintMetadata[];
    rowCount?: number;
    size?: number;
    created?: Date;
    modified?: Date;
    comment?: string;
    engine?: string; // MySQL specific
    tablespace?: string; // Oracle/PostgreSQL specific
}

/**
 * Column information interface
 */
export interface ColumnInfo {
    name: string;
    ordinalPosition: number;
    dataType: string;
    nativeDataType?: string; // Database-specific type
    nullable: boolean;
    defaultValue?: any;
    maxLength?: number;
    precision?: number;
    scale?: number;
    isPrimaryKey: boolean;
    isUnique: boolean;
    isAutoIncrement: boolean;
    isGenerated?: boolean;
    generationExpression?: string;
    comment?: string;
    collation?: string;
    characterSet?: string;
}

/**
 * Database metadata interfaces
 */
export interface TableMetadata {
    name: string;
    schema?: string;
    type: 'table' | 'view' | 'materialized_view';
    rowCount?: number;
    size?: number;
    created?: Date;
    modified?: Date;
    comment?: string;
}

export interface ColumnMetadata {
    name: string;
    dataType: string;
    nullable: boolean;
    defaultValue?: any;
    primaryKey: boolean;
    unique: boolean;
    foreignKey?: {
        table: string;
        column: string;
        onDelete?: string;
        onUpdate?: string;
    };
    autoIncrement?: boolean;
    comment?: string;
}

export interface IndexMetadata {
    name: string;
    table: string;
    columns: string[];
    unique: boolean;
    type?: 'btree' | 'hash' | 'gin' | 'gist' | 'spatial';
    where?: string; // Partial index condition
}

export interface ConstraintMetadata {
    name: string;
    table: string;
    type: 'primary' | 'foreign' | 'unique' | 'check';
    columns: string[];
    definition?: string;
    references?: {
        table: string;
        columns: string[];
    };
}

/**
 * Query execution plan
 */
export interface ExecutionPlan {
    operation: string;
    cost?: number;
    rows?: number;
    width?: number;
    actualTime?: number;
    actualRows?: number;
    loops?: number;
    children?: ExecutionPlan[];
    details?: Record<string, any>;
}

/**
 * Database event types
 */
export type DatabaseEvent = 
    | 'connect'
    | 'disconnect'
    | 'query'
    | 'error'
    | 'transaction_begin'
    | 'transaction_commit'
    | 'transaction_rollback'
    | 'health_check';

/**
 * Database event handler
 */
export interface DatabaseEventHandler {
    (event: DatabaseEvent, data?: any): void;
}

/**
 * Stream options for large result sets
 */
export interface StreamOptions {
    highWaterMark?: number;
    batchSize?: number;
    transform?: (row: any) => any;
}

/**
 * Backup and restore options
 */
export interface BackupOptions {
    format?: 'sql' | 'custom' | 'directory' | 'tar';
    compression?: boolean;
    includeSchema?: boolean;
    includeData?: boolean;
    tables?: string[];
    excludeTables?: string[];
}

export interface RestoreOptions {
    cleanBeforeRestore?: boolean;
    createDatabase?: boolean;
    exitOnError?: boolean;
    numberOfJobs?: number;
    tables?: string[];
    excludeTables?: string[];
}

/**
 * Database adapter error types
 */
export enum DatabaseErrorCode {
    CONNECTION_ERROR = 'CONNECTION_ERROR',
    AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
    QUERY_ERROR = 'QUERY_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    TRANSACTION_ERROR = 'TRANSACTION_ERROR',
    CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
    DUPLICATE_KEY = 'DUPLICATE_KEY',
    FOREIGN_KEY_VIOLATION = 'FOREIGN_KEY_VIOLATION',
    NOT_NULL_VIOLATION = 'NOT_NULL_VIOLATION',
    DATA_TYPE_MISMATCH = 'DATA_TYPE_MISMATCH',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Enhanced database error
 */
export interface DatabaseError extends Error {
    code: DatabaseErrorCode;
    originalError?: Error;
    query?: string;
    parameters?: any[];
    context?: Record<string, any>;
    solution?: string;
}

/**
 * Stored procedure parameter interface
 */
export interface ProcedureParameter {
    name: string;
    value: any;
    type: string;
    direction: 'IN' | 'OUT' | 'INOUT' | 'RETURN';
    length?: number;
    precision?: number;
    scale?: number;
}

/**
 * Stored procedure call result interface
 */
export interface StoredProcedureCall {
    resultSets?: QueryResult[];
    outputParameters?: Record<string, any>;
    returnValue?: any;
    rowsAffected?: number[];
    messages?: Array<{
        message: string;
        severity: number;
        state?: number;
        lineNumber?: number;
        procedureName?: string;
    }>;
}

/**
 * Stored procedure metadata
 */
export interface StoredProcedureMetadata {
    name: string;
    schema: string;
    parameters?: Array<{
        name: string;
        type: string;
        direction: string;
        defaultValue?: any;
    }>;
    returnType?: string;
    created?: Date;
    modified?: Date;
}

/**
 * Transaction interface
 */
export interface Transaction {
    id: string;
    isolationLevel?: string;
    startTime: Date;
    connection: DatabaseConnection;
    savepoints?: string[];
    status: 'active' | 'committed' | 'rolledback';
    timeout?: number;
}