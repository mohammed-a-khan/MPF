// src/data/provider/CSDataProvider.ts
import { DataProviderOptions, TestData, DataSource, DataProviderResult, DataProviderConfig, ExecutionFlag } from '../types/data.types';
import { DataProviderFactory } from './DataProviderFactory';
import { DataCache } from './DataCache';
import { DataIterator } from './DataIterator';
import { DataCleanupManager } from './DataCleanupManager';
import { DataEncryptionManager } from './DataEncryptionManager';
import { DataValidator } from '../validators/DataValidator';
import { ExecutionFlagValidator } from '../validators/ExecutionFlagValidator';
import { SchemaValidator } from '../validators/SchemaValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { VariableInterpolator } from '../transformers/VariableInterpolator';
import { DataMerger } from '../transformers/DataMerger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { logger } from '../../core/utils/Logger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ColumnNormalizer } from '../utils/ColumnNormalizer';
import * as path from 'path';
import * as fs from 'fs/promises';

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
    private testData: Map<string, TestData[]>;

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
        
        DataEncryptionManager.initialize({
            enableAutoDecryption: true
        });

        this.testData = new Map();
    }

    private createDefaultConfig(): DataProviderConfig {
        return {
            cacheEnabled: true,
            cacheTTL: 3600000,
            defaultDataPath: './test-data',
            streamingThreshold: 10485760,
            maxRetries: 3,
            retryDelay: 1000,
            variablePrefix: '${',
            variableSuffix: '}',
            executionFlagColumn: 'ExecutionFlag',
            defaultExecutionFlag: 'Y'
        };
    }

    static getInstance(): CSDataProvider {
        if (!CSDataProvider.instance) {
            CSDataProvider.instance = new CSDataProvider();
        }
        return CSDataProvider.instance;
    }

    private initializeConfig(): void {
        this.config = {
            cacheEnabled: ConfigurationManager.getBoolean('DATA_PROVIDER_CACHE_ENABLED', true),
            cacheTTL: ConfigurationManager.getInt('DATA_PROVIDER_CACHE_TTL', 3600000),
            defaultDataPath: ConfigurationManager.get('DEFAULT_DATA_PATH', './test-data'),
            streamingThreshold: ConfigurationManager.getInt('DATA_STREAMING_THRESHOLD', 10485760),
            maxRetries: ConfigurationManager.getInt('DATA_PROVIDER_MAX_RETRIES', 3),
            retryDelay: ConfigurationManager.getInt('DATA_PROVIDER_RETRY_DELAY', 1000),
            variablePrefix: ConfigurationManager.get('DATA_VARIABLE_PREFIX', '${'),
            variableSuffix: ConfigurationManager.get('DATA_VARIABLE_SUFFIX', '}'),
            executionFlagColumn: ConfigurationManager.get('EXECUTION_FLAG_COLUMN', 'ExecutionFlag'),
            defaultExecutionFlag: ConfigurationManager.get('DEFAULT_EXECUTION_FLAG', 'Y') as ExecutionFlag
        };
    }

    async loadData(options: DataProviderOptions): Promise<TestData[]> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data provider operation: load', { operation: 'load', options });
        
        try {
            if (this.config.cacheEnabled) {
                const cached = this.cache.get(this.generateCacheKey(options));
                if (cached) {
                    ActionLogger.logInfo('Data provider operation: cache_hit', { operation: 'cache_hit', options });
                    return cached;
                }
            }

            const parsedOptions = await this.parseDataProviderOptions(options);
            
            let data = await this.loadFromSource(parsedOptions);
            logger.debug(`Loaded ${data.length} rows from source`);
            
            data = await this.applyTransformations(data, parsedOptions);
            logger.debug(`After transformations: ${data.length} rows`);
            
            data = await this.filterByExecutionFlag(data, parsedOptions);
            logger.debug(`After execution flag filter: ${data.length} rows`);
            
            await this.validateData(data, parsedOptions);
            
            if (this.config.cacheEnabled) {
                this.cache.set(this.generateCacheKey(options), data, this.config.cacheTTL);
            }
            
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
            
            logger.info(`Final data loaded: ${data.length} rows for ${options.source}`);
            
            return data;
            
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.error(`CSDataProvider.load failed:`, errorObj);
            ActionLogger.logError('Data provider error: load_failed', errorObj);
            throw this.enhanceError(error, options);
        }
    }

    private async parseDataProviderOptions(options: DataProviderOptions): Promise<DataProviderOptions> {
        if (options.tagValue) {
            const parsed = this.parseTagValue(options.tagValue);
            return { ...options, ...parsed };
        }
        
        return {
            ...options,
            source: options.source || await this.resolveDataSource(options),
            type: options.type || this.detectSourceType(options.source),
            executionFlagColumn: options.executionFlagColumn || this.config.executionFlagColumn,
            skipExecutionFlag: options.skipExecutionFlag || false
        };
    }

    private parseTagValue(tagValue: string): Partial<DataProviderOptions> {
        const options: Partial<DataProviderOptions> = {};
        
        logger.debug(`Parsing @DataProvider tag value: ${tagValue}`);
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Input tagValue = "${tagValue}"`);
        
        const attributes: Array<{key: string, value: string}> = [];
        let currentPos = 0;
        
        while (currentPos < tagValue.length) {
            const keyMatch = tagValue.substring(currentPos).match(/^(\w+)="/);
            if (!keyMatch) break;
            
            const key = keyMatch[1];
            if (!key) continue;
            currentPos += keyMatch[0].length;
            
            let value = '';
            let inEscape = false;
            let depth = 0;
            let inSingleQuote = false;
            
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Extracting value for key="${key}" starting at pos ${currentPos}`);
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Remaining string: "${tagValue.substring(currentPos, currentPos + 100)}..."`);
            
            for (let i = currentPos; i < tagValue.length; i++) {
                const char = tagValue[i];
                
                if (inEscape) {
                    value += char;
                    inEscape = false;
                    continue;
                }
                
                if (char === '\\') {
                    inEscape = true;
                    value += char;
                    continue;
                }
                
                if (char === "'" && !inEscape) {
                    inSingleQuote = !inSingleQuote;
                    value += char;
                    continue;
                }
                
                if (char === '"' && depth === 0 && !inSingleQuote) {
                    currentPos = i + 1;
                    if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Found end quote at position ${i}, depth=${depth}`);
                    break;
                }
                
                if (!inSingleQuote) {
                    if (char === '[' || char === '{' || char === '(') {
                        depth++;
                        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Opening bracket '${char}' at pos ${i}, depth now ${depth}`);
                    }
                    if (char === ']' || char === '}' || char === ')') {
                        depth--;
                        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Closing bracket '${char}' at pos ${i}, depth now ${depth}`);
                    }
                }
                
                value += char;
            }
            
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Final value for ${key} = "${value}", depth=${depth}`);
            if (depth !== 0) {
                console.warn(`⚠️ WARNING: Bracket depth is ${depth} after parsing, brackets may be unbalanced`);
            }
            
            attributes.push({ key, value });
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Extracted ${key}="${value}"`);
            
            while (currentPos < tagValue.length && (tagValue[currentPos] === ',' || tagValue[currentPos] === ' ')) {
                currentPos++;
            }
        }
        
        for (const { key, value } of attributes) {
            logger.debug(`Extracted key="${key}", value="${value}"`);
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Processing ${key}="${value}"`);
            
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
                case 'sheetName':
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
                case 'delimiter':
                    (options as any).delimiter = value;
                    break;
                case 'headers':
                    options.headers = value === 'true';
                    break;
                case 'parseBooleans':
                    (options as any).parseBooleans = value === 'true';
                    break;
                case 'parseNumbers':
                    (options as any).parseNumbers = value === 'true';
                    break;
                case 'parseDates':
                    (options as any).parseDates = value === 'true';
                    break;
                case 'jsonPath':
                    (options as any).jsonPath = value;
                    if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: jsonPath = "${value}"`);
                    break;
            }
        }
        
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Total attributes found = ${attributes.length}`);
        logger.debug(`Parsed tag options: ${JSON.stringify(options)}`);
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseTagValue: Final parsed options = ${JSON.stringify(options)}`);
        return options;
    }

    private parseFilter(filterStr: string): Record<string, any> {
        const filter: Record<string, any> = {};
        
        logger.debug(`Parsing filter string: "${filterStr}"`);
        
        const parts = filterStr.split(',');
        for (const part of parts) {
            const splitParts = part.split('=').map(s => s.trim());
            if (splitParts.length >= 2) {
                const key = splitParts[0];
                const value = splitParts[1];
                if (key) {
                    const parsedValue = this.parseFilterValue(value || '');
                    filter[key] = parsedValue;
                    logger.debug(`Filter parsed: ${key} = ${parsedValue} (type: ${typeof parsedValue})`);
                    if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG parseFilter: ${key} = "${value}" -> ${parsedValue} (type: ${typeof parsedValue})`);
                }
            }
        }
        
        logger.debug(`Final parsed filter: ${JSON.stringify(filter)}`);
        return filter;
    }

    private parseFilterValue(value: string): any {
        if (/^\d+(\.\d+)?$/.test(value)) {
            return parseFloat(value);
        }
        
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true' || lowerValue === 'false') {
            return lowerValue === 'true';
        }
        if (lowerValue === 'y' || lowerValue === 'yes' || lowerValue === '1' || 
            lowerValue === 'on' || lowerValue === 'enabled' || lowerValue === 'active') {
            return true;
        }
        if (lowerValue === 'n' || lowerValue === 'no' || lowerValue === '0' || 
            lowerValue === 'off' || lowerValue === 'disabled' || lowerValue === 'inactive') {
            return false;
        }
        
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            return new Date(value);
        }
        
        return value.replace(/^["']|["']$/g, '');
    }

    private async loadFromSource(options: DataProviderOptions): Promise<TestData[]> {
        logger.debug(`loadFromSource called with options: ${JSON.stringify(options)}`);
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG loadFromSource: options = ${JSON.stringify(options, null, 2)}`);
        const handler = this.factory.createHandler(options.type!);
        
        let attempt = 0;
        let lastError: Error | null = null;
        
        while (attempt < this.config.maxRetries) {
            try {
                logger.debug(`Loading data from source: ${options.source}, type: ${options.type}`);
                if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG loadFromSource: Calling handler.load with source=${options.source}`);
                const result = await handler.load(options);
                if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG loadFromSource: Handler returned ${result.data.length} rows`);
                logger.debug(`Handler returned ${result.data.length} rows`);
                
                const normalizedData = ColumnNormalizer.normalizeData(result.data);
                
                if (normalizedData.length > 0) {
                    if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG loadFromSource: First row (before normalization) = ${JSON.stringify(result.data[0])}`);
                    if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG loadFromSource: First row (after normalization) = ${JSON.stringify(normalizedData[0])}`);
                }
                
                return normalizedData;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logger.error(`Data loading failed:`, lastError);
                attempt++;
                
                if (attempt < this.config.maxRetries) {
                    logger.warn(`Data loading attempt ${attempt} failed, retrying...`);
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }
        
        throw lastError || new Error('Failed to load data after retries');
    }

    private async applyTransformations(
        data: TestData[], 
        options: DataProviderOptions
    ): Promise<TestData[]> {
        data = await DataEncryptionManager.processTestData(data);
        
        if (options.filter) {
            data = this.applyFilter(data, options.filter);
        }
        
        if (options.transformations) {
            data = await this.transformer.transform(data, options.transformations);
        }
        
        if (options.interpolateVariables !== false) {
            data = await this.interpolator.interpolateArray(data, options.variables || {});
        }
        
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

    private applyFilter(data: TestData[], filter: Record<string, any>): TestData[] {
        logger.debug(`Applying filter: ${JSON.stringify(filter)} to ${data.length} rows`);
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: filter = ${JSON.stringify(filter)}, data.length = ${data.length}`);
        
        if (data.length > 0 && data[0]) {
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: First row keys = ${Object.keys(data[0]).join(', ')}`);
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: First row = ${JSON.stringify(data[0])}`);
            
            const availableColumns = Object.keys(data[0]);
            const filterColumns = Object.keys(filter);
            const missingColumns = filterColumns.filter(col => !availableColumns.includes(col));
            
            if (missingColumns.length > 0) {
                console.warn(`⚠️ WARNING: Filter columns not found in data: ${missingColumns.join(', ')}`);
                console.warn(`⚠️ Available columns: ${availableColumns.join(', ')}`);
                console.warn(`⚠️ This will result in no matches. Please check your filter configuration.`);
            }
        }
        
        const filtered = data.filter((row, index) => {
            let rowMatches = true;
            for (const [key, value] of Object.entries(filter)) {
                if (!(key in row)) {
                    if (index < 3) {
                        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: Row ${index} - key "${key}" not found in row`);
                    }
                    rowMatches = false;
                    break;
                }
                
                if (row[key] === undefined || row[key] === null) {
                    const matches = value === undefined || value === null || value === 'undefined' || value === 'null';
                    if (!matches) {
                        if (index < 3) {
                            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: Row ${index} filtered out - ${key}=undefined/null !== "${value}"`);
                        }
                        rowMatches = false;
                        break;
                    }
                    continue;
                }
                
                const rowValue = String(row[key]);
                const filterValue = String(value);
                
                if (rowValue !== filterValue) {
                    if (index < 3) {
                        logger.debug(`Row ${index} filtered out: ${key}=${rowValue} (type: ${typeof row[key]}) does not match ${filterValue} (type: ${typeof value})`);
                        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: Row ${index} filtered out - ${key}="${rowValue}" !== "${filterValue}"`);
                    }
                    rowMatches = false;
                    break;
                }
            }
            
            if (rowMatches && index < 3) {
                if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: Row ${index} MATCHED filter`);
            }
            
            return rowMatches;
        });
        
        logger.debug(`Filter result: ${filtered.length} rows matched out of ${data.length} total`);
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG applyFilter: Final result = ${filtered.length} rows matched out of ${data.length} total`);
        logger.info(`Final data loaded: ${filtered.length} rows for ${data.length > 0 ? 'data source' : 'empty data'}`);
        return filtered;
    }

    async filterByExecutionFlag(
        data: TestData[], 
        options: DataProviderOptions
    ): Promise<TestData[]> {
        if (options.skipExecutionFlag) {
            return data;
        }
        
        const columnName = options.executionFlagColumn || this.config.executionFlagColumn;
        
        const possibleColumns = ['executeTest', 'ExecuteTest', 'ExecutionFlag', 'executionFlag', 'Execute', 'execute'];
        let actualColumn = columnName;
        
        if (data.length > 0) {
            const firstRow = data[0];
            if (firstRow) {
                for (const col of possibleColumns) {
                    if (col in firstRow) {
                        actualColumn = col;
                        logger.debug(`Found execution flag column: ${actualColumn}`);
                        break;
                    }
                }
            }
        }
        
        const filtered = this.flagValidator.filterByExecutionFlag(data, 'execute', {
            flagColumn: actualColumn,
            environment: ConfigurationManager.getEnvironmentName(),
            defaultFlag: this.config.defaultExecutionFlag,
            executeValues: ['Y', 'Yes', 'TRUE', 'true', '1', 'Execute', 'Run', 'T'],
            skipValues: ['N', 'No', 'FALSE', 'false', '0', 'Skip', 'Ignore', 'F'],
            caseInsensitive: true,
            trimValues: true
        });
        
        for (const row of filtered) {
            row._execute = true;
        }
        
        logger.debug(`Filtered data: ${filtered.length} rows out of ${data.length} total rows`);
        
        return filtered;
    }

    private async validateData(data: TestData[], options: DataProviderOptions): Promise<void> {
        const validationRules: Record<string, any> = {};
        
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
        
        if (options.schemaPath) {
            const schema = await this.loadSchema(options.schemaPath);
            const schemaResult = await this.schemaValidator.validate(data, schema);
            
            if (!schemaResult.valid) {
                throw new Error(`Schema validation failed: ${schemaResult.errors.map(e => e.message).join(', ')}`);
            }
        }
    }

    createIterator(dataId: string): DataIterator {
        const data = this.loadedData.get(dataId);
        if (!data) {
            throw new Error(`No data found for ID: ${dataId}`);
        }
        
        return new DataIterator(data);
    }

    getData(dataId: string): TestData[] | undefined {
        return this.loadedData.get(dataId);
    }

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

    clearCache(pattern?: string): void {
        const loadedDataCount = this.loadedData.size;
        
        if (pattern) {
            this.cache.clearPattern(pattern);
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

    async cleanup(dataId?: string): Promise<void> {
        if (dataId) {
            this.loadedData.delete(dataId);
            await this.cleanupManager.cleanup(dataId);
        } else {
            this.loadedData.clear();
            await this.cleanupManager.cleanupAll();
        }
    }

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

    private async resolveDataSource(options: DataProviderOptions): Promise<string> {
        if (options.featurePath) {
            const featureDir = path.dirname(options.featurePath);
            const featureDataPath = path.join(featureDir, 'data', `${options.scenarioName}.xlsx`);
            
            if (await this.fileExists(featureDataPath)) {
                return featureDataPath;
            }
        }
        
        const defaultPath = path.join(
            this.config.defaultDataPath,
            `${options.scenarioName || 'test-data'}.xlsx`
        );
        
        if (await this.fileExists(defaultPath)) {
            return defaultPath;
        }
        
        throw new Error(`Could not resolve data source for scenario: ${options.scenarioName}`);
    }

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
                if (source.includes('://') || source.includes('server=')) {
                    return 'database';
                }
                return 'file';
        }
    }

    private async loadSchema(schemaPath: string): Promise<any> {
        const absolutePath = path.isAbsolute(schemaPath) 
            ? schemaPath 
            : path.join(this.config.defaultDataPath, 'schemas', schemaPath);
            
        const content = await fs.readFile(absolutePath, 'utf-8');
        return JSON.parse(content);
    }

    private generateCacheKey(options: DataProviderOptions): string {
        return `${options.source}_${options.type}_${JSON.stringify(options.filter || {})}`;
    }

    private generateDataId(options: DataProviderOptions): string {
        return `${options.scenarioName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

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
    
    limitCacheSizes(): void {
        const MAX_LOADED_DATA_SOURCES = 50;
        const MAX_RECORDS_PER_SOURCE = 10000;
        
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
        
    }

    async loadTestData(scenarioId: string): Promise<TestData[]> {
        try {
            return [];
        } catch (error) {
            ActionLogger.logError(`Failed to load test data for scenario: ${scenarioId}`, error as Error);
            return [];
        }
    }

    setTestData(scenarioId: string, data: TestData[]): void {
        this.testData.set(scenarioId, data);
    }

    getTestData(scenarioId: string): TestData[] {
        return this.testData.get(scenarioId) || [];
    }

    clearTestData(): void {
        this.testData.clear();
    }

    async loadFromTag(tag: string): Promise<TestData[]> {
        try {
            const optionsMatch = tag.match(/@DataProvider\((.*)\)/);
            if (!optionsMatch || !optionsMatch[1]) {
                throw new Error(`Invalid @DataProvider tag format: ${tag}`);
            }

            const optionsString = optionsMatch[1];
            const options: DataProviderOptions = this.parseTagValue(optionsString);
            
            ActionLogger.logDebug('DataProvider', `Parsed options from tag: ${JSON.stringify(options)}`);
            
            return await this.loadData(options);
        } catch (error) {
            ActionLogger.logError('Failed to load data from tag', error as Error);
            throw error;
        }
    }
}
