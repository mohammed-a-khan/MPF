// src/data/handlers/DatabaseHandler.ts

import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation } from '../types/data.types';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { CSDatabase } from '../../database/client/CSDatabase';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

/**
 * Handler for database sources
 * Supports all 6 database types through CSDatabase
 */
export class DatabaseHandler implements DataHandler {
    private validator: DataValidator;
    private transformer: DataTransformer;
    private database: CSDatabase | null = null;
    private currentSource: string | undefined;
    
    constructor() {
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
    }

    /**
     * Load data from database
     */
    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: database_load', { operation: 'database_load', options });
        
        try {
            // Get connection configuration
            this.currentSource = options.source;
            const connectionName = options.connection || this.resolveConnectionName(options.source!);
            const connection = await this.getOrCreateDatabase(connectionName);
            
            // Build query
            const query = await this.buildQuery(options);
            const params = options.params || [];
            
            logger.debug(`Executing query: ${query}`);
            
            // Execute query
            const result = await connection.query(query, params);
            let data = result.rows || [];
            
            // Apply filter if specified
            if (options.filter) {
                data = data.filter((row: any) => this.matchesFilter(row, options.filter!));
            }
            
            // Apply transformations if specified
            if (options.transformations && options.transformations.length > 0) {
                data = await this.transformer.transform(data, options.transformations);
            }
            
            // Limit records if specified
            if (options.maxRecords && data.length > options.maxRecords) {
                data = data.slice(0, options.maxRecords);
            }
            
            const loadTime = Date.now() - startTime;
            
            return {
                data,
                metadata: {
                    totalRecords: data.length,
                    affectedRows: result.affectedRows,
                    loadTime,
                    source: connectionName,
                    query: this.sanitizeQueryForLogging(query),
                    database: this.database?.getType() || 'unknown'
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: database_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Stream data from database
     */
    async *stream(options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const connectionName = options.connection || this.resolveConnectionName(options.source!);
        const connection = await this.getOrCreateDatabase(connectionName);
        
        const query = await this.buildQuery(options);
        const params = options.params || [];
        const batchSize = options.batchSize || 1000;
        
        // Use offset-based pagination
            let offset = 0;
            let recordCount = 0;
            
            while (true) {
                const paginatedQuery = this.addPagination(query, offset, batchSize, this.database?.getType() || 'postgresql');
                const result = await connection.query(paginatedQuery, params);
                const rows = result.rows || [];
                
                if (rows.length === 0) break;
                
                for (const row of rows) {
                    // Apply filter
                    if (options.filter && !this.matchesFilter(row, options.filter)) {
                        continue;
                    }
                    
                    yield row;
                    recordCount++;
                    
                    // Check max records
                    if (options.maxRecords && recordCount >= options.maxRecords) {
                        return;
                    }
                }
                
                offset += batchSize;
                
                // Break if we got less than batch size (no more records)
                if (rows.length < batchSize) break;
            }
    }

    /**
     * Load partial data from database
     */
    async loadPartial(
        options: DataProviderOptions, 
        offset: number, 
        limit: number
    ): Promise<DataProviderResult> {
        const startTime = Date.now();
        
        try {
            const connectionName = options.connection || this.resolveConnectionName(options.source!);
            const connection = await this.getOrCreateDatabase(connectionName);
            
            // Build query with pagination
            const baseQuery = await this.buildQuery(options);
            const query = this.addPagination(baseQuery, offset, limit, this.database?.getType() || 'postgresql');
            const params = options.params || [];
            
            // Execute query
            const result = await connection.query(query, params);
            const data = result.rows || [];
            
            // Get total count
            const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as subquery`;
            const countResult = await connection.query(countQuery, params);
            const totalCount = countResult.rows[0]?.total || 0;
            
            const loadTime = Date.now() - startTime;
            
            return {
                data,
                metadata: {
                    totalRecords: data.length,
                    totalAvailable: totalCount,
                    offset,
                    limit,
                    loadTime,
                    source: connectionName,
                    database: this.database?.getType() || 'unknown'
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: database_partial_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Load schema from database
     */
    async loadSchema(options: DataProviderOptions): Promise<any> {
        try {
            const connectionName = options.connection || this.resolveConnectionName(options.source!);
            const connection = await this.getOrCreateDatabase(connectionName);
            
            // Get table schema
            if (options.table) {
                const tableInfo = await connection.getTableInfo(options.table);
                return this.convertToDataSchema(tableInfo);
            }
            
            // For queries, analyze result structure
            const query = await this.buildQuery(options);
            const result = await connection.query(`${query} LIMIT 1`, options.params || []);
            
            if (result.rows.length > 0) {
                return this.inferSchemaFromData(result.rows[0]);
            }
            
            throw new Error('Unable to determine schema: no data found');
            
        } catch (error) {
            ActionLogger.logError('Data handler error: database_schema_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Get database metadata
     */
    async getMetadata(options: DataProviderOptions): Promise<Record<string, any>> {
        try {
            const connectionName = options.connection || this.resolveConnectionName(options.source!);
            const connection = await this.getOrCreateDatabase(connectionName);
            
            const metadata: Record<string, any> = {
                connectionName,
                database: this.database?.getType() || 'unknown',
                connected: connection.isConnected()
            };
            
            if (options.table) {
                // Get table metadata
                const tableInfo = await connection.getTableInfo(options.table);
                metadata['table'] = {
                    name: options.table,
                    rowCount: tableInfo.rowCount,
                    columns: tableInfo.columns,
                    indexes: tableInfo.indexes,
                    primaryKey: tableInfo.primaryKey,
                    foreignKeys: tableInfo.foreignKeys
                };
            }
            
            if (options.query) {
                // Query plan analysis not supported in current implementation
                metadata['queryPlan'] = 'Not available';
            }
            
            return metadata;
            
        } catch (error) {
            ActionLogger.logError('Data handler error: database_metadata_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Validate data
     */
    async validate(data: TestData[]): Promise<ValidationResult> {
        const validationRules: Record<string, any> = {};
        
        const result = await this.validator.validate(data, validationRules, {
            validateRequired: true,
            validateTypes: true,
            stopOnFirstError: false
        });
        
        return {
            isValid: result.valid,
            errors: result.errors.map(e => typeof e === 'string' ? e : 'Validation error'),
            warnings: result.warnings?.map(w => typeof w === 'string' ? w : 'Validation warning'),
            details: result.errors.map((e, index) => ({
                row: index,
                error: typeof e === 'string' ? e : 'Validation error'
            }))
        };
    }

    /**
     * Transform data
     */
    async transform(data: TestData[], transformations: DataTransformation[]): Promise<TestData[]> {
        return await this.transformer.transform(data, transformations);
    }

    /**
     * Build query from options
     */
    private async buildQuery(options: DataProviderOptions): Promise<string> {
        // Direct query
        if (options.query) {
            // Check for predefined query
            const predefinedQuery = ConfigurationManager.get(options.query, '');
            return predefinedQuery || options.query;
        }
        
        // Build from table
        if (options.table) {
            let query = `SELECT * FROM ${options.table}`;
            
            // Add WHERE clause
            if (options.where) {
                query += ` WHERE ${options.where}`;
            } else if (options.filter) {
                const whereConditions = Object.entries(options.filter)
                    .map(([key, value]) => {
                        if (value === null) {
                            return `${key} IS NULL`;
                        } else if (typeof value === 'string') {
                            return `${key} = '${value.replace(/'/g, "''")}'`;
                        } else {
                            return `${key} = ${value}`;
                        }
                    })
                    .join(' AND ');
                
