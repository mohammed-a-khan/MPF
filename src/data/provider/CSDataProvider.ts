// src/data/provider/CSDataProvider.ts
import { DataProviderOptions, TestData, DataSource, DataProviderResult, DataProviderConfig, ExecutionFlag } from '../types/data.types';
import { DataProviderFactory } from './DataProviderFactory';
import { DataCache } from './DataCache';
import { DataIterator } from './DataIterator';
import { DataCleanupManager } from './DataCleanupManager';
import { DataValidator } from '../validators/DataValidator';
import { ExecutionFlagValidator } from '../validators/ExecutionFlagValidator';
import { SchemaValidator } from '../validators/SchemaValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { VariableInterpolator } from '../transformers/VariableInterpolator';
import { DataMerger } from '../transformers/DataMerger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { logger } from '../../core/utils/Logger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Main data provider orchestrator
 * Manages loading, caching, and providing test data from multiple sources
 */
export class CSDataProvider {
    private static instance: CSDataProvider;
    private cache: DataCache;
    private factory: DataProviderFactory;
    private validator: DataValidator;
    private flagValidator: ExecutionFlagValidator;
    private schemaValidator: SchemaValidator;
    private transformer: DataTransformer;
    private interpolator: VariableInterpolator;
    private merger: DataMerger;
    private cleanupManager: DataCleanupManager;
    private loadedData: Map<string, TestData[]> = new Map();
    private config: DataProviderConfig;

    private constructor() {
        this.cache = DataCache.getInstance();
        this.factory = new DataProviderFactory();
        this.validator = new DataValidator();
        this.flagValidator = new ExecutionFlagValidator();
        this.schemaValidator = new SchemaValidator();
        this.transformer = new DataTransformer();
        this.interpolator = new VariableInterpolator();
        this.merger = new DataMerger();
        this.cleanupManager = DataCleanupManager.getInstance();
        this.config = this.createDefaultConfig();
        this.initializeConfig();
    }

    /**
     * Create default configuration
     */
    private createDefaultConfig(): DataProviderConfig {
        return {
            cacheEnabled: true,
            cacheTTL: 3600000, // 1 hour
            defaultDataPath: './test-data',
            streamingThreshold: 10485760, // 10MB
            maxRetries: 3,
            retryDelay: 1000,
            variablePrefix: '${',
            variableSuffix: '}',
            executionFlagColumn: 'ExecutionFlag',
            defaultExecutionFlag: 'Y'
        };
    }

    /**
     * Get singleton instance
     */
    static getInstance(): CSDataProvider {
        if (!CSDataProvider.instance) {
            CSDataProvider.instance = new CSDataProvider();
        }
        return CSDataProvider.instance;
    }

    /**
     * Initialize configuration
     */
    private initializeConfig(): void {
        this.config = {
            cacheEnabled: ConfigurationManager.getBoolean('DATA_PROVIDER_CACHE_ENABLED', true),
            cacheTTL: ConfigurationManager.getInt('DATA_PROVIDER_CACHE_TTL', 3600000), // 1 hour
            defaultDataPath: ConfigurationManager.get('DEFAULT_DATA_PATH', './test-data'),
            streamingThreshold: ConfigurationManager.getInt('DATA_STREAMING_THRESHOLD', 10485760), // 10MB
            maxRetries: ConfigurationManager.getInt('DATA_PROVIDER_MAX_RETRIES', 3),
            retryDelay: ConfigurationManager.getInt('DATA_PROVIDER_RETRY_DELAY', 1000),
            variablePrefix: ConfigurationManager.get('DATA_VARIABLE_PREFIX', '${'),
            variableSuffix: ConfigurationManager.get('DATA_VARIABLE_SUFFIX', '}'),
            executionFlagColumn: ConfigurationManager.get('EXECUTION_FLAG_COLUMN', 'ExecutionFlag'),
            defaultExecutionFlag: ConfigurationManager.get('DEFAULT_EXECUTION_FLAG', 'Y') as ExecutionFlag
        };
    }