                if (whereConditions) {
                    query += ` WHERE ${whereConditions}`;
                }
            }
            
            // Add ORDER BY
            const dbOptions = options as any;
            if (dbOptions.orderBy) {
                query += ` ORDER BY ${dbOptions.orderBy}`;
            }
            
            return query;
        }
        
        throw new Error('Either query or table must be specified');
    }

    /**
     * Add pagination to query
     */
    private addPagination(query: string, offset: number, limit: number, dbType: string): string {
        switch (dbType) {
            case 'sqlserver':
                // SQL Server uses OFFSET FETCH
                if (!query.toUpperCase().includes('ORDER BY')) {
                    query += ' ORDER BY (SELECT NULL)'; // Required for OFFSET
                }
                return `${query} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
                
            case 'oracle':
                // Oracle uses ROWNUM or OFFSET FETCH (12c+)
                return `
                    SELECT * FROM (
                        SELECT a.*, ROWNUM rnum FROM (${query}) a
                        WHERE ROWNUM <= ${offset + limit}
                    )
                    WHERE rnum > ${offset}
                `;
                
            case 'mysql':
            case 'postgresql':
            default:
                // MySQL and PostgreSQL use LIMIT OFFSET
                return `${query} LIMIT ${limit} OFFSET ${offset}`;
        }
    }

    /**
     * Resolve connection name from source
     */
    private resolveConnectionName(source: string): string {
        // Check if source is a connection string
        if (source.includes('://') || source.includes('server=')) {
            // For connection strings, use connectWithConnectionString method
            const connectionName = `dynamic_${Date.now()}`;
            // Note: Connection string will be handled in getOrCreateDatabase
            return connectionName;
        }
        
        // Otherwise treat as connection name
        return source;
    }

    /**
     * Convert database schema to data schema
     */
    private convertToDataSchema(dbSchema: any): any {
        const fields = dbSchema.columns.map((col: any) => ({
            name: col.name,
            type: this.mapDatabaseType(col.type),
            required: !col.nullable,
            unique: col.unique,
            maxLength: col.maxLength,
            default: col.defaultValue
        }));
        
        return {
            version: '1.0',
            fields,
            constraints: dbSchema.constraints || []
        };
    }

    /**
     * Map database type to data type
     */
    private mapDatabaseType(dbType: string): string {
        const typeMap: Record<string, string> = {
            'varchar': 'string',
            'char': 'string',
            'text': 'string',
            'nvarchar': 'string',
            'int': 'number',
            'bigint': 'number',
            'decimal': 'number',
            'float': 'number',
            'double': 'number',
            'bit': 'boolean',
            'boolean': 'boolean',
            'date': 'date',
            'datetime': 'date',
            'timestamp': 'date',
            'json': 'object',
            'jsonb': 'object'
        };
        
        const normalizedType = dbType.toLowerCase().split('(')[0];
        return typeMap[normalizedType as keyof typeof typeMap] || 'string';
    }

    /**
     * Infer schema from data
     */
    private inferSchemaFromData(record: any): any {
        const fields = Object.entries(record).map(([key, value]) => ({
            name: key,
            type: this.getValueType(value),
            required: false,
            nullable: value === null
        }));
        
        return {
            version: '1.0',
            fields
        };
    }

    /**
     * Get value type
     */
    private getValueType(value: any): string {
        if (value === null || value === undefined) return 'string';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (value instanceof Date) return 'date';
        if (typeof value === 'object') return 'object';
        return 'string';
    }

    /**
     * Check if record matches filter
     */
    private matchesFilter(record: TestData, filter: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(filter)) {
            if (record[key] !== value) {
                return false;
            }
        }
        return true;
    }

    /**
     * Sanitize query for logging
     */
    private sanitizeQueryForLogging(query: string): string {
        // Remove potential sensitive data
        return query
            .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
            .replace(/pwd\s*=\s*'[^']*'/gi, "pwd='***'")
            .replace(/token\s*=\s*'[^']*'/gi, "token='***'");
    }

    /**
     * Get or create database instance
     */
    private async getOrCreateDatabase(connectionName: string): Promise<CSDatabase> {
        if (!this.database) {
            // Check if this is a connection string
            const source = this.currentSource;
            if (source && (source.includes('://') || source.includes('server='))) {
                this.database = await CSDatabase.connectWithConnectionString(source, connectionName);
            } else {
                this.database = await CSDatabase.getInstance(connectionName);
                await this.database.connect();
            }
        }
        return this.database;
    }
    

    /**
     * Enhance error with context
     */
    private enhanceError(error: any, options: DataProviderOptions): Error {
        const enhancedError = new Error(
            `Database Handler Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `Connection: ${options.connection || options.source}\n` +
            `Query/Table: ${options.query || options.table}\n` +
            `Options: ${JSON.stringify(options, null, 2)}`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}