    /**
     * Load test data based on options
     * Main entry point for data loading
     */
    async loadData(options: DataProviderOptions): Promise<TestData[]> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data provider operation: load', { operation: 'load', options });
        
        try {
            // Check cache first if enabled
            if (this.config.cacheEnabled) {
                const cached = this.cache.get(this.generateCacheKey(options));
                if (cached) {
                    ActionLogger.logInfo('Data provider operation: cache_hit', { operation: 'cache_hit', options });
                    return cached;
                }
            }

            // Parse options from @DataProvider tag
            const parsedOptions = await this.parseDataProviderOptions(options);
            
            // Load data from source
            let data = await this.loadFromSource(parsedOptions);
            
            // Apply transformations
            data = await this.applyTransformations(data, parsedOptions);
            
            // Filter by execution flag
            data = await this.filterByExecutionFlag(data, parsedOptions);
            
            // Validate data
            await this.validateData(data, parsedOptions);
            
            // Cache if enabled
            if (this.config.cacheEnabled) {
                this.cache.set(this.generateCacheKey(options), data, this.config.cacheTTL);
            }
            
            // Store for cleanup
            const dataId = this.generateDataId(options);
            this.loadedData.set(dataId, data);
            this.cleanupManager.registerData(dataId, data);
            
            const duration = Date.now() - startTime;
            ActionLogger.logInfo('Data provider operation: load_complete', {
                operation: 'load_complete',
                ...options,
                recordCount: data.length,
                duration
            });
            
            return data;
            
        } catch (error) {
            ActionLogger.logError('Data provider error: load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Parse @DataProvider tag options
     */
    private async parseDataProviderOptions(options: DataProviderOptions): Promise<DataProviderOptions> {
        // Parse tag format: @DataProvider(source="file.xlsx", sheet="TestData", filter="Status=Active")
        if (options.tagValue) {
            const parsed = this.parseTagValue(options.tagValue);
            return { ...options, ...parsed };
        }
        
        // Apply defaults
        return {
            ...options,
            source: options.source || await this.resolveDataSource(options),
            type: options.type || this.detectSourceType(options.source),
            executionFlagColumn: options.executionFlagColumn || this.config.executionFlagColumn,
            skipExecutionFlag: options.skipExecutionFlag || false
        };
    }

    /**
     * Parse @DataProvider tag value
     */
    private parseTagValue(tagValue: string): Partial<DataProviderOptions> {
        const options: Partial<DataProviderOptions> = {};
        
        // Parse key=value pairs
        const regex = /(\w+)=["']([^"']+)["']/g;
        let match;
        
        while ((match = regex.exec(tagValue)) !== null) {
            const key = match[1];
            const value = match[2];
            
            switch (key) {
                case 'source':
                    options.source = value || '';
                    break;
                case 'type':
                    options.type = value as DataSource;
                    break;
                case 'sheet':
                    options.sheet = value || '';
                    break;
                case 'table':
                    options.table = value || '';
                    break;
                case 'query':
                    options.query = value || '';
                    break;
                case 'filter':
                    options.filter = this.parseFilter(value || '');
                    break;
                case 'schema':
                    options.schemaPath = value || '';
                    break;
                case 'streaming':
                    options.streaming = value === 'true';
                    break;
                case 'executionFlag':
                    options.executionFlagColumn = value || '';
                    break;
                case 'skipFlag':
                    options.skipExecutionFlag = value === 'true';
                    break;
            }
        }
        
        return options;
    }

    /**
     * Parse filter expression
     */
    private parseFilter(filterStr: string): Record<string, any> {
        const filter: Record<string, any> = {};
        
        // Parse simple key=value filters
        const parts = filterStr.split(',');
        for (const part of parts) {
            const splitParts = part.split('=').map(s => s.trim());
            if (splitParts.length >= 2) {
                const key = splitParts[0];
                const value = splitParts[1];
                if (key) {
                    filter[key] = this.parseFilterValue(value || '');
                }
            }
        }
        
        return filter;
    }

    /**
     * Parse filter value
     */
    private parseFilterValue(value: string): any {
        // Number
        if (/^\d+(\.\d+)?$/.test(value)) {
            return parseFloat(value);
        }
        
        // Boolean
        if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
            return value.toLowerCase() === 'true';
        }
        
        // Date
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            return new Date(value);
        }
        
        // String (remove quotes if present)
        return value.replace(/^["']|["']$/g, '');
    }

    /**
     * Load data from source
     */
    private async loadFromSource(options: DataProviderOptions): Promise<TestData[]> {
        const handler = this.factory.createHandler(options.type!);
        
        let attempt = 0;
        let lastError: Error | null = null;
        
        while (attempt < this.config.maxRetries) {
            try {
                const result = await handler.load(options);
                return result.data;
            } catch (error) {
                lastError = error as Error;
                attempt++;
                
                if (attempt < this.config.maxRetries) {
                    logger.warn(`Data loading attempt ${attempt} failed, retrying...`);
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }
        
        throw lastError || new Error('Failed to load data after retries');
    }

    /**
     * Apply transformations to data
     */
    private async applyTransformations(
        data: TestData[], 
        options: DataProviderOptions
    ): Promise<TestData[]> {
        // Apply filter if specified
        if (options.filter) {
            data = this.applyFilter(data, options.filter);
        }
        
        // Apply transformations
        if (options.transformations) {
            data = await this.transformer.transform(data, options.transformations);
        }
        
        // Interpolate variables
        if (options.interpolateVariables !== false) {
            data = await this.interpolator.interpolateArray(data, options.variables || {});
        }
        
        // Merge with additional data sources
        if (options.mergeSources) {
            for (const mergeSource of options.mergeSources) {
                const mergeData = await this.loadFromSource({
                    ...options,
                    ...mergeSource
                });
                const mergeResult = await this.merger.merge([data, mergeData], mergeSource.mergeOptions || {});
                data = mergeResult.result;
            }
        }
        
        return data;
    }

    /**
     * Apply filter to data
     */
    private applyFilter(data: TestData[], filter: Record<string, any>): TestData[] {
        return data.filter(row => {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Filter data by execution flag
     */
    async filterByExecutionFlag(
        data: TestData[], 
        options: DataProviderOptions
    ): Promise<TestData[]> {
        if (options.skipExecutionFlag) {
            return data;
        }
        
        const columnName = options.executionFlagColumn || this.config.executionFlagColumn;
        
        return this.flagValidator.filterByExecutionFlag(data, 'execute', {
            flagColumn: columnName,
            environment: ConfigurationManager.getEnvironmentName(),
            defaultFlag: this.config.defaultExecutionFlag
        });
    }

    /**
     * Validate test data
     */
    private async validateData(data: TestData[], options: DataProviderOptions): Promise<void> {
        // Basic validation
        const validationRules: Record<string, any> = {};
        
        // Build validation rules from options
        if (options.requiredFields) {
            for (const field of options.requiredFields) {
                validationRules[field] = { type: 'required', field };
            }
        }
        
        if (options.uniqueFields) {
            for (const field of options.uniqueFields) {
                validationRules[field] = { type: 'unique', field };
            }
        }
        
        if (options.validations) {
            for (const validation of options.validations) {
                if (!validationRules[validation.field]) {
                    validationRules[validation.field] = [];
                } else if (!Array.isArray(validationRules[validation.field])) {
                    validationRules[validation.field] = [validationRules[validation.field]];
                }
                
                if (Array.isArray(validationRules[validation.field])) {
                    validationRules[validation.field].push({
                        type: validation.type,
                        field: validation.field,
                        min: validation.min,
                        max: validation.max,
                        pattern: validation.pattern,
                        message: validation.message,
                        validator: validation.validator
                    });
                }
            }
        }
        
        const validationResult = await this.validator.validate(data, validationRules);
        
        if (!validationResult.valid) {
            const errorMessages = validationResult.errors.map(e => 
                e.errors ? e.errors.join(', ') : 'Unknown validation error'
            );
            throw new Error(`Data validation failed: ${errorMessages.join(', ')}`);
        }
        
        // Schema validation if specified
        if (options.schemaPath) {
            const schema = await this.loadSchema(options.schemaPath);
            const schemaResult = await this.schemaValidator.validate(data, schema);
            
            if (!schemaResult.valid) {
                throw new Error(`Schema validation failed: ${schemaResult.errors.map(e => e.message).join(', ')}`);
            }
        }
    }

    /**
     * Create iterator for test data
     */
    createIterator(dataId: string): DataIterator {
        const data = this.loadedData.get(dataId);
        if (!data) {
            throw new Error(`No data found for ID: ${dataId}`);
        }
        
        return new DataIterator(data);
    }

    /**
     * Get data by ID
     */
    getData(dataId: string): TestData[] | undefined {
        return this.loadedData.get(dataId);
    }

    /**
     * Get data by source - simplified interface for test files
     * @param options Simplified data source options
     */
    async getDataBySource(options: {
        type: 'csv' | 'json' | 'excel' | 'xml';
        path?: string;
        source?: string;
        filterField?: string;
        filterValue?: string;
        sheet?: string;
        jsonPath?: string;
    }): Promise<TestData[]> {
        const dataOptions: DataProviderOptions = {
            type: options.type,
            source: options.path || options.source || '',
            ...(options.filterField && options.filterValue ? {
                filter: { [options.filterField]: options.filterValue }
            } : {}),
            ...(options.sheet ? { sheet: options.sheet } : {}),
            ...(options.jsonPath ? { jsonPath: options.jsonPath } : {})
        };

        return await this.loadData(dataOptions);
    }

    /**
     * REAL IMPLEMENTATION: Clear cached data and loaded data to prevent memory leaks
     */
    clearCache(pattern?: string): void {
        const loadedDataCount = this.loadedData.size;
        
        if (pattern) {
            this.cache.clearPattern(pattern);
            // Clear matching loaded data entries
            for (const [key, data] of this.loadedData.entries()) {
                if (key.includes(pattern)) {
                    this.loadedData.delete(key);
                    ActionLogger.logDebug(`Cleared loaded data for key: ${key}, records: ${data.length}`);
                }
            }
        } else {
            this.cache.clear();
            this.loadedData.clear();
        }
        
        const remainingLoadedData = this.loadedData.size;
        const clearedLoadedData = loadedDataCount - remainingLoadedData;
        
        ActionLogger.logInfo('Data provider cache cleared', {
            operation: 'data_cache_cleanup',
            pattern,
            clearedLoadedData,
            remainingLoadedData
        });
    }

    /**
     * Cleanup loaded data
     */
    async cleanup(dataId?: string): Promise<void> {
        if (dataId) {
            this.loadedData.delete(dataId);
            await this.cleanupManager.cleanup(dataId);
        } else {
            this.loadedData.clear();
            await this.cleanupManager.cleanupAll();
        }
    }

    /**
     * Get statistics
     */
    getStatistics(): DataProviderResult {
        const cacheStats = this.cache.getStatistics();
        const cleanupStats = this.cleanupManager.getStatistics();
        
        return {
            data: [],
            metadata: {
                totalRecords: Array.from(this.loadedData.values())
                    .reduce((sum, data) => sum + data.length, 0),
                loadedSources: this.loadedData.size,
                cacheHitRate: cacheStats.hitRate,
                cacheSize: cacheStats.size,
                cleanupPending: cleanupStats.pendingTasks
            }
        };
    }

    /**
     * Resolve data source path
     */
    private async resolveDataSource(options: DataProviderOptions): Promise<string> {
        // Try feature-relative path first
        if (options.featurePath) {
            const featureDir = path.dirname(options.featurePath);
            const featureDataPath = path.join(featureDir, 'data', `${options.scenarioName}.xlsx`);
            
            if (await this.fileExists(featureDataPath)) {
                return featureDataPath;
            }
        }
        
        // Try default data path
        const defaultPath = path.join(
            this.config.defaultDataPath,
            `${options.scenarioName || 'test-data'}.xlsx`
        );
        
        if (await this.fileExists(defaultPath)) {
            return defaultPath;
        }
        
        throw new Error(`Could not resolve data source for scenario: ${options.scenarioName}`);
    }

    /**
     * Detect source type from path/source
     */
    private detectSourceType(source?: string): DataSource {
        if (!source) return 'excel';
        
        const ext = path.extname(source).toLowerCase();
        switch (ext) {
            case '.xlsx':
            case '.xls':
                return 'excel';
            case '.csv':
                return 'csv';
            case '.json':
                return 'json';
            case '.xml':
                return 'xml';
            default:
                // Check if it's a database connection string
                if (source.includes('://') || source.includes('server=')) {
                    return 'database';
                }
                return 'file';
        }
    }

    /**
     * Load schema from file
     */
    private async loadSchema(schemaPath: string): Promise<any> {
        const absolutePath = path.isAbsolute(schemaPath) 
            ? schemaPath 
            : path.join(this.config.defaultDataPath, 'schemas', schemaPath);
            
        const content = await fs.readFile(absolutePath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * Generate cache key
     */
    private generateCacheKey(options: DataProviderOptions): string {
        return `${options.source}_${options.type}_${JSON.stringify(options.filter || {})}`;
    }

    /**
     * Generate data ID
     */
    private generateDataId(options: DataProviderOptions): string {
        return `${options.scenarioName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Delay execution
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Enhance error with context
     */
    private enhanceError(error: any, options: DataProviderOptions): Error {
        const message = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(
            `Data Provider Error: ${message}\n` +
            `Source: ${options.source}\n` +
            `Type: ${options.type}\n` +
            `Options: ${JSON.stringify(options, null, 2)}`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
    
    /**
     * REAL IMPLEMENTATION: Limit cache sizes to prevent memory exhaustion
     */
    limitCacheSizes(): void {
        const MAX_LOADED_DATA_SOURCES = 50;
        const MAX_RECORDS_PER_SOURCE = 10000;
        
        // Limit number of loaded data sources
        if (this.loadedData.size > MAX_LOADED_DATA_SOURCES) {
            const toDelete = this.loadedData.size - MAX_LOADED_DATA_SOURCES;
            const keys = Array.from(this.loadedData.keys()).slice(0, toDelete);
            keys.forEach(key => {
                const data = this.loadedData.get(key);
                if (data) {
                    ActionLogger.logDebug(`Removing data source: ${key} with ${data.length} records`);
                }
                this.loadedData.delete(key);
            });
            ActionLogger.logDebug(`Trimmed ${toDelete} old data sources from loaded data`);
        }
        
        // Limit records per source
        let totalRecordsTrimmed = 0;
        for (const [key, data] of this.loadedData.entries()) {
            if (data.length > MAX_RECORDS_PER_SOURCE) {
                const trimmed = data.splice(MAX_RECORDS_PER_SOURCE);
                totalRecordsTrimmed += trimmed.length;
                ActionLogger.logDebug(`Trimmed ${trimmed.length} records from data source: ${key}`);
            }
        }
        
        if (totalRecordsTrimmed > 0) {
            ActionLogger.logDebug(`Trimmed ${totalRecordsTrimmed} excess records from data sources`);
        }
        
        // Cache instance handles its own size limiting internally
    }
}